use anyhow::{anyhow, Context, Result};
use distill_core::{
    GenerateConfig, GenerateSummary, GeneratedQa, QaShard, QuestionPlan, TopicSpec,
};
use futures_util::stream::{FuturesUnordered, StreamExt};
use reqwest::header::{HeaderMap, HeaderValue, AUTHORIZATION, CONTENT_TYPE};
use serde::{Deserialize, Serialize};
use serde_json::json;
use std::path::Path;
use std::sync::Arc;
use tokio::sync::Semaphore;
use tokio::time::{sleep, Duration};

#[derive(Debug, Clone, Serialize, Deserialize)]
struct DraftQa {
    question: String,
    answer: String,
    source_type: Option<String>,
    grounding: Option<String>,
}

#[derive(Debug, Clone)]
struct BatchRequest {
    shard_id: usize,
    shard_offset: usize,
    global_offset: usize,
    count: usize,
    plan: QuestionPlan,
}

#[derive(Debug)]
struct BatchResult {
    shard_offset: usize,
    items: Vec<GeneratedQa>,
}

#[derive(Debug, Deserialize)]
struct ChatCompletionResponse {
    choices: Vec<ChatChoice>,
}

#[derive(Debug, Deserialize)]
struct ChatChoice {
    message: ChatMessage,
}

#[derive(Debug, Deserialize)]
struct ChatMessage {
    content: Option<String>,
}

pub async fn generate_to_directory(
    topic: &TopicSpec,
    plans: &[QuestionPlan],
    config: &GenerateConfig,
    output_dir: &Path,
) -> Result<GenerateSummary> {
    if plans.is_empty() {
        return Err(anyhow!("question plans are empty"));
    }
    if config.runtime.shard_size == 0 {
        return Err(anyhow!("shard_size must be greater than zero"));
    }
    if config.runtime.batch_size == 0 {
        return Err(anyhow!("batch_size must be greater than zero"));
    }

    tokio::fs::create_dir_all(output_dir).await?;

    let shard_count = config
        .runtime
        .target_count
        .div_ceil(config.runtime.shard_size);

    let mut completed_shards = 0usize;
    let mut skipped_shards = 0usize;
    let mut generated_count = 0usize;
    let mut request_count = 0usize;

    let client = build_client(config)?;

    for shard_id in 0..shard_count {
        let shard_path = output_dir.join(format!("shard_{:04}.json", shard_id));
        let shard_target = shard_target_count(config, shard_id);

        if config.runtime.resume && tokio::fs::try_exists(&shard_path).await? {
            let existing = tokio::fs::read_to_string(&shard_path).await?;
            let shard: QaShard = serde_json::from_str(&existing)?;
            skipped_shards += 1;
            generated_count += shard.item_count;
            continue;
        }

        let shard = generate_one_shard(topic, plans, config, &client, shard_id, shard_target)
            .await
            .with_context(|| format!("failed generating shard {shard_id}"))?;

        request_count += shard.item_count.div_ceil(config.runtime.batch_size);
        generated_count += shard.item_count;
        completed_shards += 1;

        tokio::fs::write(&shard_path, serde_json::to_string_pretty(&shard)?).await?;
    }

    let summary = GenerateSummary {
        topic_name: topic.topic_name.clone(),
        target_count: config.runtime.target_count,
        generated_count,
        shard_count,
        completed_shards,
        skipped_shards,
        shard_size: config.runtime.shard_size,
        batch_size: config.runtime.batch_size,
        request_count,
        provider: config.provider.provider.clone(),
        model: config.provider.model.clone(),
    };

    let summary_path = output_dir.join("summary.json");
    tokio::fs::write(summary_path, serde_json::to_string_pretty(&summary)?).await?;

    Ok(summary)
}

async fn generate_one_shard(
    topic: &TopicSpec,
    plans: &[QuestionPlan],
    config: &GenerateConfig,
    client: &reqwest::Client,
    shard_id: usize,
    shard_target: usize,
) -> Result<QaShard> {
    let start_index = shard_id * config.runtime.shard_size;
    let requests = build_batch_requests(plans, config, shard_id, shard_target);
    let semaphore = Arc::new(Semaphore::new(config.runtime.max_in_flight.max(1)));
    let mut inflight = FuturesUnordered::new();

    for request in requests {
        let permit = semaphore.clone().acquire_owned().await?;
        let client = client.clone();
        let topic = topic.clone();
        let config = config.clone();
        inflight.push(tokio::spawn(async move {
            let _permit = permit;
            run_batch_request(&client, &topic, &request.plan, &config, &request).await
        }));
    }

    let mut collected = Vec::new();
    while let Some(joined) = inflight.next().await {
        let result = joined??;
        collected.push(result);
    }

    collected.sort_by_key(|result| result.shard_offset);

    let mut items = Vec::with_capacity(shard_target);
    for result in collected {
        items.extend(result.items);
    }
    items.truncate(shard_target);

    Ok(QaShard {
        shard_id,
        topic_name: topic.topic_name.clone(),
        item_count: items.len(),
        start_index,
        end_index: start_index + items.len().saturating_sub(1),
        items,
    })
}

fn build_batch_requests(
    plans: &[QuestionPlan],
    config: &GenerateConfig,
    shard_id: usize,
    shard_target: usize,
) -> Vec<BatchRequest> {
    let start_index = shard_id * config.runtime.shard_size;
    let mut requests = Vec::new();
    let mut shard_offset = 0usize;

    while shard_offset < shard_target {
        let count = config
            .runtime
            .batch_size
            .min(shard_target.saturating_sub(shard_offset));
        let global_offset = start_index + shard_offset;
        let plan = plans[(global_offset / config.runtime.batch_size) % plans.len()].clone();
        requests.push(BatchRequest {
            shard_id,
            shard_offset,
            global_offset,
            count,
            plan,
        });
        shard_offset += count;
    }

    requests
}

async fn run_batch_request(
    client: &reqwest::Client,
    topic: &TopicSpec,
    plan: &QuestionPlan,
    config: &GenerateConfig,
    request: &BatchRequest,
) -> Result<BatchResult> {
    let drafts = generate_batch_with_retries(client, topic, plan, config, request.count).await?;
    let items = drafts
        .into_iter()
        .enumerate()
        .map(|(idx, draft)| GeneratedQa {
            id: format!("{}-{:06}", slugify(&topic.topic_name), request.global_offset + idx),
            shard_id: request.shard_id,
            topic_name: topic.topic_name.clone(),
            subtopic: plan.subtopic.clone(),
            axis: plan.axis.clone(),
            question_type: plan.question_type.clone(),
            difficulty: plan.difficulty.clone(),
            audience: plan.audience.clone(),
            question: draft.question,
            answer: draft.answer,
            source_type: draft
                .source_type
                .unwrap_or_else(|| "model_synthesized".to_string()),
            grounding: draft.grounding.unwrap_or_else(|| "derived".to_string()),
            provider: config.provider.provider.clone(),
            model: config.provider.model.clone(),
        })
        .collect();

    Ok(BatchResult {
        shard_offset: request.shard_offset,
        items,
    })
}

async fn generate_batch_with_retries(
    client: &reqwest::Client,
    topic: &TopicSpec,
    plan: &QuestionPlan,
    config: &GenerateConfig,
    count: usize,
) -> Result<Vec<DraftQa>> {
    let mut attempt = 0u32;
    loop {
        let result = match config.provider.provider.as_str() {
            "openai-compatible" => {
                generate_batch_openai_compatible(client, topic, plan, config, count).await
            }
            "stub" => Ok(generate_stub_batch(topic, plan, config, count)),
            other => Err(anyhow!("unsupported provider `{other}`")),
        };

        match result {
            Ok(items) => return Ok(items),
            Err(err) if attempt < config.runtime.max_retries => {
                attempt += 1;
                let backoff = 2u64.pow(attempt).min(30);
                sleep(Duration::from_secs(backoff)).await;
                if attempt >= config.runtime.max_retries {
                    return Err(err);
                }
            }
            Err(err) => return Err(err),
        }
    }
}

async fn generate_batch_openai_compatible(
    client: &reqwest::Client,
    topic: &TopicSpec,
    plan: &QuestionPlan,
    config: &GenerateConfig,
    count: usize,
) -> Result<Vec<DraftQa>> {
    let base_url = config
        .provider
        .base_url
        .as_deref()
        .ok_or_else(|| anyhow!("base_url is required for openai-compatible provider"))?;

    let url = format!("{}/chat/completions", base_url.trim_end_matches('/'));
    let system_prompt = "You generate training QA data. Return valid JSON only.";
    let user_prompt = build_user_prompt(topic, plan, count);

    let response = client
        .post(url)
        .json(&json!({
            "model": config.provider.model,
            "temperature": config.provider.temperature,
            "max_tokens": config.provider.max_tokens,
            "response_format": { "type": "json_object" },
            "messages": [
                { "role": "system", "content": system_prompt },
                { "role": "user", "content": user_prompt }
            ]
        }))
        .send()
        .await?
        .error_for_status()?;

    let payload: ChatCompletionResponse = response.json().await?;
    let content = payload
        .choices
        .into_iter()
        .next()
        .and_then(|choice| choice.message.content)
        .ok_or_else(|| anyhow!("provider returned no message content"))?;

    parse_model_json(&content, count)
}

fn parse_model_json(content: &str, expected_count: usize) -> Result<Vec<DraftQa>> {
    let parsed = extract_json_object(content)?;
    let items = parsed
        .get("items")
        .cloned()
        .ok_or_else(|| anyhow!("response JSON missing `items` field"))?;
    let mut drafts: Vec<DraftQa> = serde_json::from_value(items)?;

    if drafts.len() < expected_count {
        return Err(anyhow!(
            "provider returned {} items, expected at least {}",
            drafts.len(),
            expected_count
        ));
    }

    drafts.truncate(expected_count);
    Ok(drafts)
}

fn extract_json_object(content: &str) -> Result<serde_json::Value> {
    if let Ok(value) = serde_json::from_str(content) {
        return Ok(value);
    }

    let fenced = content
        .split("```")
        .find_map(|segment| {
            let trimmed = segment.trim();
            if trimmed.starts_with('{') && trimmed.ends_with('}') {
                Some(trimmed)
            } else if let Some(rest) = trimmed.strip_prefix("json") {
                let rest = rest.trim();
                if rest.starts_with('{') && rest.ends_with('}') {
                    Some(rest)
                } else {
                    None
                }
            } else {
                None
            }
        })
        .ok_or_else(|| anyhow!("failed to locate JSON object in model response"))?;

    Ok(serde_json::from_str(fenced)?)
}

fn build_user_prompt(topic: &TopicSpec, plan: &QuestionPlan, count: usize) -> String {
    let topic_keywords = topic.keywords.join(", ");
    format!(
        "Topic: {topic}\nGoal: {goal}\nUser intent: {intent}\nTopic keywords: {topic_keywords}\nSubtopic: {subtopic}\nSubtopic intent: {subtopic_intent}\nAxis: {axis}\nQuestion type: {question_type}\nDifficulty: {difficulty}\nAudience: {audience}\n\nGenerate {count} diverse QA pairs as JSON with this schema:\n{{\"items\":[{{\"question\":\"...\",\"answer\":\"...\",\"source_type\":\"model_synthesized\",\"grounding\":\"derived\"}}]}}\n\nRules:\n- Every question must explicitly stay within the exact topic, not generic crop breeding trivia.\n- Each QA pair must mention or strongly imply at least two topic-specific concepts from this set: {topic_keywords}.\n- At least half of the questions should directly mention either planting density, seed oil, seed protein, or breeding strategy when those concepts are present in the topic.\n- Use the subtopic `{subtopic}` and axis `{axis}` as hard constraints.\n- Keep questions meaningfully distinct from each other.\n- Answers should be concise, informative, and tied to the same topic scope as the question.\n- Avoid broad soybean facts unless they are clearly connected to the topic above.\n- Do not include markdown fences or commentary.\n- Return JSON only.",
        topic = topic.topic_name,
        goal = topic.goal,
        intent = topic.user_intent,
        topic_keywords = topic_keywords,
        subtopic = plan.subtopic,
        subtopic_intent = infer_subtopic_intent(topic, plan),
        axis = plan.axis,
        question_type = plan.question_type,
        difficulty = plan.difficulty,
        audience = plan.audience,
        count = count
    )
}

fn generate_stub_batch(
    topic: &TopicSpec,
    plan: &QuestionPlan,
    config: &GenerateConfig,
    count: usize,
) -> Vec<DraftQa> {
    (0..count)
        .map(|idx| DraftQa {
            question: format!(
                "For {}, what does {} reveal about {} in {} context {}?",
                topic.topic_name,
                plan.axis,
                plan.subtopic,
                plan.question_type,
                idx + 1
            ),
            answer: format!(
                "This synthetic answer explains how {} relates to {} for a {} audience. It is generated by the {} provider scaffold and is intended as a stable placeholder until live API generation is enabled.",
                plan.subtopic, plan.axis, plan.audience, config.provider.provider
            ),
            source_type: Some("model_synthesized".to_string()),
            grounding: Some("derived".to_string()),
        })
        .collect()
}

fn infer_subtopic_intent(topic: &TopicSpec, plan: &QuestionPlan) -> String {
    topic
        .subtopics
        .iter()
        .find(|item| item.name == plan.subtopic)
        .map(|item| item.intent.clone())
        .unwrap_or_else(|| format!("Expand {} under {}", plan.subtopic, topic.topic_name))
}

fn build_client(config: &GenerateConfig) -> Result<reqwest::Client> {
    let mut headers = HeaderMap::new();
    headers.insert(CONTENT_TYPE, HeaderValue::from_static("application/json"));

    if let Some(value) = &config.provider.api_key {
        let bearer = format!("Bearer {value}");
        headers.insert(
            AUTHORIZATION,
            HeaderValue::from_str(&bearer)
                .context("invalid authorization header from configured api_key")?,
        );
    } else if let Some(env_name) = &config.provider.api_key_env {
        if let Ok(value) = std::env::var(env_name) {
            let bearer = format!("Bearer {value}");
            headers.insert(
                AUTHORIZATION,
                HeaderValue::from_str(&bearer)
                    .with_context(|| format!("invalid authorization header from {env_name}"))?,
            );
        }
    }

    Ok(reqwest::Client::builder()
        .default_headers(headers)
        .timeout(Duration::from_secs(config.runtime.request_timeout_secs))
        .build()?)
}

fn shard_target_count(config: &GenerateConfig, shard_id: usize) -> usize {
    let start = shard_id * config.runtime.shard_size;
    config
        .runtime
        .target_count
        .saturating_sub(start)
        .min(config.runtime.shard_size)
}

fn slugify(text: &str) -> String {
    let mut slug = text
        .chars()
        .map(|c| {
            if c.is_alphanumeric() {
                c.to_ascii_lowercase()
            } else {
                '-'
            }
        })
        .collect::<String>();
    while slug.contains("--") {
        slug = slug.replace("--", "-");
    }
    slug.trim_matches('-').to_string()
}
