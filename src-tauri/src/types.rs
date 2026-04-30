use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;

// ---- Shared types (extracted from lib.rs) ----

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct PipelineRequest {
    pub(crate) prompt: String,
    #[serde(default)]
    pub(crate) topic_tags: Vec<String>,
    #[serde(default = "distill_core::default_qa_mode")]
    pub(crate) qa_mode: String,
    #[serde(default = "distill_core::default_output_language")]
    pub(crate) output_language: String,
    pub(crate) target_count: u32,
    pub(crate) plan_limit: usize,
    pub(crate) output_dir: String,
    #[serde(default)]
    pub(crate) managed_output_root: Option<String>,
    pub(crate) provider: String,
    pub(crate) model: String,
    pub(crate) base_url: Option<String>,
    pub(crate) api_key: Option<String>,
    #[serde(default)]
    pub(crate) api_key_env: Option<String>,
    pub(crate) temperature: f32,
    pub(crate) max_tokens: u32,
    pub(crate) shard_size: usize,
    pub(crate) batch_size: usize,
    pub(crate) max_in_flight: usize,
    pub(crate) max_retries: u32,
    pub(crate) request_timeout_secs: u64,
    pub(crate) resume: bool,
    #[serde(default = "crate::config::default_managed_run_mode")]
    pub(crate) managed_run_mode: String,
    #[serde(default)]
    pub(crate) managed_run_batch_id: Option<String>,
    #[serde(default, alias = "qaUploadUrl", alias = "qa_upload_url")]
    pub(crate) qa_platform_url: Option<String>,
    #[serde(default)]
    pub(crate) qa_platform_username: Option<String>,
    #[serde(default)]
    pub(crate) qa_platform_password: Option<String>,
    #[serde(default)]
    pub(crate) literature_api_url: Option<String>,
    #[serde(default)]
    pub(crate) literature_api_auth_token: Option<String>,
    #[serde(default)]
    pub(crate) cot_section_headers: Vec<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct PipelineResponse {
    pub(crate) topic: distill_core::TopicSpec,
    pub(crate) generated_summary: distill_core::GenerateSummary,
    pub(crate) kept_count: usize,
    pub(crate) output_dir: String,
    pub(crate) topic_path: String,
    pub(crate) plans_path: String,
    pub(crate) config_path: String,
    pub(crate) generated_dir: String,
    pub(crate) dataset_path: String,
    pub(crate) pack_summary_path: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct PipelineProgressEvent {
    pub(crate) stage: String,
    pub(crate) status: String,
    pub(crate) message: String,
    pub(crate) current_step: usize,
    pub(crate) total_steps: usize,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) runtime_kind: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) retry_attempt: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) retry_limit: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) attempt_number: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) attempt_limit: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) error_message: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) shard_index: Option<usize>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) shard_count: Option<usize>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) shard_item_completed: Option<usize>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) shard_item_total: Option<usize>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) total_generated: Option<usize>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) target_count: Option<usize>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) batch_index: Option<usize>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) batch_count_in_shard: Option<usize>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) batch_size: Option<usize>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) duration_ms: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) backoff_secs: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) subtopic: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) axis: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) question_type: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) difficulty: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) audience: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ConfigProfileSummary {
    pub(crate) name: String,
    pub(crate) path: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct QaBatchSummary {
    pub(crate) id: String,
    pub(crate) name: String,
    pub(crate) topic_name: String,
    pub(crate) prompt: String,
    pub(crate) qa_mode: Option<String>,
    pub(crate) target_count: Option<usize>,
    pub(crate) generated_count: usize,
    pub(crate) kept_count: usize,
    pub(crate) total_count: usize,
    pub(crate) shard_count: Option<usize>,
    pub(crate) completed_shards: usize,
    pub(crate) skipped_shards: usize,
    pub(crate) request_count: Option<usize>,
    pub(crate) status: String,
    pub(crate) provider: Option<String>,
    pub(crate) model: Option<String>,
    pub(crate) cot_section_headers: Vec<String>,
    pub(crate) output_dir: String,
    pub(crate) updated_at_ms: Option<u64>,
    pub(crate) reviewed_count: usize,
    pub(crate) review_kept_count: usize,
    pub(crate) discarded_count: usize,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct RepackQaBatchResponse {
    pub(crate) batch: QaBatchSummary,
    pub(crate) kept_count: usize,
    pub(crate) total_input: usize,
    pub(crate) dropped_off_topic: usize,
    pub(crate) dataset_path: String,
    pub(crate) pack_summary_path: String,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq, Default)]
#[serde(rename_all = "snake_case")]
pub(crate) enum ReviewStatus {
    #[default]
    Unreviewed,
    Kept,
    Discarded,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub(crate) struct BatchReviewItemState {
    #[serde(default)]
    pub(crate) status: ReviewStatus,
    #[serde(default)]
    pub(crate) edited_question: Option<String>,
    #[serde(default)]
    pub(crate) updated_at_ms: Option<u64>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub(crate) struct BatchReviewState {
    #[serde(default)]
    pub(crate) items: BTreeMap<String, BatchReviewItemState>,
}

#[derive(Debug, Clone, Copy, Serialize, Default)]
#[serde(rename_all = "camelCase")]
pub(crate) struct QaBatchReviewSummary {
    pub(crate) reviewed_count: usize,
    pub(crate) kept_count: usize,
    pub(crate) discarded_count: usize,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct QaRecordReview {
    pub(crate) status: ReviewStatus,
    pub(crate) edited_question: Option<String>,
    pub(crate) effective_question: String,
    pub(crate) updated_at_ms: Option<u64>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct QaRecordSummary {
    pub(crate) id: String,
    pub(crate) question: String,
    pub(crate) subtopic: String,
    pub(crate) axis: String,
    pub(crate) question_type: String,
    pub(crate) difficulty: String,
    pub(crate) audience: String,
    pub(crate) review_status: ReviewStatus,
    pub(crate) edited_question: Option<String>,
    pub(crate) effective_question: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct QaRecordPage {
    pub(crate) batch: QaBatchSummary,
    pub(crate) items: Vec<QaRecordSummary>,
    pub(crate) page: usize,
    pub(crate) page_size: usize,
    pub(crate) total_items: usize,
    pub(crate) total_pages: usize,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct QaRecordDetail {
    pub(crate) batch: QaBatchSummary,
    pub(crate) item: distill_core::GeneratedQa,
    pub(crate) review: QaRecordReview,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct SaveBatchReviewItemResponse {
    pub(crate) review: QaRecordReview,
    pub(crate) summary: QaBatchReviewSummary,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct QaBatchUploadResponse {
    pub(crate) uploaded_count: usize,
    pub(crate) platform_web_base_url: String,
    pub(crate) platform_api_base_url: String,
    pub(crate) batch_id: Option<i64>,
    pub(crate) existing_batch: Option<bool>,
    pub(crate) self_review_status: Option<String>,
    pub(crate) technical_type_code: String,
    pub(crate) application_id: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub(crate) struct PlatformImportBatchStatusLookupItem {
    pub(crate) source: String,
    pub(crate) external_batch_id: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct PlatformImportBatchStatus {
    pub(crate) source: String,
    #[serde(alias = "external_batch_id")]
    pub(crate) external_batch_id: String,
    pub(crate) exists: bool,
    #[serde(alias = "batch_id")]
    pub(crate) batch_id: Option<i64>,
    #[serde(alias = "import_status")]
    pub(crate) import_status: Option<String>,
    #[serde(alias = "is_processing")]
    pub(crate) is_processing: bool,
    #[serde(alias = "batch_status")]
    pub(crate) batch_status: String,
    #[serde(alias = "self_review_status")]
    pub(crate) self_review_status: Option<String>,
    #[serde(alias = "peer_review_status")]
    pub(crate) peer_review_status: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct QaBatchPlatformStatusResponse {
    pub(crate) endpoints: PlatformEndpoints,
    pub(crate) items: Vec<PlatformImportBatchStatus>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct PlatformImportBatchSummary {
    pub(crate) id: i64,
    pub(crate) name: String,
    pub(crate) source: Option<String>,
    #[serde(default, alias = "source_batch_name")]
    pub(crate) source_batch_name: Option<String>,
    #[serde(default, alias = "external_batch_id")]
    pub(crate) external_batch_id: Option<String>,
    #[serde(default, alias = "import_status")]
    pub(crate) import_status: Option<String>,
    #[serde(default)]
    pub(crate) total_count: usize,
    #[serde(default)]
    pub(crate) success_count: usize,
    #[serde(default)]
    pub(crate) fail_count: usize,
    #[serde(default)]
    pub(crate) created_at: String,
    #[serde(default, alias = "application_name")]
    pub(crate) application_name: Option<String>,
    #[serde(default, alias = "technical_type_code")]
    pub(crate) technical_type_code: Option<String>,
    #[serde(default, alias = "technical_type_name")]
    pub(crate) technical_type_name: Option<String>,
    #[serde(default, alias = "self_review_status")]
    pub(crate) self_review_status: Option<String>,
    #[serde(default, alias = "peer_review_status")]
    pub(crate) peer_review_status: Option<String>,
    #[serde(default, alias = "batch_status")]
    pub(crate) batch_status: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct PlatformImportBatchItem {
    pub(crate) id: i64,
    #[serde(default, alias = "external_id")]
    pub(crate) external_id: Option<String>,
    #[serde(default)]
    pub(crate) status: Option<String>,
    #[serde(alias = "question_text")]
    pub(crate) question_text: String,
    #[serde(default, alias = "question_summary")]
    pub(crate) question_summary: Option<String>,
    #[serde(default)]
    pub(crate) source: Option<String>,
    #[serde(default, alias = "source_model")]
    pub(crate) source_model: Option<String>,
    #[serde(default, alias = "metadata_json")]
    pub(crate) metadata_json: Option<String>,
    #[serde(default, alias = "current_answer_id")]
    pub(crate) current_answer_id: Option<i64>,
    #[serde(default, alias = "current_answer_text")]
    pub(crate) current_answer_text: Option<String>,
    #[serde(default, alias = "self_review_task_status")]
    pub(crate) self_review_task_status: Option<String>,
    #[serde(default, alias = "peer_review_total")]
    pub(crate) peer_review_total: usize,
    #[serde(default, alias = "peer_review_submitted")]
    pub(crate) peer_review_submitted: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct PlatformImportBatchDetail {
    pub(crate) batch: PlatformImportBatchSummary,
    pub(crate) items: Vec<PlatformImportBatchItem>,
}

#[derive(Debug, Clone, Serialize)]
pub(crate) struct PlatformImportBatchStatusLookupPayload {
    pub(crate) items: Vec<PlatformImportBatchStatusLookupItem>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct AppMetadataResponse {
    pub(crate) product_name: String,
    pub(crate) version: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ManagedOutputRootResponse {
    pub(crate) output_root: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct PlatformEndpoints {
    pub(crate) normalized_platform_url: String,
    pub(crate) platform_web_base_url: String,
    pub(crate) platform_api_base_url: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct PlatformHealthResponse {
    pub(crate) reachable: bool,
    pub(crate) endpoints: PlatformEndpoints,
    pub(crate) message: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct PlatformApplicationSummary {
    pub(crate) id: i64,
    pub(crate) name: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct PlatformUserSummary {
    pub(crate) id: i64,
    pub(crate) username: String,
    pub(crate) role: String,
    pub(crate) status: String,
    pub(crate) applications: Vec<PlatformApplicationSummary>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct PlatformLoginResponse {
    pub(crate) endpoints: PlatformEndpoints,
    pub(crate) user: PlatformUserSummary,
}

#[derive(Debug, Clone, Deserialize)]
pub(crate) struct ApiEnvelope<T> {
    pub(crate) data: T,
}

#[derive(Debug, Clone, Deserialize)]
pub(crate) struct PlatformLoginEnvelopeData {
    pub(crate) token: String,
}

#[derive(Debug, Clone, Deserialize)]
pub(crate) struct PlatformMeEnvelopeData {
    pub(crate) id: i64,
    pub(crate) username: String,
    pub(crate) role: String,
    pub(crate) status: String,
    #[serde(default)]
    pub(crate) applications: Vec<PlatformApplicationEnvelopeData>,
}

#[derive(Debug, Clone, Deserialize)]
pub(crate) struct PlatformApplicationEnvelopeData {
    pub(crate) id: i64,
    pub(crate) name: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub(crate) struct PlatformImportCandidateAnswerPayload {
    pub(crate) answer: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub(crate) struct PlatformImportRowPayload {
    pub(crate) id: String,
    pub(crate) question: String,
    pub(crate) answer: String,
    pub(crate) context: String,
    pub(crate) difficulty: String,
    pub(crate) source: String,
    pub(crate) model: String,
    pub(crate) metadata: serde_json::Value,
    pub(crate) candidate_answers: Vec<PlatformImportCandidateAnswerPayload>,
}

#[derive(Debug, Clone, Serialize)]
pub(crate) struct PlatformImportPushPayload {
    pub(crate) name: String,
    pub(crate) source: String,
    pub(crate) external_batch_id: String,
    pub(crate) application_id: i64,
    pub(crate) technical_type_code: String,
    pub(crate) business_tag_codes: Vec<String>,
    pub(crate) rows: Vec<PlatformImportRowPayload>,
    pub(crate) auto_parse: bool,
    pub(crate) create_self_review: bool,
}

#[derive(Debug, Clone, Deserialize)]
pub(crate) struct PlatformImportPushResponseData {
    #[serde(default)]
    pub(crate) batch_id: Option<i64>,
    #[serde(default)]
    pub(crate) existing_batch: Option<bool>,
    #[serde(default)]
    pub(crate) self_review_status: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub(crate) struct PlatformChatMessagePayload {
    pub(crate) role: String,
    pub(crate) content: String,
}

#[derive(Debug, Clone, Serialize)]
pub(crate) struct PlatformChatRowPayload {
    pub(crate) id: String,
    pub(crate) messages: Vec<PlatformChatMessagePayload>,
    pub(crate) metadata: serde_json::Value,
}

#[derive(Debug, Clone, Serialize)]
pub(crate) struct ChatUploadResponse {
    pub(crate) batch_id: Option<i64>,
    pub(crate) external_batch_id: String,
    pub(crate) existing_batch: Option<bool>,
    pub(crate) import_status: Option<String>,
    pub(crate) parse_queued: Option<bool>,
}
