use serde::{Deserialize, Serialize};

use crate::types::*;

// ---- Paper QA structs ----

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct MinerUFileUrlRequest {
    pub(crate) files: Vec<MinerUFileUrlItem>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) model_version: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub(crate) struct MinerUFileUrlItem {
    pub(crate) name: String,
}

#[derive(Debug, Clone, Deserialize)]
pub(crate) struct MinerUFileUrlResponse {
    pub(crate) data: MinerUFileUrlData,
}

#[derive(Debug, Clone, Deserialize)]
pub(crate) struct MinerUFileUrlData {
    pub(crate) batch_id: String,
    pub(crate) file_urls: Vec<String>,
}

#[derive(Debug, Clone, Deserialize)]
pub(crate) struct MinerUExtractResult {
    pub(crate) state: String,
    #[serde(default)]
    pub(crate) full_zip_url: Option<String>,
    #[serde(default)]
    pub(crate) err_msg: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
#[allow(dead_code)]
pub(crate) struct MinerUExtractBatchData {
    pub(crate) batch_id: String,
    pub(crate) extract_result: Vec<MinerUExtractResult>,
}

#[derive(Debug, Clone, Deserialize)]
pub(crate) struct MinerUExtractResponse {
    pub(crate) data: MinerUExtractBatchData,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct PaperChunk {
    pub(crate) id: String,
    pub(crate) text: String,
    pub(crate) section_type: String,
    pub(crate) char_count: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct PaperQaGenerateRequest {
    pub(crate) chunks: Vec<PaperChunk>,
    pub(crate) paper_title: String,
    pub(crate) provider: String,
    pub(crate) base_url: String,
    pub(crate) api_key: String,
    pub(crate) model: String,
    pub(crate) cot_ratio: f64,
    #[serde(default)]
    pub(crate) platform_url: Option<String>,
    #[serde(default)]
    pub(crate) username: Option<String>,
    #[serde(default)]
    pub(crate) password: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct PaperQaItem {
    pub(crate) id: String,
    pub(crate) qa_type: String,
    pub(crate) instruction: String,
    #[serde(default)]
    pub(crate) reasoning: Option<String>,
    pub(crate) output: String,
    pub(crate) paper_title: String,
    pub(crate) chunk_id: String,
    pub(crate) section_type: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct PaperQaGenerateResponse {
    pub(crate) items: Vec<PaperQaItem>,
    pub(crate) stats: PaperQaStats,
    #[serde(default)]
    pub(crate) warnings: Vec<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct PaperQaStats {
    pub(crate) total: usize,
    pub(crate) cot_count: usize,
    pub(crate) qa_count: usize,
    pub(crate) cot_ratio: f64,
    pub(crate) qa_ratio: f64,
}

// ---- LLM chat response types (used by Paper QA and Chat QA) ----

#[derive(Debug, Clone, Serialize, Deserialize)]
pub(crate) struct LlmChatMessage {
    pub(crate) role: String,
    pub(crate) content: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub(crate) struct LlmChatCompletionChoice {
    pub(crate) message: LlmChatMessage,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub(crate) struct LlmChatCompletionResponse {
    pub(crate) choices: Vec<LlmChatCompletionChoice>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub(crate) struct LlmJsonCoTItem {
    pub(crate) instruction: String,
    pub(crate) reasoning: String,
    pub(crate) conclusion: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub(crate) struct LlmJsonCotResponse {
    #[serde(default)]
    pub(crate) cot_items: Vec<LlmJsonCoTItem>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub(crate) struct LlmJsonQaItem {
    pub(crate) question: String,
    #[serde(default)]
    pub(crate) context: Option<String>,
    pub(crate) answer: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub(crate) struct LlmJsonQaResponse {
    #[serde(default)]
    pub(crate) qa_items: Vec<LlmJsonQaItem>,
}

// ---- Model trial session types ----

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct TrialLlmConfigOption {
    pub(crate) id: i64,
    pub(crate) name: String,
    #[serde(alias = "provider_code")]
    pub(crate) provider_code: String,
    #[serde(alias = "model_name")]
    pub(crate) model_name: String,
    #[serde(alias = "is_enabled")]
    pub(crate) is_enabled: bool,
    #[serde(alias = "is_trial_enabled")]
    pub(crate) is_trial_enabled: bool,
    #[serde(alias = "has_api_key")]
    pub(crate) has_api_key: bool,
    #[serde(default)]
    #[serde(alias = "last_tested_at")]
    pub(crate) last_tested_at: Option<String>,
    #[serde(default)]
    #[serde(alias = "last_test_status")]
    pub(crate) last_test_status: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct TrialSourceItem {
    #[serde(alias = "qa_item_id")]
    pub(crate) qa_item_id: i64,
    #[serde(default)]
    #[serde(alias = "answer_id")]
    pub(crate) answer_id: Option<i64>,
    #[serde(alias = "question_text")]
    pub(crate) question_text: String,
    #[serde(default)]
    #[serde(alias = "answer_text")]
    pub(crate) answer_text: Option<String>,
    #[serde(default)]
    #[serde(alias = "context_text")]
    pub(crate) context_text: Option<String>,
    #[serde(default)]
    #[serde(alias = "application_name")]
    pub(crate) application_name: Option<String>,
    #[serde(default)]
    #[serde(alias = "technical_type_code")]
    pub(crate) technical_type_code: Option<String>,
    #[serde(default)]
    #[serde(alias = "technical_type_name")]
    pub(crate) technical_type_name: Option<String>,
    #[serde(default)]
    #[serde(alias = "task_type")]
    pub(crate) task_type: Option<String>,
    #[serde(default)]
    #[serde(alias = "task_status")]
    pub(crate) task_status: Option<String>,
    #[serde(default)]
    #[serde(alias = "updated_at")]
    pub(crate) updated_at: Option<String>,
    #[serde(default)]
    #[serde(alias = "question_summary")]
    pub(crate) question_summary: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct TrialSessionSummary {
    pub(crate) id: i64,
    #[serde(alias = "llm_config_id")]
    pub(crate) llm_config_id: i64,
    #[serde(default)]
    #[serde(alias = "llm_config_name")]
    pub(crate) llm_config_name: Option<String>,
    #[serde(default)]
    #[serde(alias = "llm_model_name")]
    pub(crate) llm_model_name: Option<String>,
    pub(crate) title: String,
    pub(crate) status: String,
    #[serde(alias = "created_at")]
    pub(crate) created_at: String,
    #[serde(alias = "updated_at")]
    pub(crate) updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct TrialMessage {
    pub(crate) id: i64,
    pub(crate) role: String,
    pub(crate) content: String,
    #[serde(alias = "created_at")]
    pub(crate) created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct TrialSessionDetail {
    pub(crate) session: TrialSessionSummary,
    #[serde(default)]
    pub(crate) source: Option<TrialSourceItem>,
    pub(crate) messages: Vec<TrialMessage>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct TrialWorkspaceResponse {
    pub(crate) endpoints: PlatformEndpoints,
    pub(crate) user: PlatformUserSummary,
    pub(crate) configs: Vec<TrialLlmConfigOption>,
    pub(crate) sources: Vec<TrialSourceItem>,
    pub(crate) sessions: Vec<TrialSessionSummary>,
}

#[derive(Debug, Clone, Deserialize)]
pub(crate) struct TrialSessionCreateResponseData {
    pub(crate) session_id: i64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct TrialSessionCreateResponse {
    pub(crate) session_id: i64,
}

#[derive(Debug, Clone, Deserialize)]
pub(crate) struct TrialSendMessageResponseData {
    pub(crate) reply: String,
    pub(crate) status: String,
    pub(crate) session_id: i64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct TrialSendMessageResponse {
    pub(crate) reply: String,
    pub(crate) status: String,
    pub(crate) session_id: i64,
}

#[derive(Debug, Clone, Deserialize)]
pub(crate) struct TrialDeleteSessionResponseData {
    pub(crate) session_id: i64,
    pub(crate) status: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct TrialDeleteSessionResponse {
    pub(crate) session_id: i64,
    pub(crate) status: String,
}
