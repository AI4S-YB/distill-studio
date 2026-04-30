use anyhow::{anyhow, Context, Result};
use distill_core::{
    default_cot_section_headers_for_language, GenerateConfig, GenerateSummary, GeneratedQa,
    QaShard, QuestionPlan, TopicSpec,
};
use futures_util::stream::{FuturesUnordered, StreamExt};
use reqwest::header::{HeaderMap, HeaderValue, AUTHORIZATION, CONTENT_TYPE};
use serde::{Deserialize, Serialize};
use serde_json::json;
use std::collections::BTreeMap;
use std::future::{pending, Future};
use std::path::Path;
use std::sync::{
    atomic::{AtomicBool, Ordering},
    Arc,
};
use std::time::Instant;
use tokio::sync::Semaphore;
use tokio::time::{sleep, Duration};

const CANCEL_POLL_INTERVAL_MS: u64 = 100;
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
    batch_index: usize,
    batch_count_in_shard: usize,
    plan: QuestionPlan,
}

#[derive(Debug)]
struct BatchResult {
    shard_offset: usize,
    items: Vec<GeneratedQa>,
    count: usize,
    batch_index: usize,
    batch_count_in_shard: usize,
    duration_ms: u64,
    plan: QuestionPlan,
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

#[derive(Debug, Clone, Copy)]
pub enum RuntimeProgressKind {
    ShardStarted,
    ShardSkipped,
    BatchStarted,
    BatchCompleted,
    ShardCompleted,
    BatchRetry,
    BatchFailed,
}

#[derive(Debug, Clone)]
pub struct RuntimeProgress {
    pub kind: RuntimeProgressKind,
    pub shard_index: usize,
    pub shard_count: usize,
    pub shard_item_completed: Option<usize>,
    pub shard_item_total: Option<usize>,
    pub total_generated: Option<usize>,
    pub target_count: Option<usize>,
    pub retry_attempt: Option<u32>,
    pub retry_limit: Option<u32>,
    pub attempt_number: Option<u32>,
    pub attempt_limit: Option<u32>,
    pub error_message: Option<String>,
    pub batch_index: Option<usize>,
    pub batch_count_in_shard: Option<usize>,
    pub batch_size: Option<usize>,
    pub duration_ms: Option<u64>,
    pub backoff_secs: Option<u64>,
    pub subtopic: Option<String>,
    pub axis: Option<String>,
    pub question_type: Option<String>,
    pub difficulty: Option<String>,
    pub audience: Option<String>,
}

pub type RuntimeProgressCallback = dyn Fn(RuntimeProgress) + Send + Sync;

pub async fn generate_to_directory(
    topic: &TopicSpec,
    plans: &[QuestionPlan],
    config: &GenerateConfig,
    output_dir: &Path,
) -> Result<GenerateSummary> {
    generate_to_directory_with_progress(topic, plans, config, output_dir, None, None).await
}

pub async fn generate_to_directory_with_progress(
    topic: &TopicSpec,
    plans: &[QuestionPlan],
    config: &GenerateConfig,
    output_dir: &Path,
    progress: Option<&RuntimeProgressCallback>,
    cancel_flag: Option<&AtomicBool>,
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
        check_canceled(cancel_flag)?;

        let shard_path = output_dir.join(format!("shard_{:04}.json", shard_id));
        let shard_target = shard_target_count(config, shard_id);
        let shard_index = shard_id + 1;
        let existing_shard = if config.runtime.resume && tokio::fs::try_exists(&shard_path).await? {
            let existing = tokio::fs::read_to_string(&shard_path).await?;
            Some(serde_json::from_str::<QaShard>(&existing)?)
        } else {
            None
        };
        let existing_completed_count = existing_shard
            .as_ref()
            .map(|shard| shard.items.len().min(shard_target))
            .unwrap_or(0);
        emit_runtime_progress(
            progress,
            RuntimeProgress {
                kind: RuntimeProgressKind::ShardStarted,
                shard_index,
                shard_count,
                shard_item_completed: Some(existing_completed_count),
                shard_item_total: Some(shard_target),
                total_generated: Some(generated_count + existing_completed_count),
                target_count: Some(config.runtime.target_count),
                retry_attempt: None,
                retry_limit: None,
                attempt_number: None,
                attempt_limit: None,
                error_message: None,
                batch_index: None,
                batch_count_in_shard: None,
                batch_size: None,
                duration_ms: None,
                backoff_secs: None,
                subtopic: None,
                axis: None,
                question_type: None,
                difficulty: None,
                audience: None,
            },
        );

        if let Some(shard) = existing_shard
            .as_ref()
            .filter(|shard| shard.completed && shard.items.len().min(shard_target) >= shard_target)
        {
            skipped_shards += 1;
            request_count += shard.item_count.div_ceil(config.runtime.batch_size);
            generated_count += shard.item_count;
            emit_runtime_progress(
                progress,
                RuntimeProgress {
                    kind: RuntimeProgressKind::ShardSkipped,
                    shard_index,
                    shard_count,
                    shard_item_completed: Some(shard.item_count),
                    shard_item_total: Some(shard_target),
                    total_generated: Some(generated_count),
                    target_count: Some(config.runtime.target_count),
                    retry_attempt: None,
                    retry_limit: None,
                    attempt_number: None,
                    attempt_limit: None,
                    error_message: None,
                    batch_index: None,
                    batch_count_in_shard: None,
                    batch_size: None,
                    duration_ms: None,
                    backoff_secs: None,
                    subtopic: None,
                    axis: None,
                    question_type: None,
                    difficulty: None,
                    audience: None,
                },
            );
            continue;
        }

        let shard = generate_one_shard(
            topic,
            plans,
            config,
            &client,
            &shard_path,
            shard_id,
            shard_count,
            shard_target,
            generated_count,
            existing_shard,
            progress,
            cancel_flag,
        )
        .await
        .with_context(|| format!("failed generating shard {shard_id}"))?;

        request_count += shard.item_count.div_ceil(config.runtime.batch_size);
        generated_count += shard.item_count;
        completed_shards += 1;

        tokio::fs::write(&shard_path, serde_json::to_string_pretty(&shard)?).await?;
        emit_runtime_progress(
            progress,
            RuntimeProgress {
                kind: RuntimeProgressKind::ShardCompleted,
                shard_index,
                shard_count,
                shard_item_completed: Some(shard.item_count),
                shard_item_total: Some(shard_target),
                total_generated: Some(generated_count),
                target_count: Some(config.runtime.target_count),
                retry_attempt: None,
                retry_limit: None,
                attempt_number: None,
                attempt_limit: None,
                error_message: None,
                batch_index: None,
                batch_count_in_shard: None,
                batch_size: None,
                duration_ms: None,
                backoff_secs: None,
                subtopic: None,
                axis: None,
                question_type: None,
                difficulty: None,
                audience: None,
            },
        );
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
        qa_mode: config.qa_mode.clone(),
    };

    let summary_path = output_dir.join("summary.json");
    tokio::fs::write(summary_path, serde_json::to_string_pretty(&summary)?).await?;

    Ok(summary)
}

#[allow(clippy::too_many_arguments)]
async fn generate_one_shard(
    topic: &TopicSpec,
    plans: &[QuestionPlan],
    config: &GenerateConfig,
    client: &reqwest::Client,
    shard_path: &Path,
    shard_id: usize,
    shard_count: usize,
    shard_target: usize,
    generated_before_shard: usize,
    existing_shard: Option<QaShard>,
    progress: Option<&RuntimeProgressCallback>,
    cancel_flag: Option<&AtomicBool>,
) -> Result<QaShard> {
    let start_index = shard_id * config.runtime.shard_size;
    let mut persisted_items = existing_shard
        .map(|shard| {
            shard
                .items
                .into_iter()
                .take(shard_target)
                .collect::<Vec<_>>()
        })
        .unwrap_or_default();
    let initial_completed = persisted_items.len();
    let requests = build_batch_requests(plans, config, shard_id, shard_target, initial_completed);
    let semaphore = Arc::new(Semaphore::new(config.runtime.max_in_flight.max(1)));
    let mut inflight = FuturesUnordered::new();

    for request in requests {
        check_canceled(cancel_flag)?;
        let client = client.clone();
        let topic = topic.clone();
        let config = config.clone();
        let request = request.clone();
        let semaphore = semaphore.clone();
        inflight.push(async move {
            let permit = run_with_cancel(semaphore.acquire_owned(), cancel_flag).await?;
            let _permit = permit;
            check_canceled(cancel_flag)?;
            run_batch_request(
                &client,
                &topic,
                &request.plan,
                &config,
                &request,
                progress,
                cancel_flag,
            )
            .await
        });
    }

    let mut pending_results = BTreeMap::new();
    let mut next_persist_offset = initial_completed;
    while let Some(result) = inflight.next().await {
        check_canceled(cancel_flag)?;
        let result = result?;
        pending_results.insert(result.shard_offset, result);

        while let Some(next_result) = pending_results.remove(&next_persist_offset) {
            persisted_items.extend(next_result.items);
            next_persist_offset = persisted_items.len();
            let shard = build_shard(topic, shard_id, start_index, &persisted_items, false);
            tokio::fs::write(shard_path, serde_json::to_string_pretty(&shard)?).await?;
            emit_runtime_progress(
                progress,
                RuntimeProgress {
                    kind: RuntimeProgressKind::BatchCompleted,
                    shard_index: shard_id + 1,
                    shard_count,
                    shard_item_completed: Some(next_persist_offset.min(shard_target)),
                    shard_item_total: Some(shard_target),
                    total_generated: Some(
                        generated_before_shard + next_persist_offset.min(shard_target),
                    ),
                    target_count: Some(config.runtime.target_count),
                    retry_attempt: None,
                    retry_limit: None,
                    attempt_number: None,
                    attempt_limit: None,
                    error_message: None,
                    batch_index: Some(next_result.batch_index),
                    batch_count_in_shard: Some(next_result.batch_count_in_shard),
                    batch_size: Some(next_result.count),
                    duration_ms: Some(next_result.duration_ms),
                    backoff_secs: None,
                    subtopic: Some(next_result.plan.subtopic.clone()),
                    axis: Some(next_result.plan.axis.clone()),
                    question_type: Some(next_result.plan.question_type.clone()),
                    difficulty: Some(next_result.plan.difficulty.clone()),
                    audience: Some(next_result.plan.audience.clone()),
                },
            );
        }
    }

    persisted_items.truncate(shard_target);
    let shard = build_shard(topic, shard_id, start_index, &persisted_items, true);
    tokio::fs::write(shard_path, serde_json::to_string_pretty(&shard)?).await?;
    Ok(shard)
}

fn emit_runtime_progress(progress: Option<&RuntimeProgressCallback>, event: RuntimeProgress) {
    if let Some(callback) = progress {
        callback(event);
    }
}

async fn wait_for_cancel(cancel_flag: Option<&AtomicBool>) {
    let Some(flag) = cancel_flag else {
        pending::<()>().await;
        return;
    };

    while !flag.load(Ordering::Relaxed) {
        sleep(Duration::from_millis(CANCEL_POLL_INTERVAL_MS)).await;
    }
}

async fn run_with_cancel<F, T, E>(future: F, cancel_flag: Option<&AtomicBool>) -> Result<T>
where
    F: Future<Output = std::result::Result<T, E>>,
    E: Into<anyhow::Error>,
{
    tokio::select! {
        result = future => result.map_err(Into::into),
        _ = wait_for_cancel(cancel_flag) => Err(anyhow!("pipeline canceled by user")),
    }
}

async fn cancelable_sleep(duration: Duration, cancel_flag: Option<&AtomicBool>) -> Result<()> {
    tokio::select! {
        _ = sleep(duration) => Ok(()),
        _ = wait_for_cancel(cancel_flag) => Err(anyhow!("pipeline canceled by user")),
    }
}

fn check_canceled(cancel_flag: Option<&AtomicBool>) -> Result<()> {
    if cancel_flag.is_some_and(|flag| flag.load(Ordering::Relaxed)) {
        return Err(anyhow!("pipeline canceled by user"));
    }

    Ok(())
}

fn build_batch_requests(
    plans: &[QuestionPlan],
    config: &GenerateConfig,
    shard_id: usize,
    shard_target: usize,
    start_offset: usize,
) -> Vec<BatchRequest> {
    let start_index = shard_id * config.runtime.shard_size;
    let batch_count_in_shard = shard_target.div_ceil(config.runtime.batch_size);
    let mut requests = Vec::new();
    let mut shard_offset = start_offset;
    let mut batch_index = start_offset / config.runtime.batch_size;

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
            batch_index: batch_index + 1,
            batch_count_in_shard,
            plan,
        });
        shard_offset += count;
        batch_index += 1;
    }

    requests
}

fn build_shard(
    topic: &TopicSpec,
    shard_id: usize,
    start_index: usize,
    items: &[GeneratedQa],
    completed: bool,
) -> QaShard {
    QaShard {
        shard_id,
        topic_name: topic.topic_name.clone(),
        item_count: items.len(),
        start_index,
        end_index: start_index + items.len().saturating_sub(1),
        completed,
        items: items.to_vec(),
    }
}

async fn run_batch_request(
    client: &reqwest::Client,
    topic: &TopicSpec,
    plan: &QuestionPlan,
    config: &GenerateConfig,
    request: &BatchRequest,
    progress: Option<&RuntimeProgressCallback>,
    cancel_flag: Option<&AtomicBool>,
) -> Result<BatchResult> {
    let shard_count = config
        .runtime
        .target_count
        .div_ceil(config.runtime.shard_size);
    let request_started_at = Instant::now();
    let drafts = generate_batch_with_retries(
        client,
        topic,
        plan,
        config,
        request,
        shard_count,
        progress,
        cancel_flag,
    )
    .await?;
    let items = drafts
        .into_iter()
        .enumerate()
        .map(|(idx, draft)| GeneratedQa {
            id: format!(
                "{}-{:06}",
                slugify(&topic.topic_name),
                request.global_offset + idx
            ),
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
            qa_mode: config.qa_mode.clone(),
        })
        .collect();

    Ok(BatchResult {
        shard_offset: request.shard_offset,
        items,
        count: request.count,
        batch_index: request.batch_index,
        batch_count_in_shard: request.batch_count_in_shard,
        duration_ms: duration_ms(request_started_at.elapsed()),
        plan: plan.clone(),
    })
}

#[allow(clippy::too_many_arguments)]
async fn generate_batch_with_retries(
    client: &reqwest::Client,
    topic: &TopicSpec,
    plan: &QuestionPlan,
    config: &GenerateConfig,
    request: &BatchRequest,
    shard_count: usize,
    progress: Option<&RuntimeProgressCallback>,
    cancel_flag: Option<&AtomicBool>,
) -> Result<Vec<DraftQa>> {
    let mut attempt = 0u32;
    let attempt_limit = config.runtime.max_retries.saturating_add(1);
    loop {
        check_canceled(cancel_flag)?;
        emit_runtime_progress(
            progress,
            RuntimeProgress {
                kind: RuntimeProgressKind::BatchStarted,
                shard_index: request.shard_id + 1,
                shard_count,
                shard_item_completed: None,
                shard_item_total: None,
                total_generated: None,
                target_count: Some(config.runtime.target_count),
                retry_attempt: None,
                retry_limit: None,
                attempt_number: Some(attempt.saturating_add(1)),
                attempt_limit: Some(attempt_limit),
                error_message: None,
                batch_index: Some(request.batch_index),
                batch_count_in_shard: Some(request.batch_count_in_shard),
                batch_size: Some(request.count),
                duration_ms: None,
                backoff_secs: None,
                subtopic: Some(plan.subtopic.clone()),
                axis: Some(plan.axis.clone()),
                question_type: Some(plan.question_type.clone()),
                difficulty: Some(plan.difficulty.clone()),
                audience: Some(plan.audience.clone()),
            },
        );
        let attempt_started_at = Instant::now();
        let result = match config.provider.provider.as_str() {
            "openai-compatible" => {
                run_with_cancel(
                    generate_batch_openai_compatible(client, topic, plan, config, request.count),
                    cancel_flag,
                )
                .await
            }
            "stub" => {
                check_canceled(cancel_flag)?;
                Ok(generate_stub_batch(topic, plan, config, request.count))
            }
            other => Err(anyhow!("unsupported provider `{other}`")),
        };

        match result {
            Ok(items) => return Ok(items),
            Err(err) if attempt < config.runtime.max_retries => {
                attempt += 1;
                emit_runtime_progress(
                    progress,
                    RuntimeProgress {
                        kind: RuntimeProgressKind::BatchRetry,
                        shard_index: request.shard_id + 1,
                        shard_count,
                        shard_item_completed: None,
                        shard_item_total: None,
                        total_generated: None,
                        target_count: Some(config.runtime.target_count),
                        retry_attempt: Some(attempt),
                        retry_limit: Some(config.runtime.max_retries),
                        attempt_number: Some(attempt),
                        attempt_limit: Some(attempt_limit),
                        error_message: Some(err.to_string()),
                        batch_index: Some(request.batch_index),
                        batch_count_in_shard: Some(request.batch_count_in_shard),
                        batch_size: Some(request.count),
                        duration_ms: Some(duration_ms(attempt_started_at.elapsed())),
                        backoff_secs: Some(2u64.pow(attempt).min(30)),
                        subtopic: Some(plan.subtopic.clone()),
                        axis: Some(plan.axis.clone()),
                        question_type: Some(plan.question_type.clone()),
                        difficulty: Some(plan.difficulty.clone()),
                        audience: Some(plan.audience.clone()),
                    },
                );
                let backoff = 2u64.pow(attempt).min(30);
                cancelable_sleep(Duration::from_secs(backoff), cancel_flag).await?;
            }
            Err(err) => {
                emit_runtime_progress(
                    progress,
                    RuntimeProgress {
                        kind: RuntimeProgressKind::BatchFailed,
                        shard_index: request.shard_id + 1,
                        shard_count,
                        shard_item_completed: None,
                        shard_item_total: None,
                        total_generated: None,
                        target_count: Some(config.runtime.target_count),
                        retry_attempt: Some(attempt),
                        retry_limit: Some(config.runtime.max_retries),
                        attempt_number: Some(attempt.saturating_add(1)),
                        attempt_limit: Some(attempt_limit),
                        error_message: Some(err.to_string()),
                        batch_index: Some(request.batch_index),
                        batch_count_in_shard: Some(request.batch_count_in_shard),
                        batch_size: Some(request.count),
                        duration_ms: Some(duration_ms(attempt_started_at.elapsed())),
                        backoff_secs: None,
                        subtopic: Some(plan.subtopic.clone()),
                        axis: Some(plan.axis.clone()),
                        question_type: Some(plan.question_type.clone()),
                        difficulty: Some(plan.difficulty.clone()),
                        audience: Some(plan.audience.clone()),
                    },
                );
                return Err(err);
            }
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
    let system_prompt = "You generate training QA data. Reply with exactly one valid JSON object and no other text. Do not use markdown fences.";
    let user_prompt = build_user_prompt(topic, plan, config, count);

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

    let drafts = parse_model_json(&content, count)?;
    if config.qa_mode == "cot" {
        let headers = effective_cot_section_headers(config);
        validate_cot_drafts(&drafts, &headers)?;
    }
    Ok(drafts)
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

fn effective_cot_section_headers(config: &GenerateConfig) -> Vec<String> {
    let normalized = config
        .cot_section_headers
        .iter()
        .map(|value| value.trim().trim_end_matches(':').trim().to_string())
        .filter(|value| !value.is_empty())
        .collect::<Vec<_>>();
    if normalized.is_empty() {
        default_cot_section_headers_for_language(&config.output_language)
    } else {
        normalized
    }
}

fn validate_cot_drafts(drafts: &[DraftQa], headers: &[String]) -> Result<()> {
    for (index, draft) in drafts.iter().enumerate() {
        validate_cot_answer(&draft.answer, headers)
            .with_context(|| format!("invalid CoT answer structure for item {}", index + 1))?;
    }
    Ok(())
}

fn validate_cot_answer(answer: &str, headers: &[String]) -> Result<()> {
    let trimmed = answer.trim();
    if trimmed.is_empty() {
        return Err(anyhow!("answer is empty"));
    }

    let markers = headers
        .iter()
        .map(|header| format!("{header}:"))
        .collect::<Vec<_>>();
    let mut last_index = 0usize;
    for (position, marker) in markers.iter().enumerate() {
        let header = headers[position].as_str();
        let relative = trimmed[last_index..]
            .find(marker)
            .ok_or_else(|| anyhow!("missing section header `{header}`"))?;
        let absolute = last_index + relative;
        if position > 0 && absolute == last_index {
            return Err(anyhow!("section `{header}` is empty or out of order"));
        }
        last_index = absolute + marker.len();
    }

    for index in 0..headers.len().saturating_sub(1) {
        let current = headers[index].as_str();
        let next = headers[index + 1].as_str();
        let current_marker = &markers[index];
        let next_marker = &markers[index + 1];
        let current_index = trimmed
            .find(current_marker)
            .ok_or_else(|| anyhow!("missing section header `{current}`"))?;
        let next_index = trimmed
            .find(next_marker)
            .ok_or_else(|| anyhow!("missing section header `{next}`"))?;
        let body = trimmed[current_index + current_marker.len()..next_index].trim();
        if body.is_empty() {
            return Err(anyhow!("section `{current}` has no content"));
        }
    }

    let final_header = headers[headers.len() - 1].as_str();
    let final_marker = &markers[markers.len() - 1];
    let final_index = trimmed
        .find(final_marker)
        .ok_or_else(|| anyhow!("missing section header `{final_header}`"))?;
    let final_body = trimmed[final_index + final_marker.len()..].trim();
    if final_body.is_empty() {
        return Err(anyhow!("section `{final_header}` has no content"));
    }

    Ok(())
}

fn extract_json_object(content: &str) -> Result<serde_json::Value> {
    let trimmed = content.trim();

    if let Ok(value) = serde_json::from_str(trimmed) {
        return Ok(value);
    }

    let fenced = trimmed
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
        .ok_or_else(|| anyhow!("failed to locate fenced JSON object in model response"));

    if let Ok(fenced_json) =
        fenced.and_then(|json| serde_json::from_str(json).map_err(anyhow::Error::from))
    {
        return Ok(fenced_json);
    }

    extract_balanced_json_object(trimmed)
}

fn extract_balanced_json_object(content: &str) -> Result<serde_json::Value> {
    let bytes = content.as_bytes();
    let mut start = None;
    let mut depth = 0usize;
    let mut in_string = false;
    let mut escaped = false;

    for (idx, byte) in bytes.iter().enumerate() {
        if in_string {
            if escaped {
                escaped = false;
                continue;
            }

            match byte {
                b'\\' => escaped = true,
                b'"' => in_string = false,
                _ => {}
            }
            continue;
        }

        match byte {
            b'"' => in_string = true,
            b'{' => {
                if depth == 0 {
                    start = Some(idx);
                }
                depth += 1;
            }
            b'}' => {
                if depth == 0 {
                    continue;
                }

                depth -= 1;
                if depth == 0 {
                    if let Some(begin) = start {
                        let candidate = &content[begin..=idx];
                        if let Ok(value) = serde_json::from_str(candidate) {
                            return Ok(value);
                        }
                        start = None;
                    }
                }
            }
            _ => {}
        }
    }

    Err(anyhow!("failed to locate JSON object in model response"))
}

fn duration_ms(duration: Duration) -> u64 {
    duration.as_millis().min(u128::from(u64::MAX)) as u64
}

fn build_user_prompt(
    topic: &TopicSpec,
    plan: &QuestionPlan,
    config: &GenerateConfig,
    count: usize,
) -> String {
    if config.qa_mode == "cot" {
        return build_cot_user_prompt(topic, plan, config, count);
    }

    build_normal_user_prompt(topic, plan, config, count)
}

fn build_normal_user_prompt(
    topic: &TopicSpec,
    plan: &QuestionPlan,
    config: &GenerateConfig,
    count: usize,
) -> String {
    let topic_keywords = topic.keywords.join(", ");
    let language_instruction = if config.output_language == "zh" {
        "All questions and answers must be written in Simplified Chinese. Even if the topic statement or source terms are in English, produce the final QA in natural Chinese."
    } else {
        "All questions and answers must be written in English."
    };
    let evidence_context = config
        .supporting_context
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(|value| format!("\nLiterature evidence context:\n{value}\n"))
        .unwrap_or_default();
    format!(
        "Topic: {topic}\nGoal: {goal}\nUser intent: {intent}\nTopic keywords: {topic_keywords}\nSubtopic: {subtopic}\nSubtopic intent: {subtopic_intent}\nAxis: {axis}\nQuestion type: {question_type}\nDifficulty: {difficulty}\nAudience: {audience}{evidence_context}\nGenerate {count} diverse QA pairs as JSON with this schema:\n{{\"items\":[{{\"question\":\"...\",\"answer\":\"...\",\"source_type\":\"model_synthesized\",\"grounding\":\"derived\"}}]}}\n\nRules:\n- {language_instruction}\n- Every question must stay tightly within the exact research topic and the selected subtopic.\n- Each QA pair must mention or strongly imply at least two topic-specific concepts from this set: {topic_keywords}.\n- Use the subtopic `{subtopic}` and axis `{axis}` as hard constraints.\n- Keep questions meaningfully distinct from each other.\n- Answers should be concise, informative, and directly answer the question without tutorial padding.\n- If literature evidence context is provided, prefer claims that are aligned with that evidence; do not fabricate citations.\n- Emphasize the most central concepts explicitly present in the topic instead of drifting into generic background facts.\n- Do not include markdown fences or commentary.\n- Return JSON only.",
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
        language_instruction = language_instruction,
        evidence_context = evidence_context,
        count = count
    )
}

fn build_cot_user_prompt(
    topic: &TopicSpec,
    plan: &QuestionPlan,
    config: &GenerateConfig,
    count: usize,
) -> String {
    let topic_keywords = topic.keywords.join(", ");
    let section_rules = effective_cot_section_headers(config)
        .iter()
        .enumerate()
        .map(|(index, header)| format!("  {}. {}:", index + 1, header))
        .collect::<Vec<_>>()
        .join("\n");
    let language_instruction = if config.output_language == "zh" {
        "All questions, answers, and section headers must be written in Simplified Chinese."
    } else {
        "All questions, answers, and section headers must be written in English."
    };
    format!(
        "Topic: {topic}\nGoal: {goal}\nUser intent: {intent}\nTopic keywords: {topic_keywords}\nSubtopic: {subtopic}\nSubtopic intent: {subtopic_intent}\nAxis: {axis}\nQuestion type: {question_type}\nDifficulty: {difficulty}\nAudience: {audience}\n\nGenerate {count} research-oriented QA pairs as JSON with this exact top-level schema:\n{{\"items\":[{{\"question\":\"...\",\"answer\":\"...\",\"source_type\":\"model_synthesized\",\"grounding\":\"derived\"}}]}}\n\nHard output requirements:\n- Return exactly one JSON object.\n- The first character of your response must be `{{` and the last character must be `}}`.\n- Do not include markdown fences, explanations, comments, or any text before or after the JSON object.\n- Every `answer` value must be a JSON string. If you need line breaks, encode them inside the string as `\\n`.\n- Do not add any extra top-level keys besides `items`.\n\nTask intent:\n- The question should read like a real agricultural life science or breeding research problem.\n- The answer must be a compact CoT-style research planning response for scientists, not a casual explanation.\n\nAnswer format rules:\n- {language_instruction}\n- The answer must be plain text with these section headers in order:\n{section_rules}\n- Keep the response compact, analyst-facing, and free of code or software installation notes.\n- Use short numbered items where a stepwise plan or milestone list is appropriate.\n- Use short bullet items where decisions, checks, or risks are appropriate.\n- The workflow should reflect agricultural life science, crop improvement, plant biology, breeding, omics, field trials, phenotyping, or related research logic whenever appropriate.\n- Use the subtopic `{subtopic}` and axis `{axis}` as hard constraints.\n- Make the answer decision-aware: explain what must be judged, what quality signals matter, and what common failures would invalidate interpretation.\n- Avoid generic textbook prose; write like a senior research workflow planner.\n- Return valid JSON only.",
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
        language_instruction = language_instruction,
        section_rules = section_rules,
        count = count
    )
}

fn generate_stub_batch(
    topic: &TopicSpec,
    plan: &QuestionPlan,
    config: &GenerateConfig,
    count: usize,
) -> Vec<DraftQa> {
    let cot_headers = effective_cot_section_headers(config);
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
            answer: if config.qa_mode == "cot" {
                cot_headers
                    .iter()
                    .enumerate()
                    .map(|(header_index, header)| {
                        let body = match header_index {
                            0 => format!("Frame a compact research workflow for {} under {}.", plan.subtopic, plan.axis),
                            1 => "1. Define the target phenotype.\n2. Select the comparison cohort.\n3. Lock the readout criteria.".to_string(),
                            2 => format!("1. Prepare samples and metadata.\n2. Run the primary measurement for {}.\n3. Compare signal patterns across conditions.", plan.axis),
                            3 => "1. The topic anchors biological scope.\n2. The axis controls the inference lens.\n3. The audience determines reporting depth.".to_string(),
                            4 => "- Decide whether the effect size is actionable.\n- Decide whether confounders dominate the signal.".to_string(),
                            5 => "- Confirm sample labels and trait definitions are consistent.\n- Confirm the readout is reproducible across replicates.".to_string(),
                            6 => "- Weak phenotype definition.\n- Unbalanced comparison groups.\n- Noise larger than the observed effect.".to_string(),
                            _ => format!("Use this stub only as a formatting placeholder for {} and {}.", topic.topic_name, plan.subtopic),
                        };
                        format!("{header}:\n{body}")
                    })
                    .collect::<Vec<_>>()
                    .join("\n")
            } else {
                format!(
                    "This synthetic answer explains how {} relates to {} for a {} audience. It is generated by the {} provider scaffold and is intended as a stable placeholder until live API generation is enabled.",
                    plan.subtopic, plan.axis, plan.audience, config.provider.provider
                )
            },
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
