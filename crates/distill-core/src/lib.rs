use anyhow::Result;
use serde::{Deserialize, Serialize};
use std::collections::HashSet;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TopicSpec {
    pub user_intent: String,
    pub topic_name: String,
    pub goal: String,
    pub keywords: Vec<String>,
    pub subtopics: Vec<Subtopic>,
    pub question_axes: Vec<String>,
    pub target_count: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Subtopic {
    pub name: String,
    pub intent: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct QuestionPlan {
    pub topic_name: String,
    pub subtopic: String,
    pub axis: String,
    pub question_type: String,
    pub difficulty: String,
    pub audience: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct QaPair {
    pub question: String,
    pub answer: String,
    pub source_type: String,
    pub grounding: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProviderConfig {
    pub provider: String,
    pub model: String,
    pub base_url: Option<String>,
    #[serde(default)]
    pub api_key: Option<String>,
    #[serde(default)]
    pub api_key_env: Option<String>,
    pub temperature: f32,
    pub max_tokens: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RuntimeConfig {
    pub target_count: usize,
    pub shard_size: usize,
    pub batch_size: usize,
    pub max_in_flight: usize,
    pub max_retries: u32,
    pub request_timeout_secs: u64,
    pub resume: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GenerateConfig {
    pub provider: ProviderConfig,
    pub runtime: RuntimeConfig,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GeneratedQa {
    pub id: String,
    pub shard_id: usize,
    pub topic_name: String,
    pub subtopic: String,
    pub axis: String,
    pub question_type: String,
    pub difficulty: String,
    pub audience: String,
    pub question: String,
    pub answer: String,
    pub source_type: String,
    pub grounding: String,
    pub provider: String,
    pub model: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct QaShard {
    pub shard_id: usize,
    pub topic_name: String,
    pub item_count: usize,
    pub start_index: usize,
    pub end_index: usize,
    pub items: Vec<GeneratedQa>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GenerateSummary {
    pub topic_name: String,
    pub target_count: usize,
    pub generated_count: usize,
    pub shard_count: usize,
    pub completed_shards: usize,
    pub skipped_shards: usize,
    pub shard_size: usize,
    pub batch_size: usize,
    pub request_count: usize,
    pub provider: String,
    pub model: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PackConfig {
    pub min_question_chars: usize,
    pub min_answer_chars: usize,
    pub dedupe_on_question: bool,
    pub min_topic_keyword_hits: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PackedDataset {
    pub topic_name: String,
    pub total_input: usize,
    pub kept: usize,
    pub dropped_empty: usize,
    pub dropped_short: usize,
    pub dropped_duplicate: usize,
    pub dropped_off_topic: usize,
    pub items: Vec<GeneratedQa>,
}

pub fn bootstrap_topic(prompt: &str, target_count: u32) -> Result<TopicSpec> {
    let cleaned = prompt.trim();
    let topic_name = cleaned
        .split('.')
        .next()
        .unwrap_or(cleaned)
        .trim()
        .to_string();

    let keywords = infer_keywords(cleaned);
    let subtopics = infer_subtopics(&keywords);
    let question_axes = vec![
        "definition".to_string(),
        "mechanism".to_string(),
        "comparison".to_string(),
        "application".to_string(),
        "experimental_design".to_string(),
        "risk_and_limitation".to_string(),
    ];

    Ok(TopicSpec {
        user_intent: cleaned.to_string(),
        topic_name,
        goal: format!("Generate roughly {target_count} QA pairs around the topic."),
        keywords,
        subtopics,
        question_axes,
        target_count,
    })
}

pub fn draft_question_plans(topic: &TopicSpec, limit: usize) -> Vec<QuestionPlan> {
    let question_types = ["concept", "reasoning", "comparison", "scenario"];
    let difficulty_cycle = ["easy", "medium", "hard"];
    let audience_cycle = ["general", "research", "applied"];

    let mut plans = Vec::new();
    for subtopic in &topic.subtopics {
        for axis in &topic.question_axes {
            for question_type in &question_types {
                if plans.len() >= limit {
                    return plans;
                }

                let idx = plans.len();
                plans.push(QuestionPlan {
                    topic_name: topic.topic_name.clone(),
                    subtopic: subtopic.name.clone(),
                    axis: axis.clone(),
                    question_type: (*question_type).to_string(),
                    difficulty: difficulty_cycle[idx % difficulty_cycle.len()].to_string(),
                    audience: audience_cycle[idx % audience_cycle.len()].to_string(),
                });
            }
        }
    }
    plans
}

pub fn default_generate_config(target_count: usize) -> GenerateConfig {
    GenerateConfig {
        provider: ProviderConfig {
            provider: "openai-compatible".to_string(),
            model: "gpt-4.1-mini".to_string(),
            base_url: None,
            api_key: None,
            api_key_env: Some("OPENAI_API_KEY".to_string()),
            temperature: 0.8,
            max_tokens: 800,
        },
        runtime: RuntimeConfig {
            target_count,
            shard_size: 1_000,
            batch_size: 24,
            max_in_flight: 64,
            max_retries: 3,
            request_timeout_secs: 120,
            resume: true,
        },
    }
}

pub fn default_pack_config() -> PackConfig {
    PackConfig {
        min_question_chars: 12,
        min_answer_chars: 40,
        dedupe_on_question: true,
        min_topic_keyword_hits: 2,
    }
}

pub fn pack_qa_records(
    topic: &TopicSpec,
    records: Vec<GeneratedQa>,
    config: &PackConfig,
) -> PackedDataset {
    let total_input = records.len();
    let mut kept = Vec::with_capacity(records.len());
    let mut seen = HashSet::new();
    let mut dropped_empty = 0;
    let mut dropped_short = 0;
    let mut dropped_duplicate = 0;
    let mut dropped_off_topic = 0;
    let topic_terms = build_topic_terms(topic);

    for record in records {
        if record.question.trim().is_empty() || record.answer.trim().is_empty() {
            dropped_empty += 1;
            continue;
        }

        if record.question.trim().chars().count() < config.min_question_chars
            || record.answer.trim().chars().count() < config.min_answer_chars
        {
            dropped_short += 1;
            continue;
        }

        if config.dedupe_on_question {
            let normalized = normalize_question(&record.question);
            if !seen.insert(normalized) {
                dropped_duplicate += 1;
                continue;
            }
        }

        if config.min_topic_keyword_hits > 0 {
            let hit_count = count_topic_hits(&record, &topic_terms);
            if hit_count < config.min_topic_keyword_hits {
                dropped_off_topic += 1;
                continue;
            }
        }

        kept.push(record);
    }

    PackedDataset {
        topic_name: topic.topic_name.to_string(),
        total_input,
        kept: kept.len(),
        dropped_empty,
        dropped_short,
        dropped_duplicate,
        dropped_off_topic,
        items: kept,
    }
}

fn infer_keywords(prompt: &str) -> Vec<String> {
    let mut keywords: Vec<String> = prompt
        .split(|c: char| !c.is_alphanumeric() && c != '_' && c != '-')
        .filter(|token| token.len() >= 4)
        .map(|token| token.to_lowercase())
        .collect();

    keywords.sort();
    keywords.dedup();

    if keywords.is_empty() {
        keywords.push("general_topic".to_string());
    }
    keywords.truncate(8);
    keywords
}

fn infer_subtopics(keywords: &[String]) -> Vec<Subtopic> {
    let mut subtopics = keywords
        .iter()
        .take(5)
        .map(|keyword| Subtopic {
            name: keyword.replace('_', " "),
            intent: format!("Expand the role of `{keyword}` inside the user topic."),
        })
        .collect::<Vec<_>>();

    if subtopics.is_empty() {
        subtopics.push(Subtopic {
            name: "core topic".to_string(),
            intent: "Cover the central subject from multiple QA angles.".to_string(),
        });
    }
    subtopics
}

fn normalize_question(question: &str) -> String {
    question
        .chars()
        .filter(|c| c.is_alphanumeric() || c.is_whitespace())
        .flat_map(char::to_lowercase)
        .collect::<String>()
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
}

fn build_topic_terms(topic: &TopicSpec) -> Vec<String> {
    let mut terms = topic
        .keywords
        .iter()
        .chain(std::iter::once(&topic.topic_name))
        .flat_map(|value| {
            value
                .split(|c: char| !c.is_alphanumeric() && c != '_' && c != '-')
                .map(|token| token.trim().to_lowercase())
                .collect::<Vec<_>>()
        })
        .filter(|token| token.len() >= 4)
        .collect::<Vec<_>>();

    terms.sort();
    terms.dedup();
    terms
}

fn count_topic_hits(record: &GeneratedQa, terms: &[String]) -> usize {
    let haystack = format!(
        "{} {} {} {}",
        record.question, record.answer, record.subtopic, record.axis
    )
    .to_lowercase();

    terms.iter().filter(|term| haystack.contains(term.as_str())).count()
}
