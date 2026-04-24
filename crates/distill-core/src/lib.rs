use anyhow::Result;
use serde::{Deserialize, Serialize};
use std::collections::HashSet;

pub fn default_qa_mode() -> String {
    "normal".to_string()
}

pub fn default_output_language() -> String {
    "en".to_string()
}

pub fn default_cot_section_headers() -> Vec<String> {
    default_cot_section_headers_for_language(&default_output_language())
}

pub fn default_cot_section_headers_for_language(language: &str) -> Vec<String> {
    if language == "zh" {
        vec![
            "研究流程概述".to_string(),
            "参考里程碑".to_string(),
            "参考步骤".to_string(),
            "步骤依据".to_string(),
            "关键决策点".to_string(),
            "质量检查".to_string(),
            "失败模式".to_string(),
            "最终解释".to_string(),
        ]
    } else {
        vec![
            "Workflow Summary".to_string(),
            "Reference Milestones".to_string(),
            "Reference Steps".to_string(),
            "Step Rationale".to_string(),
            "Decision Points".to_string(),
            "Quality Checks".to_string(),
            "Failure Modes".to_string(),
            "Final Interpretation".to_string(),
        ]
    }
}

fn default_true() -> bool {
    true
}

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
    #[serde(default = "default_qa_mode")]
    pub qa_mode: String,
    #[serde(default = "default_output_language")]
    pub output_language: String,
    #[serde(default = "default_cot_section_headers")]
    pub cot_section_headers: Vec<String>,
    #[serde(default)]
    pub supporting_context: Option<String>,
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
    #[serde(default = "default_qa_mode")]
    pub qa_mode: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct QaShard {
    pub shard_id: usize,
    pub topic_name: String,
    pub item_count: usize,
    pub start_index: usize,
    pub end_index: usize,
    #[serde(default = "default_true")]
    pub completed: bool,
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
    #[serde(default = "default_qa_mode")]
    pub qa_mode: String,
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
        qa_mode: default_qa_mode(),
        output_language: default_output_language(),
        cot_section_headers: default_cot_section_headers(),
        supporting_context: None,
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
            let min_topic_keyword_hits =
                effective_min_topic_keyword_hits(&record, &topic_terms, config);
            if hit_count < min_topic_keyword_hits {
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

fn effective_min_topic_keyword_hits(
    record: &GeneratedQa,
    topic_terms: &[String],
    config: &PackConfig,
) -> usize {
    if config.min_topic_keyword_hits <= 1 {
        return config.min_topic_keyword_hits;
    }

    if should_relax_topic_filter(record, topic_terms) {
        1
    } else {
        config.min_topic_keyword_hits
    }
}

fn should_relax_topic_filter(record: &GeneratedQa, topic_terms: &[String]) -> bool {
    topic_terms_are_mostly_ascii(topic_terms) && record_uses_cjk_output(record)
}

fn topic_terms_are_mostly_ascii(topic_terms: &[String]) -> bool {
    let ascii_term_count = topic_terms.iter().filter(|term| term.is_ascii()).count();
    ascii_term_count >= 3 && ascii_term_count * 4 >= topic_terms.len().max(1) * 3
}

fn record_uses_cjk_output(record: &GeneratedQa) -> bool {
    contains_cjk(&record.question) || contains_cjk(&record.answer)
}

fn contains_cjk(value: &str) -> bool {
    value.chars().any(is_cjk)
}

fn is_cjk(ch: char) -> bool {
    matches!(
        ch as u32,
        0x3400..=0x4DBF
            | 0x4E00..=0x9FFF
            | 0xF900..=0xFAFF
            | 0x20000..=0x2A6DF
            | 0x2A700..=0x2B73F
            | 0x2B740..=0x2B81F
            | 0x2B820..=0x2CEAF
            | 0x2CEB0..=0x2EBEF
            | 0x30000..=0x3134F
    )
}

fn count_topic_hits(record: &GeneratedQa, terms: &[String]) -> usize {
    let haystack = format!(
        "{} {} {} {}",
        record.question, record.answer, record.subtopic, record.axis
    )
    .to_lowercase();

    terms
        .iter()
        .filter(|term| haystack.contains(term.as_str()))
        .count()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn keeps_cross_language_record_when_metadata_still_matches_topic() {
        let topic = TopicSpec {
            user_intent: "Soybean seed oil and protein improvement under planting density and breeding strategy"
                .to_string(),
            topic_name: "Soybean seed oil and protein improvement under planting density and breeding strategy"
                .to_string(),
            goal: "Generate roughly 10 QA pairs around the topic.".to_string(),
            keywords: vec![
                "breeding".to_string(),
                "density".to_string(),
                "improvement".to_string(),
                "protein".to_string(),
            ],
            subtopics: vec![Subtopic {
                name: "breeding".to_string(),
                intent: "Expand the role of breeding inside the topic.".to_string(),
            }],
            question_axes: vec!["definition".to_string()],
            target_count: 10,
        };
        let config = default_pack_config();
        let records = vec![GeneratedQa {
            id: "qa-1".to_string(),
            shard_id: 0,
            topic_name: topic.topic_name.clone(),
            subtopic: "breeding".to_string(),
            axis: "definition".to_string(),
            question_type: "concept".to_string(),
            difficulty: "easy".to_string(),
            audience: "general".to_string(),
            question: "在高密度种植条件下，如何理解大豆油分与蛋白协同改良中的育种定义？"
                .to_string(),
            answer: "研究流程概述:\n围绕大豆育种与种植密度互作，系统说明油分和蛋白协同改良的研究定义、验证边界、选择依据与质量检查要求，确保这条样本能稳定超过最短答案长度阈值。"
                .to_string(),
            source_type: "model_synthesized".to_string(),
            grounding: "derived".to_string(),
            provider: "openai-compatible".to_string(),
            model: "test-model".to_string(),
            qa_mode: "cot".to_string(),
        }];

        let packed = pack_qa_records(&topic, records, &config);

        assert_eq!(packed.kept, 1);
        assert_eq!(packed.dropped_off_topic, 0);
    }

    #[test]
    fn still_drops_cross_language_record_without_any_topic_hits() {
        let topic = TopicSpec {
            user_intent: "Soybean seed oil and protein improvement under planting density and breeding strategy"
                .to_string(),
            topic_name: "Soybean seed oil and protein improvement under planting density and breeding strategy"
                .to_string(),
            goal: "Generate roughly 10 QA pairs around the topic.".to_string(),
            keywords: vec![
                "breeding".to_string(),
                "density".to_string(),
                "improvement".to_string(),
                "protein".to_string(),
            ],
            subtopics: vec![Subtopic {
                name: "breeding".to_string(),
                intent: "Expand the role of breeding inside the topic.".to_string(),
            }],
            question_axes: vec!["definition".to_string()],
            target_count: 10,
        };
        let config = default_pack_config();
        let records = vec![GeneratedQa {
            id: "qa-2".to_string(),
            shard_id: 0,
            topic_name: topic.topic_name.clone(),
            subtopic: "unknown".to_string(),
            axis: "unknown".to_string(),
            question_type: "concept".to_string(),
            difficulty: "easy".to_string(),
            audience: "general".to_string(),
            question: "这是一条与原始研究主题完全无关、且不会命中任何英文主题词的中文问题。"
                .to_string(),
            answer: "这个回答只讨论城市交通、电影剪辑、咖啡风味与旅行体验，不讨论任何农业研究主题，并且故意写得足够长，以确保它不会因为长度过滤而掩盖 off-topic 过滤结果。"
                .to_string(),
            source_type: "model_synthesized".to_string(),
            grounding: "derived".to_string(),
            provider: "openai-compatible".to_string(),
            model: "test-model".to_string(),
            qa_mode: "cot".to_string(),
        }];

        let packed = pack_qa_records(&topic, records, &config);

        assert_eq!(packed.kept, 0);
        assert_eq!(packed.dropped_off_topic, 1);
    }
}
