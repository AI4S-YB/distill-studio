use anyhow::Context;
use distill_core::{
    bootstrap_topic, default_cot_section_headers, default_cot_section_headers_for_language,
    default_output_language, default_pack_config, default_qa_mode, draft_question_plans,
    pack_qa_records, GenerateConfig, GenerateSummary, GeneratedQa, PackConfig, PackedDataset,
    ProviderConfig, QaShard, QuestionPlan, RuntimeConfig, TopicSpec,
};
use distill_runtime::{generate_to_directory_with_progress, RuntimeProgress, RuntimeProgressKind};
use serde::{de::DeserializeOwned, Deserialize, Serialize};
use std::collections::BTreeMap;
use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;
use std::sync::{
    atomic::{AtomicBool, Ordering},
    Arc, Mutex,
};
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Emitter, Manager, Window};
use tauri_plugin_updater::UpdaterExt;
use tokio::time::{sleep, timeout, Duration};
use url::Url;

const COT_SAFE_BATCH_SIZE: usize = 1;
const COT_SAFE_MAX_IN_FLIGHT: usize = 2;
const COT_SAFE_SHARD_SIZE_CAP: usize = 10;
const QA_PLATFORM_BATCH_SOURCE: &str = "qa-xiaozhao";
const DEFAULT_RELEASES_PAGE_URL: &str = "https://github.com/AI4S-YB/distill-studio/releases/latest";

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct PipelineRequest {
    prompt: String,
    #[serde(default)]
    topic_tags: Vec<String>,
    #[serde(default = "default_qa_mode")]
    qa_mode: String,
    #[serde(default = "default_output_language")]
    output_language: String,
    target_count: u32,
    plan_limit: usize,
    output_dir: String,
    #[serde(default)]
    managed_output_root: Option<String>,
    provider: String,
    model: String,
    base_url: Option<String>,
    api_key: Option<String>,
    #[serde(default)]
    api_key_env: Option<String>,
    temperature: f32,
    max_tokens: u32,
    shard_size: usize,
    batch_size: usize,
    max_in_flight: usize,
    max_retries: u32,
    request_timeout_secs: u64,
    resume: bool,
    #[serde(default = "default_managed_run_mode")]
    managed_run_mode: String,
    #[serde(default)]
    managed_run_batch_id: Option<String>,
    #[serde(default, alias = "qaUploadUrl", alias = "qa_upload_url")]
    qa_platform_url: Option<String>,
    #[serde(default)]
    qa_platform_username: Option<String>,
    #[serde(default)]
    qa_platform_password: Option<String>,
    #[serde(default)]
    literature_api_url: Option<String>,
    #[serde(default)]
    literature_api_auth_token: Option<String>,
    #[serde(default)]
    cot_section_headers: Vec<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct PipelineResponse {
    topic: TopicSpec,
    generated_summary: GenerateSummary,
    kept_count: usize,
    output_dir: String,
    topic_path: String,
    plans_path: String,
    config_path: String,
    generated_dir: String,
    dataset_path: String,
    pack_summary_path: String,
}

fn default_managed_run_mode() -> String {
    "new".to_string()
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct PipelineProgressEvent {
    stage: String,
    status: String,
    message: String,
    current_step: usize,
    total_steps: usize,
    #[serde(skip_serializing_if = "Option::is_none")]
    runtime_kind: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    retry_attempt: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    retry_limit: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    attempt_number: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    attempt_limit: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    error_message: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    shard_index: Option<usize>,
    #[serde(skip_serializing_if = "Option::is_none")]
    shard_count: Option<usize>,
    #[serde(skip_serializing_if = "Option::is_none")]
    shard_item_completed: Option<usize>,
    #[serde(skip_serializing_if = "Option::is_none")]
    shard_item_total: Option<usize>,
    #[serde(skip_serializing_if = "Option::is_none")]
    total_generated: Option<usize>,
    #[serde(skip_serializing_if = "Option::is_none")]
    target_count: Option<usize>,
    #[serde(skip_serializing_if = "Option::is_none")]
    batch_index: Option<usize>,
    #[serde(skip_serializing_if = "Option::is_none")]
    batch_count_in_shard: Option<usize>,
    #[serde(skip_serializing_if = "Option::is_none")]
    batch_size: Option<usize>,
    #[serde(skip_serializing_if = "Option::is_none")]
    duration_ms: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    backoff_secs: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    subtopic: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    axis: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    question_type: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    difficulty: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    audience: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct ConfigProfileSummary {
    name: String,
    path: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct QaBatchSummary {
    id: String,
    name: String,
    topic_name: String,
    prompt: String,
    qa_mode: Option<String>,
    target_count: Option<usize>,
    generated_count: usize,
    kept_count: usize,
    total_count: usize,
    shard_count: Option<usize>,
    completed_shards: usize,
    skipped_shards: usize,
    request_count: Option<usize>,
    status: String,
    provider: Option<String>,
    model: Option<String>,
    cot_section_headers: Vec<String>,
    output_dir: String,
    updated_at_ms: Option<u64>,
    reviewed_count: usize,
    review_kept_count: usize,
    discarded_count: usize,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct RepackQaBatchResponse {
    batch: QaBatchSummary,
    kept_count: usize,
    total_input: usize,
    dropped_off_topic: usize,
    dataset_path: String,
    pack_summary_path: String,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq, Default)]
#[serde(rename_all = "snake_case")]
enum ReviewStatus {
    #[default]
    Unreviewed,
    Kept,
    Discarded,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
struct BatchReviewItemState {
    #[serde(default)]
    status: ReviewStatus,
    #[serde(default)]
    edited_question: Option<String>,
    #[serde(default)]
    updated_at_ms: Option<u64>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
struct BatchReviewState {
    #[serde(default)]
    items: BTreeMap<String, BatchReviewItemState>,
}

#[derive(Debug, Clone, Copy, Serialize, Default)]
#[serde(rename_all = "camelCase")]
struct QaBatchReviewSummary {
    reviewed_count: usize,
    kept_count: usize,
    discarded_count: usize,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct QaRecordReview {
    status: ReviewStatus,
    edited_question: Option<String>,
    effective_question: String,
    updated_at_ms: Option<u64>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct QaRecordSummary {
    id: String,
    question: String,
    subtopic: String,
    axis: String,
    question_type: String,
    difficulty: String,
    audience: String,
    review_status: ReviewStatus,
    edited_question: Option<String>,
    effective_question: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct QaRecordPage {
    batch: QaBatchSummary,
    items: Vec<QaRecordSummary>,
    page: usize,
    page_size: usize,
    total_items: usize,
    total_pages: usize,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct QaRecordDetail {
    batch: QaBatchSummary,
    item: GeneratedQa,
    review: QaRecordReview,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct SaveBatchReviewItemResponse {
    review: QaRecordReview,
    summary: QaBatchReviewSummary,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct QaBatchUploadResponse {
    uploaded_count: usize,
    platform_web_base_url: String,
    platform_api_base_url: String,
    batch_id: Option<i64>,
    existing_batch: Option<bool>,
    self_review_status: Option<String>,
    technical_type_code: String,
    application_id: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
struct PlatformImportBatchStatusLookupItem {
    source: String,
    external_batch_id: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct PlatformImportBatchStatus {
    source: String,
    #[serde(alias = "external_batch_id")]
    external_batch_id: String,
    exists: bool,
    #[serde(alias = "batch_id")]
    batch_id: Option<i64>,
    #[serde(alias = "import_status")]
    import_status: Option<String>,
    #[serde(alias = "is_processing")]
    is_processing: bool,
    #[serde(alias = "batch_status")]
    batch_status: String,
    #[serde(alias = "self_review_status")]
    self_review_status: Option<String>,
    #[serde(alias = "peer_review_status")]
    peer_review_status: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct QaBatchPlatformStatusResponse {
    endpoints: PlatformEndpoints,
    items: Vec<PlatformImportBatchStatus>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct PlatformImportBatchSummary {
    id: i64,
    name: String,
    source: Option<String>,
    #[serde(default, alias = "source_batch_name")]
    source_batch_name: Option<String>,
    #[serde(default, alias = "external_batch_id")]
    external_batch_id: Option<String>,
    #[serde(default, alias = "import_status")]
    import_status: Option<String>,
    #[serde(default)]
    total_count: usize,
    #[serde(default)]
    success_count: usize,
    #[serde(default)]
    fail_count: usize,
    #[serde(default)]
    created_at: String,
    #[serde(default, alias = "application_name")]
    application_name: Option<String>,
    #[serde(default, alias = "technical_type_code")]
    technical_type_code: Option<String>,
    #[serde(default, alias = "technical_type_name")]
    technical_type_name: Option<String>,
    #[serde(default, alias = "self_review_status")]
    self_review_status: Option<String>,
    #[serde(default, alias = "peer_review_status")]
    peer_review_status: Option<String>,
    #[serde(default, alias = "batch_status")]
    batch_status: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct PlatformImportBatchItem {
    id: i64,
    #[serde(default, alias = "external_id")]
    external_id: Option<String>,
    #[serde(default)]
    status: Option<String>,
    #[serde(alias = "question_text")]
    question_text: String,
    #[serde(default, alias = "question_summary")]
    question_summary: Option<String>,
    #[serde(default)]
    source: Option<String>,
    #[serde(default, alias = "source_model")]
    source_model: Option<String>,
    #[serde(default, alias = "metadata_json")]
    metadata_json: Option<String>,
    #[serde(default, alias = "current_answer_id")]
    current_answer_id: Option<i64>,
    #[serde(default, alias = "current_answer_text")]
    current_answer_text: Option<String>,
    #[serde(default, alias = "self_review_task_status")]
    self_review_task_status: Option<String>,
    #[serde(default, alias = "peer_review_total")]
    peer_review_total: usize,
    #[serde(default, alias = "peer_review_submitted")]
    peer_review_submitted: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct PlatformImportBatchDetail {
    batch: PlatformImportBatchSummary,
    items: Vec<PlatformImportBatchItem>,
}

#[derive(Debug, Clone, Serialize)]
struct PlatformImportBatchStatusLookupPayload {
    items: Vec<PlatformImportBatchStatusLookupItem>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct AppMetadataResponse {
    product_name: String,
    version: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct ManagedOutputRootResponse {
    output_root: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct PlatformEndpoints {
    normalized_platform_url: String,
    platform_web_base_url: String,
    platform_api_base_url: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct PlatformHealthResponse {
    reachable: bool,
    endpoints: PlatformEndpoints,
    message: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct PlatformApplicationSummary {
    id: i64,
    name: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct PlatformUserSummary {
    id: i64,
    username: String,
    role: String,
    status: String,
    applications: Vec<PlatformApplicationSummary>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct PlatformLoginResponse {
    endpoints: PlatformEndpoints,
    user: PlatformUserSummary,
}

#[derive(Debug, Clone, Deserialize)]
struct ApiEnvelope<T> {
    data: T,
}

#[derive(Debug, Clone, Deserialize)]
struct PlatformLoginEnvelopeData {
    token: String,
}

#[derive(Debug, Clone, Deserialize)]
struct PlatformMeEnvelopeData {
    id: i64,
    username: String,
    role: String,
    status: String,
    #[serde(default)]
    applications: Vec<PlatformApplicationEnvelopeData>,
}

#[derive(Debug, Clone, Deserialize)]
struct PlatformApplicationEnvelopeData {
    id: i64,
    name: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct PlatformImportCandidateAnswerPayload {
    answer: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct PlatformImportRowPayload {
    id: String,
    question: String,
    answer: String,
    context: String,
    difficulty: String,
    source: String,
    model: String,
    metadata: serde_json::Value,
    candidate_answers: Vec<PlatformImportCandidateAnswerPayload>,
}

#[derive(Debug, Clone, Serialize)]
struct PlatformImportPushPayload {
    name: String,
    source: String,
    external_batch_id: String,
    application_id: i64,
    technical_type_code: String,
    business_tag_codes: Vec<String>,
    rows: Vec<PlatformImportRowPayload>,
    auto_parse: bool,
    create_self_review: bool,
}

#[derive(Debug, Clone, Deserialize)]
struct PlatformImportPushResponseData {
    #[serde(default)]
    batch_id: Option<i64>,
    #[serde(default)]
    existing_batch: Option<bool>,
    #[serde(default)]
    self_review_status: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct PlatformChatMessagePayload {
    role: String,
    content: String,
}

#[derive(Debug, Clone, Serialize)]
struct PlatformChatRowPayload {
    id: String,
    messages: Vec<PlatformChatMessagePayload>,
    metadata: serde_json::Value,
}

#[derive(Debug, Clone, Serialize)]
struct ChatUploadResponse {
    batch_id: Option<i64>,
    external_batch_id: String,
    existing_batch: Option<bool>,
    import_status: Option<String>,
    parse_queued: Option<bool>,
}

// ---- Paper QA structs ----

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct MinerUFileUrlRequest {
    files: Vec<MinerUFileUrlItem>,
    #[serde(skip_serializing_if = "Option::is_none")]
    model_version: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct MinerUFileUrlItem {
    name: String,
}

#[derive(Debug, Clone, Deserialize)]
struct MinerUFileUrlResponse {
    data: MinerUFileUrlData,
}

#[derive(Debug, Clone, Deserialize)]
struct MinerUFileUrlData {
    batch_id: String,
    file_urls: Vec<String>,
}

#[derive(Debug, Clone, Deserialize)]
struct MinerUExtractResult {
    state: String,
    #[serde(default)]
    full_zip_url: Option<String>,
    #[serde(default)]
    err_msg: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
#[allow(dead_code)]
struct MinerUExtractBatchData {
    batch_id: String,
    extract_result: Vec<MinerUExtractResult>,
}

#[derive(Debug, Clone, Deserialize)]
struct MinerUExtractResponse {
    data: MinerUExtractBatchData,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct PaperChunk {
    id: String,
    text: String,
    section_type: String,
    char_count: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct PaperQaGenerateRequest {
    chunks: Vec<PaperChunk>,
    paper_title: String,
    provider: String,
    base_url: String,
    api_key: String,
    model: String,
    cot_ratio: f64,
    #[serde(default)]
    platform_url: Option<String>,
    #[serde(default)]
    username: Option<String>,
    #[serde(default)]
    password: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct PaperQaItem {
    id: String,
    qa_type: String,
    instruction: String,
    #[serde(default)]
    reasoning: Option<String>,
    output: String,
    paper_title: String,
    chunk_id: String,
    section_type: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct PaperQaGenerateResponse {
    items: Vec<PaperQaItem>,
    stats: PaperQaStats,
    #[serde(default)]
    warnings: Vec<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct PaperQaStats {
    total: usize,
    cot_count: usize,
    qa_count: usize,
    cot_ratio: f64,
    qa_ratio: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct LlmChatMessage {
    role: String,
    content: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct LlmChatCompletionChoice {
    message: LlmChatMessage,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct LlmChatCompletionResponse {
    choices: Vec<LlmChatCompletionChoice>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct LlmJsonCoTItem {
    instruction: String,
    reasoning: String,
    conclusion: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct LlmJsonCotResponse {
    #[serde(default)]
    cot_items: Vec<LlmJsonCoTItem>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct LlmJsonQaItem {
    question: String,
    #[serde(default)]
    context: Option<String>,
    answer: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct LlmJsonQaResponse {
    #[serde(default)]
    qa_items: Vec<LlmJsonQaItem>,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct TrialLlmConfigOption {
    id: i64,
    name: String,
    #[serde(alias = "provider_code")]
    provider_code: String,
    #[serde(alias = "model_name")]
    model_name: String,
    #[serde(alias = "is_enabled")]
    is_enabled: bool,
    #[serde(alias = "is_trial_enabled")]
    is_trial_enabled: bool,
    #[serde(alias = "has_api_key")]
    has_api_key: bool,
    #[serde(default)]
    #[serde(alias = "last_tested_at")]
    last_tested_at: Option<String>,
    #[serde(default)]
    #[serde(alias = "last_test_status")]
    last_test_status: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct TrialSourceItem {
    #[serde(alias = "qa_item_id")]
    qa_item_id: i64,
    #[serde(default)]
    #[serde(alias = "answer_id")]
    answer_id: Option<i64>,
    #[serde(alias = "question_text")]
    question_text: String,
    #[serde(default)]
    #[serde(alias = "answer_text")]
    answer_text: Option<String>,
    #[serde(default)]
    #[serde(alias = "context_text")]
    context_text: Option<String>,
    #[serde(default)]
    #[serde(alias = "application_name")]
    application_name: Option<String>,
    #[serde(default)]
    #[serde(alias = "technical_type_code")]
    technical_type_code: Option<String>,
    #[serde(default)]
    #[serde(alias = "technical_type_name")]
    technical_type_name: Option<String>,
    #[serde(default)]
    #[serde(alias = "task_type")]
    task_type: Option<String>,
    #[serde(default)]
    #[serde(alias = "task_status")]
    task_status: Option<String>,
    #[serde(default)]
    #[serde(alias = "updated_at")]
    updated_at: Option<String>,
    #[serde(default)]
    #[serde(alias = "question_summary")]
    question_summary: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct TrialSessionSummary {
    id: i64,
    #[serde(alias = "llm_config_id")]
    llm_config_id: i64,
    #[serde(default)]
    #[serde(alias = "llm_config_name")]
    llm_config_name: Option<String>,
    #[serde(default)]
    #[serde(alias = "llm_model_name")]
    llm_model_name: Option<String>,
    title: String,
    status: String,
    #[serde(alias = "created_at")]
    created_at: String,
    #[serde(alias = "updated_at")]
    updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct TrialMessage {
    id: i64,
    role: String,
    content: String,
    #[serde(alias = "created_at")]
    created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct TrialSessionDetail {
    session: TrialSessionSummary,
    #[serde(default)]
    source: Option<TrialSourceItem>,
    messages: Vec<TrialMessage>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct TrialWorkspaceResponse {
    endpoints: PlatformEndpoints,
    user: PlatformUserSummary,
    configs: Vec<TrialLlmConfigOption>,
    sources: Vec<TrialSourceItem>,
    sessions: Vec<TrialSessionSummary>,
}

#[derive(Debug, Clone, Deserialize)]
struct TrialSessionCreateResponseData {
    session_id: i64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct TrialSessionCreateResponse {
    session_id: i64,
}

#[derive(Debug, Clone, Deserialize)]
struct TrialSendMessageResponseData {
    reply: String,
    status: String,
    session_id: i64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct TrialSendMessageResponse {
    reply: String,
    status: String,
    session_id: i64,
}

#[derive(Debug, Clone, Deserialize)]
struct TrialDeleteSessionResponseData {
    session_id: i64,
    status: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct TrialDeleteSessionResponse {
    session_id: i64,
    status: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct UpdaterRuntimeConfig {
    pubkey: String,
    endpoints: Vec<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct AppUpdateCheckResponse {
    configured: bool,
    update_available: bool,
    current_version: String,
    version: Option<String>,
    body: Option<String>,
    date: Option<String>,
    source_path: Option<String>,
    manual_download_url: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct AppUpdateProgressEvent {
    stage: String,
    status: String,
    message: String,
}

// ---- v0.1.8: News, Dashboard, Auth ----

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct PlatformNews {
    id: i64,
    title: String,
    content: String,
    #[serde(alias = "is_published")]
    is_published: bool,
    #[serde(default, alias = "created_by_name")]
    created_by_name: Option<String>,
    #[serde(alias = "created_at")]
    created_at: String,
    #[serde(default, alias = "updated_at")]
    updated_at: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct DashboardOverviewResponse {
    total_qas: u32,
    reviewed_qas: u32,
    ongoing_tasks: u32,
    pending_qas: u32,
    imported_batches: u32,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct ChangePasswordResponse {
    success: bool,
}

#[derive(Debug, Clone, Deserialize)]
struct DashboardApiData {
    metrics: DashboardApiMetrics,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct DashboardApiMetrics {
    total_qas: u32,
    reviewed_qas: u32,
    ongoing_tasks: u32,
    pending_qas: u32,
    imported_batches: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct PlatformStats {
    #[serde(alias = "today_qa_count")]
    today_qas: u32,
    #[serde(alias = "week_qa_count")]
    week_qas: u32,
    #[serde(default, alias = "today_review_count")]
    today_reviews: Option<u32>,
    #[serde(default, alias = "week_review_count")]
    week_reviews: Option<u32>,
    #[serde(default, alias = "available_model_count")]
    available_models: Option<u32>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ExportsStatsDaily {
    period: String,
    #[serde(alias = "import_count")]
    import_count: u32,
    #[serde(default, alias = "review_count")]
    review_count: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ExportsStatsWeekly {
    period: String,
    #[serde(alias = "period_start")]
    period_start: String,
    #[serde(alias = "period_end")]
    period_end: String,
    #[serde(alias = "import_count")]
    import_count: u32,
    #[serde(default, alias = "review_count")]
    review_count: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ExportsStatsData {
    daily: Vec<ExportsStatsDaily>,
    weekly: Vec<ExportsStatsWeekly>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ModelChangelogEntry {
    id: i64,
    #[serde(alias = "model_name")]
    model_name: String,
    #[serde(alias = "change_type")]
    change_type: String,
    description: String,
    #[serde(alias = "created_at")]
    created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct FeedbackResponse {
    id: i64,
    #[serde(alias = "created_at")]
    created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct PlatformGenerateModel {
    id: i64,
    name: String,
    provider: String,
    base_url: String,
    model: String,
    temperature: f32,
    max_tokens: u32,
    batch_size: usize,
    max_in_flight: usize,
}

#[derive(Default)]
struct ActivePipelineState {
    cancel_flag: Mutex<Option<Arc<AtomicBool>>>,
}

#[tauri::command]
fn health_check() -> &'static str {
    "ok"
}

#[tauri::command]
fn stop_pipeline(state: tauri::State<'_, ActivePipelineState>) -> Result<bool, String> {
    let active_flag = state
        .cancel_flag
        .lock()
        .map_err(|_| "failed to lock active pipeline state".to_string())?
        .clone();

    let Some(cancel_flag) = active_flag else {
        return Ok(false);
    };

    cancel_flag.store(true, Ordering::Relaxed);
    Ok(true)
}

fn normalize_runtime_for_qa_mode(
    qa_mode: &str,
    target_count: usize,
    shard_size: usize,
    batch_size: usize,
    max_in_flight: usize,
    max_retries: u32,
    request_timeout_secs: u64,
    resume: bool,
) -> RuntimeConfig {
    let safe_target = target_count.max(1);
    let safe_shard_size = shard_size.max(1);
    let safe_batch_size = batch_size.max(1);
    let safe_max_in_flight = max_in_flight.max(1);

    if qa_mode == "cot" {
        return RuntimeConfig {
            target_count: safe_target,
            shard_size: safe_target.min(COT_SAFE_SHARD_SIZE_CAP).max(1),
            batch_size: COT_SAFE_BATCH_SIZE,
            max_in_flight: COT_SAFE_MAX_IN_FLIGHT,
            max_retries,
            request_timeout_secs,
            resume,
        };
    }

    RuntimeConfig {
        target_count: safe_target,
        shard_size: safe_shard_size,
        batch_size: safe_batch_size,
        max_in_flight: safe_max_in_flight,
        max_retries,
        request_timeout_secs,
        resume,
    }
}

fn normalize_cot_section_headers_for_language(
    headers: &[String],
    output_language: &str,
) -> Vec<String> {
    let normalized = headers
        .iter()
        .map(|value| value.trim().trim_end_matches(':').trim().to_string())
        .filter(|value| !value.is_empty())
        .collect::<Vec<_>>();
    if normalized.is_empty() {
        default_cot_section_headers_for_language(output_language)
    } else {
        normalized
    }
}

#[tauri::command]
fn preview_topic_spec(prompt: String, target_count: u32) -> Result<TopicSpec, String> {
    bootstrap_topic(&prompt, target_count).map_err(|err| err.to_string())
}

#[tauri::command]
fn save_local_pipeline_config(
    app: AppHandle,
    profile_name: Option<String>,
    request: PipelineRequest,
) -> Result<ConfigProfileSummary, String> {
    let profile_name = normalize_profile_name(profile_name);
    let path = local_pipeline_profile_path(&app, &profile_name).map_err(error_to_string)?;
    write_json(&path, &request).map_err(error_to_string)?;

    if profile_name == default_profile_name() {
        let legacy_path = legacy_local_pipeline_config_path(&app).map_err(error_to_string)?;
        write_json(&legacy_path, &request).map_err(error_to_string)?;
    }

    Ok(ConfigProfileSummary {
        name: profile_name,
        path: path.display().to_string(),
    })
}

#[tauri::command]
fn load_local_pipeline_config(
    app: AppHandle,
    profile_name: Option<String>,
) -> Result<Option<PipelineRequest>, String> {
    let profile_name = normalize_profile_name(profile_name);
    let path = local_pipeline_profile_path(&app, &profile_name).map_err(error_to_string)?;
    if !path.exists() {
        if profile_name == default_profile_name() {
            let legacy_path = legacy_local_pipeline_config_path(&app).map_err(error_to_string)?;
            if legacy_path.exists() {
                let content = fs::read_to_string(legacy_path).map_err(error_to_string)?;
                let request = serde_json::from_str(&content).map_err(error_to_string)?;
                return Ok(Some(request));
            }
        }
        return Ok(None);
    }
    let content = fs::read_to_string(path).map_err(error_to_string)?;
    let request = serde_json::from_str(&content).map_err(error_to_string)?;
    Ok(Some(request))
}

#[tauri::command]
fn list_local_pipeline_profiles(app: AppHandle) -> Result<Vec<ConfigProfileSummary>, String> {
    let mut profiles = Vec::new();
    let profiles_dir = local_pipeline_profiles_dir(&app).map_err(error_to_string)?;

    if profiles_dir.exists() {
        for entry in fs::read_dir(&profiles_dir).map_err(error_to_string)? {
            let path = entry.map_err(error_to_string)?.path();
            if path.extension().and_then(|ext| ext.to_str()) != Some("json") {
                continue;
            }
            let Some(name) = path
                .file_stem()
                .and_then(|stem| stem.to_str())
                .map(|value| value.to_string())
            else {
                continue;
            };
            profiles.push(ConfigProfileSummary {
                name,
                path: path.display().to_string(),
            });
        }
    }

    let default_name = default_profile_name();
    let has_default = profiles.iter().any(|profile| profile.name == default_name);
    let legacy_path = legacy_local_pipeline_config_path(&app).map_err(error_to_string)?;
    if !has_default && legacy_path.exists() {
        let default_path =
            local_pipeline_profile_path(&app, &default_name).map_err(error_to_string)?;
        profiles.push(ConfigProfileSummary {
            name: default_name,
            path: default_path.display().to_string(),
        });
    }

    profiles.sort_by(|left, right| left.name.cmp(&right.name));
    Ok(profiles)
}

fn load_default_pipeline_request(app: &AppHandle) -> anyhow::Result<Option<PipelineRequest>> {
    let default_name = default_profile_name();
    let path = local_pipeline_profile_path(app, &default_name)?;
    if path.exists() {
        return Ok(Some(read_json(&path)?));
    }

    let legacy_path = legacy_local_pipeline_config_path(app)?;
    if legacy_path.exists() {
        return Ok(Some(read_json(&legacy_path)?));
    }

    Ok(None)
}

fn default_managed_output_root(app: &AppHandle) -> anyhow::Result<PathBuf> {
    Ok(runtime_data_root(app)?.join("output"))
}

fn configured_managed_output_root(app: &AppHandle) -> anyhow::Result<PathBuf> {
    let Some(request) = load_default_pipeline_request(app)? else {
        return default_managed_output_root(app);
    };

    let Some(root) = request
        .managed_output_root
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
    else {
        return default_managed_output_root(app);
    };

    resolve_app_relative_path(app, root)
}

fn managed_output_root_for_request(
    app: &AppHandle,
    request: &PipelineRequest,
) -> anyhow::Result<PathBuf> {
    let Some(root) = request
        .managed_output_root
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
    else {
        return configured_managed_output_root(app);
    };

    resolve_app_relative_path(app, root)
}

#[tauri::command]
fn get_managed_output_root(app: AppHandle) -> Result<ManagedOutputRootResponse, String> {
    let output_root = default_managed_output_root(&app).map_err(error_to_string)?;
    Ok(ManagedOutputRootResponse {
        output_root: output_root.display().to_string(),
    })
}

#[tauri::command]
fn list_qa_batches(app: AppHandle) -> Result<Vec<QaBatchSummary>, String> {
    let mut batches = load_qa_batches(&app).map_err(error_to_string)?;
    batches.sort_by(|left, right| right.updated_at_ms.cmp(&left.updated_at_ms));
    Ok(batches)
}

#[tauri::command]
fn load_batch_pipeline_request(
    app: AppHandle,
    batch_id: String,
) -> Result<PipelineRequest, String> {
    let batch_dir = resolve_batch_dir(&app, &batch_id).map_err(error_to_string)?;
    let topic_path = batch_dir.join("topic.json");
    let config_path = batch_dir.join("generate_config.json");
    let plans_path = batch_dir.join("plans.json");

    let topic = if topic_path.exists() {
        Some(read_json::<TopicSpec>(&topic_path).map_err(error_to_string)?)
    } else {
        None
    };
    let config = if config_path.exists() {
        Some(read_json::<GenerateConfig>(&config_path).map_err(error_to_string)?)
    } else {
        None
    };
    let plan_limit = if plans_path.exists() {
        read_json::<Vec<QuestionPlan>>(&plans_path)
            .map(|plans| plans.len())
            .unwrap_or(0)
    } else {
        0
    };

    let topic_name = topic
        .as_ref()
        .map(|value| value.topic_name.clone())
        .unwrap_or_else(|| {
            batch_dir
                .file_name()
                .and_then(|value| value.to_str())
                .unwrap_or("qa-batch")
                .to_string()
        });
    let prompt = topic
        .as_ref()
        .map(|value| value.user_intent.clone())
        .unwrap_or_else(|| topic_name.clone());

    let target_count = topic
        .as_ref()
        .map(|value| value.target_count)
        .or_else(|| {
            config
                .as_ref()
                .map(|value| value.runtime.target_count as u32)
        })
        .unwrap_or(10);

    let config = config.unwrap_or_else(|| GenerateConfig {
        provider: ProviderConfig {
            provider: "openai-compatible".to_string(),
            model: "".to_string(),
            base_url: None,
            api_key: None,
            api_key_env: None,
            temperature: 0.8,
            max_tokens: 800,
        },
        runtime: RuntimeConfig {
            target_count: target_count as usize,
            shard_size: 10,
            batch_size: 1,
            max_in_flight: 1,
            max_retries: 3,
            request_timeout_secs: 180,
            resume: true,
        },
        qa_mode: default_qa_mode(),
        output_language: default_output_language(),
        cot_section_headers: default_cot_section_headers(),
        supporting_context: None,
    });

    Ok(PipelineRequest {
        prompt,
        topic_tags: Vec::new(),
        qa_mode: config.qa_mode,
        output_language: config.output_language,
        target_count,
        plan_limit: plan_limit.max(1),
        output_dir: "__managed__".to_string(),
        managed_output_root: batch_dir.parent().map(|value| value.display().to_string()),
        provider: config.provider.provider,
        model: config.provider.model,
        base_url: config.provider.base_url,
        api_key: None,
        api_key_env: None,
        temperature: config.provider.temperature,
        max_tokens: config.provider.max_tokens,
        shard_size: config.runtime.shard_size,
        batch_size: config.runtime.batch_size,
        max_in_flight: config.runtime.max_in_flight,
        max_retries: config.runtime.max_retries,
        request_timeout_secs: config.runtime.request_timeout_secs,
        resume: true,
        managed_run_mode: "resume-batch".to_string(),
        managed_run_batch_id: Some(batch_id),
        qa_platform_url: None,
        qa_platform_username: None,
        qa_platform_password: None,
        literature_api_url: None,
        literature_api_auth_token: None,
        cot_section_headers: config.cot_section_headers,
    })
}

#[tauri::command]
fn delete_qa_batch(app: AppHandle, batch_id: String) -> Result<(), String> {
    let batch_dir = resolve_batch_dir(&app, &batch_id).map_err(error_to_string)?;
    fs::remove_dir_all(&batch_dir).map_err(error_to_string)?;
    Ok(())
}

#[tauri::command]
fn repack_qa_batch(app: AppHandle, batch_id: String) -> Result<RepackQaBatchResponse, String> {
    let batch_dir = resolve_batch_dir(&app, &batch_id).map_err(error_to_string)?;
    repack_batch_dir(&app, &batch_dir).map_err(error_to_string)
}

#[tauri::command]
fn get_app_metadata(app: AppHandle) -> AppMetadataResponse {
    AppMetadataResponse {
        product_name: app.package_info().name.to_string(),
        version: app.package_info().version.to_string(),
    }
}

fn normalize_platform_url(input: &str) -> anyhow::Result<Url> {
    let trimmed = input.trim();
    if trimmed.is_empty() {
        anyhow::bail!("platform url is empty");
    }

    let candidate = if trimmed.contains("://") {
        trimmed.to_string()
    } else {
        format!("http://{trimmed}")
    };

    let mut url = Url::parse(&candidate)?;
    url.set_path("");
    url.set_query(None);
    url.set_fragment(None);
    Ok(url)
}

fn derive_platform_endpoints(platform_url: &str) -> anyhow::Result<PlatformEndpoints> {
    let normalized = normalize_platform_url(platform_url)?;
    let host = normalized
        .host_str()
        .ok_or_else(|| anyhow::anyhow!("platform url is missing host"))?
        .to_string();
    let scheme = normalized.scheme().to_string();
    let uses_development_ports = matches!(host.as_str(), "127.0.0.1" | "localhost" | "182.92.166.143");

    let normalized_platform_url = if let Some(port) = normalized.port() {
        format!("{scheme}://{host}:{port}")
    } else {
        format!("{scheme}://{host}")
    };

    if uses_development_ports {
        return Ok(PlatformEndpoints {
            normalized_platform_url,
            platform_web_base_url: format!("{scheme}://{host}:3100"),
            platform_api_base_url: format!("{scheme}://{host}:8100"),
        });
    }

    Ok(PlatformEndpoints {
        normalized_platform_url: normalized_platform_url.clone(),
        platform_web_base_url: normalized_platform_url.clone(),
        platform_api_base_url: normalized_platform_url,
    })
}

async fn platform_login_with_token(
    platform_url: &str,
    username: &str,
    password: &str,
) -> Result<(PlatformEndpoints, String, PlatformUserSummary), String> {
    let endpoints = derive_platform_endpoints(platform_url).map_err(error_to_string)?;
    let username = username.trim();
    let password = password.trim();
    if username.is_empty() {
        return Err("platform username is empty".to_string());
    }
    if password.is_empty() {
        return Err("platform password is empty".to_string());
    }

    let client = reqwest::Client::new();
    let login_response = client
        .post(format!(
            "{}/api/auth/login",
            endpoints.platform_api_base_url
        ))
        .json(&serde_json::json!({
            "username": username,
            "password": password,
        }))
        .send()
        .await
        .map_err(error_to_string)?;
    let login_status = login_response.status();
    if !login_status.is_success() {
        let body = login_response.text().await.unwrap_or_default();
        let detail = body.trim();
        return Err(if detail.is_empty() {
            format!(
                "platform login failed with status {}",
                login_status.as_u16()
            )
        } else {
            format!(
                "platform login failed with status {}: {}",
                login_status.as_u16(),
                detail
            )
        });
    }
    let login_payload = login_response
        .json::<ApiEnvelope<PlatformLoginEnvelopeData>>()
        .await
        .map_err(error_to_string)?;
    let token = login_payload.data.token;

    let me_response = client
        .get(format!("{}/api/me", endpoints.platform_api_base_url))
        .bearer_auth(&token)
        .send()
        .await
        .map_err(error_to_string)?;
    let me_status = me_response.status();
    if !me_status.is_success() {
        let body = me_response.text().await.unwrap_or_default();
        let detail = body.trim();
        return Err(if detail.is_empty() {
            format!(
                "platform profile fetch failed with status {}",
                me_status.as_u16()
            )
        } else {
            format!(
                "platform profile fetch failed with status {}: {}",
                me_status.as_u16(),
                detail
            )
        });
    }
    let me_payload = me_response
        .json::<ApiEnvelope<PlatformMeEnvelopeData>>()
        .await
        .map_err(error_to_string)?;

    let user = PlatformUserSummary {
        id: me_payload.data.id,
        username: me_payload.data.username,
        role: me_payload.data.role,
        status: me_payload.data.status,
        applications: me_payload
            .data
            .applications
            .into_iter()
            .map(|item| PlatformApplicationSummary {
                id: item.id,
                name: item.name,
            })
            .collect(),
    };

    Ok((endpoints, token, user))
}

async fn decode_platform_envelope<T: DeserializeOwned>(
    response: reqwest::Response,
) -> Result<T, String> {
    let status = response.status();
    if !status.is_success() {
        let body = response.text().await.unwrap_or_default();
        let detail = body.trim();
        return Err(if detail.is_empty() {
            format!("platform request failed with status {}", status.as_u16())
        } else {
            format!(
                "platform request failed with status {}: {}",
                status.as_u16(),
                detail
            )
        });
    }

    response
        .json::<ApiEnvelope<T>>()
        .await
        .map(|payload| payload.data)
        .map_err(error_to_string)
}

async fn platform_api_get<T: DeserializeOwned>(
    client: &reqwest::Client,
    token: &str,
    url: String,
) -> Result<T, String> {
    let response = client
        .get(url)
        .bearer_auth(token)
        .send()
        .await
        .map_err(error_to_string)?;
    decode_platform_envelope(response).await
}

async fn platform_api_post<B: Serialize, T: DeserializeOwned>(
    client: &reqwest::Client,
    token: &str,
    url: String,
    body: &B,
) -> Result<T, String> {
    let response = client
        .post(url)
        .bearer_auth(token)
        .json(body)
        .send()
        .await
        .map_err(error_to_string)?;
    decode_platform_envelope(response).await
}

async fn platform_api_delete<T: DeserializeOwned>(
    client: &reqwest::Client,
    token: &str,
    url: String,
) -> Result<T, String> {
    let response = client
        .delete(url)
        .bearer_auth(token)
        .send()
        .await
        .map_err(error_to_string)?;
    decode_platform_envelope(response).await
}


#[tauri::command]
async fn check_platform_health(platform_url: String) -> Result<PlatformHealthResponse, String> {
    let endpoints = derive_platform_endpoints(&platform_url).map_err(error_to_string)?;
    let client = reqwest::Client::new();
    let health_url = format!("{}/health", endpoints.platform_api_base_url);
    let auth_probe_url = format!("{}/api/auth/login", endpoints.platform_api_base_url);

    if let Ok(response) = client.get(&health_url).send().await {
        if response.status().is_success() {
            return Ok(PlatformHealthResponse {
                reachable: true,
                endpoints,
                message: "ok".to_string(),
            });
        }
    }

    if let Ok(response) = client
        .post(&auth_probe_url)
        .json(&serde_json::json!({
            "username": "__distill_probe__",
            "password": "__distill_probe__",
        }))
        .send()
        .await
    {
        let status = response.status();
        if status.is_success()
            || matches!(
                status,
                reqwest::StatusCode::BAD_REQUEST
                    | reqwest::StatusCode::UNAUTHORIZED
                    | reqwest::StatusCode::FORBIDDEN
                    | reqwest::StatusCode::UNPROCESSABLE_ENTITY
            )
        {
            return Ok(PlatformHealthResponse {
                reachable: true,
                endpoints,
                message: "ok".to_string(),
            });
        }
    }

    let response = client
        .get(&endpoints.platform_web_base_url)
        .send()
        .await
        .map_err(error_to_string)?;
    if !response.status().is_success() {
        return Err(format!(
            "platform health check failed with status {}",
            response.status().as_u16()
        ));
    }

    Ok(PlatformHealthResponse {
        reachable: true,
        endpoints,
        message: "ok".to_string(),
    })
}


#[tauri::command]
async fn login_platform(
    platform_url: String,
    username: String,
    password: String,
) -> Result<PlatformLoginResponse, String> {
    let (endpoints, _token, user) =
        platform_login_with_token(&platform_url, &username, &password).await?;
    Ok(PlatformLoginResponse { endpoints, user })
}

// ---- v0.1.8: News, Dashboard, Password, Logout ----

#[tauri::command]
async fn get_platform_news(
    platform_url: String,
    username: String,
    password: String,
) -> Result<Vec<PlatformNews>, String> {
    let (endpoints, token, _user) =
        platform_login_with_token(&platform_url, &username, &password).await?;
    let client = reqwest::Client::new();
    let news = platform_api_get::<Vec<PlatformNews>>(
        &client,
        &token,
        format!("{}/api/news", endpoints.platform_api_base_url),
    )
    .await?;
    Ok(news)
}

#[tauri::command]
async fn get_dashboard_overview(
    platform_url: String,
    username: String,
    password: String,
) -> Result<DashboardOverviewResponse, String> {
    let (endpoints, token, _user) =
        platform_login_with_token(&platform_url, &username, &password).await?;
    let client = reqwest::Client::new();
    let data = platform_api_get::<DashboardApiData>(
        &client,
        &token,
        format!(
            "{}/api/admin/dashboard",
            endpoints.platform_api_base_url
        ),
    )
    .await?;
    Ok(DashboardOverviewResponse {
        total_qas: data.metrics.total_qas,
        reviewed_qas: data.metrics.reviewed_qas,
        ongoing_tasks: data.metrics.ongoing_tasks,
        pending_qas: data.metrics.pending_qas,
        imported_batches: data.metrics.imported_batches,
    })
}

#[tauri::command]
async fn change_platform_password(
    platform_url: String,
    username: String,
    current_password: String,
    new_password: String,
) -> Result<ChangePasswordResponse, String> {
    let (endpoints, token, _user) =
        platform_login_with_token(&platform_url, &username, &current_password).await?;
    let client = reqwest::Client::new();
    platform_api_post::<_, serde_json::Value>(
        &client,
        &token,
        format!(
            "{}/api/me/change-password",
            endpoints.platform_api_base_url
        ),
        &serde_json::json!({
            "current_password": current_password,
            "new_password": new_password,
        }),
    )
    .await?;
    Ok(ChangePasswordResponse { success: true })
}

#[tauri::command]
async fn logout_platform(
    platform_url: String,
    username: String,
    password: String,
) -> Result<(), String> {
    let (endpoints, token, _user) =
        platform_login_with_token(&platform_url, &username, &password).await?;
    let client = reqwest::Client::new();
    platform_api_post::<_, serde_json::Value>(
        &client,
        &token,
        format!("{}/api/auth/logout", endpoints.platform_api_base_url),
        &serde_json::json!({}),
    )
    .await?;
    Ok(())
}

// ---- v0.1.8: Model changelog & feedback ----

#[tauri::command]
async fn get_model_changelog(
    platform_url: String,
    username: String,
    password: String,
    days: Option<u32>,
) -> Result<Vec<ModelChangelogEntry>, String> {
    let (endpoints, token, _user) =
        platform_login_with_token(&platform_url, &username, &password).await?;
    let client = reqwest::Client::new();
    let query = days.map(|d| format!("?days={}", d)).unwrap_or_default();
    let entries = platform_api_get::<Vec<ModelChangelogEntry>>(
        &client,
        &token,
        format!(
            "{}/api/models/changelog{}",
            endpoints.platform_api_base_url, query
        ),
    )
    .await?;
    Ok(entries)
}

#[tauri::command]
async fn submit_feedback(
    platform_url: String,
    username: String,
    password: String,
    title: String,
    content: String,
    category: String,
) -> Result<FeedbackResponse, String> {
    let (endpoints, token, _user) =
        platform_login_with_token(&platform_url, &username, &password).await?;
    let client = reqwest::Client::new();
    let response = platform_api_post::<_, FeedbackResponse>(
        &client,
        &token,
        format!("{}/api/feedback", endpoints.platform_api_base_url),
        &serde_json::json!({
            "title": title,
            "content": content,
            "category": category,
        }),
    )
    .await?;
    Ok(response)
}

#[tauri::command]
async fn get_platform_stats(
    platform_url: String,
    username: String,
    password: String,
) -> Result<PlatformStats, String> {
    let (endpoints, token, _user) =
        platform_login_with_token(&platform_url, &username, &password).await?;
    let client = reqwest::Client::new();
    let stats = platform_api_get::<PlatformStats>(
        &client,
        &token,
        format!("{}/api/stats", endpoints.platform_api_base_url),
    )
    .await?;
    Ok(stats)
}

#[tauri::command]
async fn get_exports_stats(
    platform_url: String,
    username: String,
    password: String,
) -> Result<ExportsStatsData, String> {
    let (endpoints, token, _user) =
        platform_login_with_token(&platform_url, &username, &password).await?;
    let client = reqwest::Client::new();
    let data = platform_api_get::<ExportsStatsData>(
        &client,
        &token,
        format!("{}/api/exports/stats", endpoints.platform_api_base_url),
    )
    .await?;
    Ok(data)
}

#[tauri::command]
async fn get_generate_models(
    platform_url: String,
    username: String,
    password: String,
) -> Result<Vec<PlatformGenerateModel>, String> {
    let (endpoints, token, _user) =
        platform_login_with_token(&platform_url, &username, &password).await?;
    let client = reqwest::Client::new();
    let models = platform_api_get::<Vec<PlatformGenerateModel>>(
        &client,
        &token,
        format!("{}/api/generate/models", endpoints.platform_api_base_url),
    )
    .await?;
    Ok(models)
}

#[tauri::command]
async fn load_model_trial_workspace(
    platform_url: String,
    username: String,
    password: String,
) -> Result<TrialWorkspaceResponse, String> {
    let (endpoints, token, user) =
        platform_login_with_token(&platform_url, &username, &password).await?;
    let client = reqwest::Client::new();

    let configs = platform_api_get::<Vec<TrialLlmConfigOption>>(
        &client,
        &token,
        format!(
            "{}/api/expert/model-trial/configs",
            endpoints.platform_api_base_url
        ),
    )
    .await?;
    let sources = platform_api_get::<Vec<TrialSourceItem>>(
        &client,
        &token,
        format!(
            "{}/api/expert/model-trial/sources",
            endpoints.platform_api_base_url
        ),
    )
    .await?;
    let sessions = platform_api_get::<Vec<TrialSessionSummary>>(
        &client,
        &token,
        format!(
            "{}/api/expert/model-trial/sessions",
            endpoints.platform_api_base_url
        ),
    )
    .await?;

    Ok(TrialWorkspaceResponse {
        endpoints,
        user,
        configs,
        sources,
        sessions,
    })
}

#[tauri::command]
async fn get_model_trial_session_detail(
    platform_url: String,
    username: String,
    password: String,
    session_id: i64,
) -> Result<TrialSessionDetail, String> {
    let (endpoints, token, _user) =
        platform_login_with_token(&platform_url, &username, &password).await?;
    let client = reqwest::Client::new();
    platform_api_get::<TrialSessionDetail>(
        &client,
        &token,
        format!(
            "{}/api/expert/model-trial/sessions/{}",
            endpoints.platform_api_base_url, session_id
        ),
    )
    .await
}

#[tauri::command]
async fn create_model_trial_session(
    platform_url: String,
    username: String,
    password: String,
    llm_config_id: i64,
    source_qa_item_id: Option<i64>,
    source_answer_id: Option<i64>,
    title: Option<String>,
) -> Result<TrialSessionCreateResponse, String> {
    let (endpoints, token, _user) =
        platform_login_with_token(&platform_url, &username, &password).await?;
    let client = reqwest::Client::new();
    let data = platform_api_post::<_, TrialSessionCreateResponseData>(
        &client,
        &token,
        format!(
            "{}/api/expert/model-trial/sessions",
            endpoints.platform_api_base_url
        ),
        &serde_json::json!({
            "llm_config_id": llm_config_id,
            "source_qa_item_id": source_qa_item_id,
            "source_answer_id": source_answer_id,
            "title": title,
        }),
    )
    .await?;
    Ok(TrialSessionCreateResponse {
        session_id: data.session_id,
    })
}

#[tauri::command]
async fn send_model_trial_message(
    platform_url: String,
    username: String,
    password: String,
    session_id: i64,
    content: String,
) -> Result<TrialSendMessageResponse, String> {
    let (endpoints, token, _user) =
        platform_login_with_token(&platform_url, &username, &password).await?;
    let client = reqwest::Client::new();
    let data = platform_api_post::<_, TrialSendMessageResponseData>(
        &client,
        &token,
        format!(
            "{}/api/expert/model-trial/sessions/{}/messages",
            endpoints.platform_api_base_url, session_id
        ),
        &serde_json::json!({ "content": content }),
    )
    .await?;
    Ok(TrialSendMessageResponse {
        reply: data.reply,
        status: data.status,
        session_id: data.session_id,
    })
}

#[tauri::command]
async fn delete_model_trial_session(
    platform_url: String,
    username: String,
    password: String,
    session_id: i64,
) -> Result<TrialDeleteSessionResponse, String> {
    let (endpoints, token, _user) =
        platform_login_with_token(&platform_url, &username, &password).await?;
    let client = reqwest::Client::new();
    let data = platform_api_delete::<TrialDeleteSessionResponseData>(
        &client,
        &token,
        format!(
            "{}/api/expert/model-trial/sessions/{}",
            endpoints.platform_api_base_url, session_id
        ),
    )
    .await?;
    Ok(TrialDeleteSessionResponse {
        session_id: data.session_id,
        status: data.status,
    })
}


#[tauri::command]
async fn list_platform_import_batches(
    platform_url: String,
    username: String,
    password: String,
) -> Result<Vec<PlatformImportBatchSummary>, String> {
    let (endpoints, token, _user) =
        platform_login_with_token(&platform_url, &username, &password).await?;
    let client = reqwest::Client::new();
    platform_api_get::<Vec<PlatformImportBatchSummary>>(
        &client,
        &token,
        format!("{}/api/expert/imports", endpoints.platform_api_base_url),
    )
    .await
}

#[tauri::command]
async fn get_platform_import_batch_detail(
    platform_url: String,
    username: String,
    password: String,
    batch_id: i64,
) -> Result<PlatformImportBatchDetail, String> {
    let (endpoints, token, _user) =
        platform_login_with_token(&platform_url, &username, &password).await?;
    let client = reqwest::Client::new();
    platform_api_get::<PlatformImportBatchDetail>(
        &client,
        &token,
        format!(
            "{}/api/expert/imports/{}",
            endpoints.platform_api_base_url, batch_id
        ),
    )
    .await
}

#[tauri::command]
fn open_external_url(url: String) -> Result<(), String> {
    let trimmed = url.trim();
    if trimmed.is_empty() {
        return Err("url is empty".to_string());
    }
    let candidate = if trimmed.contains("://") {
        trimmed.to_string()
    } else {
        format!("http://{trimmed}")
    };
    let parsed = Url::parse(&candidate).map_err(error_to_string)?;
    let target = parsed.as_str().to_string();

    #[cfg(target_os = "macos")]
    let mut command = {
        let mut command = Command::new("open");
        command.arg(&target);
        command
    };

    #[cfg(target_os = "linux")]
    let mut command = {
        let mut command = Command::new("xdg-open");
        command.arg(&target);
        command
    };

    #[cfg(target_os = "windows")]
    let mut command = {
        let mut command = Command::new("explorer");
        command.arg(&target);
        command
    };

    command.spawn().map_err(error_to_string)?;
    Ok(())
}

#[tauri::command]
async fn upload_qa_batch(
    app: AppHandle,
    batch_id: String,
    platform_url: String,
    username: String,
    password: String,
) -> Result<QaBatchUploadResponse, String> {
    let (endpoints, token, user) =
        platform_login_with_token(&platform_url, &username, &password).await?;
    let application = user
        .applications
        .first()
        .ok_or_else(|| "current platform account has no assigned application".to_string())?;
    let batch_dir = resolve_batch_dir(&app, &batch_id).map_err(error_to_string)?;
    let batch = build_qa_batch_summary(&app, &batch_dir).map_err(error_to_string)?;
    let items = load_batch_records(&batch_dir).map_err(error_to_string)?;
    let review_state = load_batch_review_state(&batch_dir).map_err(error_to_string)?;
    let items = upload_ready_records(items, &review_state);
    if items.is_empty() {
        return Err(if !review_state.items.is_empty() {
            "batch has no kept QA items to upload".to_string()
        } else {
            "batch has no QA items to upload".to_string()
        });
    }

    let technical_type_code = if matches!(batch.qa_mode.as_deref(), Some("cot")) {
        "cot_qa".to_string()
    } else {
        "direct_qa".to_string()
    };
    let rows = items
        .iter()
        .map(|item| PlatformImportRowPayload {
            id: item.id.clone(),
            question: item.question.clone(),
            answer: item.answer.clone(),
            context: format!(
                "Topic: {}\nSubtopic: {}\nAxis: {}\nQuestion Type: {}\nAudience: {}\nQA Mode: {}",
                item.topic_name,
                item.subtopic,
                item.axis,
                item.question_type,
                item.audience,
                item.qa_mode
            ),
            difficulty: item.difficulty.clone(),
            source: QA_PLATFORM_BATCH_SOURCE.to_string(),
            model: item.model.clone(),
            metadata: serde_json::json!({
                "topic_name": item.topic_name,
                "subtopic": item.subtopic,
                "axis": item.axis,
                "question_type": item.question_type,
                "audience": item.audience,
                "qa_mode": item.qa_mode,
                "provider": item.provider,
                "provider_model": item.model,
                "source_type": item.source_type,
                "grounding": item.grounding,
                "source_batch_name": batch.name,
                "source_batch_id": batch.id,
            }),
            candidate_answers: Vec::new(),
        })
        .collect::<Vec<_>>();
    let payload = PlatformImportPushPayload {
        name: if batch.topic_name.trim().is_empty() {
            batch.name.clone()
        } else {
            batch.topic_name.clone()
        },
        source: QA_PLATFORM_BATCH_SOURCE.to_string(),
        external_batch_id: batch.id.clone(),
        application_id: application.id,
        technical_type_code: technical_type_code.clone(),
        business_tag_codes: Vec::new(),
        rows,
        auto_parse: true,
        create_self_review: true,
    };

    let client = reqwest::Client::new();
    let response = client
        .post(format!(
            "{}/api/expert/imports/push",
            endpoints.platform_api_base_url
        ))
        .bearer_auth(token)
        .json(&payload)
        .send()
        .await
        .map_err(error_to_string)?;
    let status = response.status();
    if !status.is_success() {
        let body = response.text().await.unwrap_or_default();
        let body = body.trim();
        let detail = if body.is_empty() {
            format!("upload failed with status {}", status.as_u16())
        } else {
            format!("upload failed with status {}: {}", status.as_u16(), body)
        };
        return Err(detail);
    }
    let response_payload = response
        .json::<ApiEnvelope<PlatformImportPushResponseData>>()
        .await
        .map_err(error_to_string)?;

    Ok(QaBatchUploadResponse {
        uploaded_count: items.len(),
        platform_web_base_url: endpoints.platform_web_base_url,
        platform_api_base_url: endpoints.platform_api_base_url,
        batch_id: response_payload.data.batch_id,
        existing_batch: response_payload.data.existing_batch,
        self_review_status: response_payload.data.self_review_status,
        technical_type_code,
        application_id: application.id,
    })
}

#[tauri::command]
async fn push_chat_conversations(
    platform_url: String,
    username: String,
    password: String,
    session_name: String,
    external_batch_id: String,
    messages: Vec<PlatformChatMessagePayload>,
) -> Result<ChatUploadResponse, String> {
    let (endpoints, token, user) =
        platform_login_with_token(&platform_url, &username, &password).await?;
    let application = user
        .applications
        .first()
        .ok_or_else(|| "current platform account has no assigned application".to_string())?;

    let rows = vec![PlatformChatRowPayload {
        id: external_batch_id.clone(),
        messages,
        metadata: serde_json::json!({ "session_name": &session_name }),
    }];

    let payload = serde_json::json!({
        "name": session_name,
        "source": QA_PLATFORM_BATCH_SOURCE,
        "external_batch_id": external_batch_id,
        "application_id": application.id,
        "technical_type_code": "multi_turn_conversation",
        "business_tag_codes": [],
        "rows": rows,
        "auto_parse": true,
        "create_self_review": false,
    });

    let client = reqwest::Client::new();
    let response = client
        .post(format!(
            "{}/api/expert/imports/push",
            endpoints.platform_api_base_url
        ))
        .bearer_auth(&token)
        .json(&payload)
        .send()
        .await
        .map_err(error_to_string)?;
    let status = response.status();
    if !status.is_success() {
        let body = response.text().await.unwrap_or_default();
        let body = body.trim();
        let detail = if body.is_empty() {
            format!("upload failed with status {}", status.as_u16())
        } else {
            format!("upload failed with status {}: {}", status.as_u16(), body)
        };
        return Err(detail);
    }
    let response_payload = response
        .json::<ApiEnvelope<PlatformImportPushResponseData>>()
        .await
        .map_err(error_to_string)?;

    Ok(ChatUploadResponse {
        batch_id: response_payload.data.batch_id,
        external_batch_id,
        existing_batch: response_payload.data.existing_batch,
        import_status: None,
        parse_queued: None,
    })
}

// ---- Paper QA commands ----

fn paper_qa_mineru_base_url() -> Result<String, String> {
    std::env::var("MINERU_BASE_URL").map_err(|_| "MINERU_BASE_URL env var not set".to_string())
}

fn paper_qa_mineru_token() -> Result<String, String> {
    std::env::var("MINERU_API_TOKEN").map_err(|_| "MINERU_API_TOKEN env var not set".to_string())
}

#[tauri::command]
async fn convert_pdf_via_mineru(pdf_path: String) -> Result<String, String> {
    let pdf_path = std::path::Path::new(&pdf_path);
    let pdf_name = pdf_path
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("paper.pdf")
        .to_string();
    let pdf_data = tokio::fs::read(&pdf_path)
        .await
        .map_err(|e| format!("failed to read PDF: {}", e))?;

    let mineru_base = paper_qa_mineru_base_url()?;
    let mineru_token = paper_qa_mineru_token()?;
    let client = reqwest::Client::new();

    // Step 1: get signed upload URL
    let file_url_resp = client
        .post(format!("{}/file-urls/batch", mineru_base))
        .bearer_auth(&mineru_token)
        .json(&MinerUFileUrlRequest {
            files: vec![MinerUFileUrlItem {
                name: pdf_name.clone(),
            }],
            model_version: Some("vlm".to_string()),
        })
        .send()
        .await
        .map_err(|e| format!("MinerU file-urls request failed: {}", e))?;
    let file_url_status = file_url_resp.status();
    if !file_url_status.is_success() {
        let body = file_url_resp.text().await.unwrap_or_default();
        return Err(format!("MinerU file-urls failed with {}: {}", file_url_status.as_u16(), body));
    }
    let file_url_data = file_url_resp
        .json::<MinerUFileUrlResponse>()
        .await
        .map_err(|e| format!("failed to parse MinerU file-urls response: {}", e))?;
    let batch_id = file_url_data.data.batch_id.clone();
    let signed_url = file_url_data
        .data
        .file_urls
        .first()
        .ok_or("MinerU returned no file-url data")?
        .clone();

    // Step 2: upload PDF
    let put_resp = client
        .put(&signed_url)
        .body(pdf_data)
        .send()
        .await
        .map_err(|e| format!("MinerU PDF upload failed: {}", e))?;
    let put_status = put_resp.status();
    if !put_status.is_success() {
        let body = put_resp.text().await.unwrap_or_default();
        return Err(format!("MinerU PDF upload failed with {}: {}", put_status.as_u16(), body));
    }

    // Step 3: poll for result
    let extract_url = format!("{}/extract-results/batch/{}", mineru_base, batch_id);
    let deadline = std::time::Instant::now() + std::time::Duration::from_secs(600);
    let poll_interval = std::time::Duration::from_secs(3);
    let mut zip_url: Option<String> = None;

    while std::time::Instant::now() < deadline {
        let poll_resp = client
            .get(&extract_url)
            .bearer_auth(&mineru_token)
            .send()
            .await
            .map_err(|e| format!("MinerU poll failed: {}", e))?;
        let poll_status = poll_resp.status();
        if !poll_status.is_success() {
            let body = poll_resp.text().await.unwrap_or_default();
            return Err(format!("MinerU poll failed with {}: {}", poll_status.as_u16(), body));
        }
        let extract_data = poll_resp
            .json::<MinerUExtractResponse>()
            .await
            .map_err(|e| format!("failed to parse MinerU poll response: {}", e))?;
        let result = extract_data
            .data
            .extract_result
            .first()
            .ok_or("MinerU returned no extract_result")?;
        match result.state.as_str() {
            "done" => {
                zip_url = result.full_zip_url.clone();
                break;
            }
            "failed" => {
                return Err(format!(
                    "MinerU extraction failed: {}",
                    result.err_msg.as_deref().unwrap_or("unknown error")
                ));
            }
            _ => {
                tokio::time::sleep(poll_interval).await;
            }
        }
    }

    let zip_url = zip_url.ok_or("MinerU extraction timed out")?;

    // Step 4: download ZIP and extract MD
    let zip_bytes = client
        .get(&zip_url)
        .bearer_auth(&mineru_token)
        .send()
        .await
        .map_err(|e| format!("failed to download MinerU ZIP: {}", e))?
        .bytes()
        .await
        .map_err(|e| format!("failed to read MinerU ZIP: {}", e))?;

    let cursor = std::io::Cursor::new(zip_bytes);
    let mut archive = zip::ZipArchive::new(cursor).map_err(|e| format!("failed to open ZIP: {}", e))?;

    let pdf_stem = pdf_path
        .file_stem()
        .and_then(|n| n.to_str())
        .unwrap_or("paper");

    let mut md_content = String::new();
    // Priority: filename matching pdf_stem, then full.md, then first .md
    let mut fallback_md: Option<String> = None;
    for i in 0..archive.len() {
        let mut file = archive.by_index(i).map_err(|e| format!("ZIP entry error: {}", e))?;
        let name = file.name().to_string();
        if name.ends_with(".md") || name.ends_with(".MD") {
            use std::io::Read;
            let mut s = String::new();
            file.read_to_string(&mut s).map_err(|e| format!("ZIP read error: {}", e))?;
            if name.to_lowercase().contains(pdf_stem.to_lowercase().as_str()) {
                md_content = s;
                break;
            }
            if name.eq_ignore_ascii_case("full.md") {
                if md_content.is_empty() {
                    md_content = s;
                }
            } else if fallback_md.is_none() {
                fallback_md = Some(s);
            }
        }
    }
    if md_content.is_empty() {
        md_content = fallback_md.unwrap_or_default();
    }
    if md_content.is_empty() {
        return Err("no .md file found in MinerU ZIP".to_string());
    }

    Ok(md_content)
}

#[tauri::command]
async fn chunk_paper_md(md_text: String, paper_title: String) -> Result<Vec<PaperChunk>, String> {
    let re = regex::Regex::new(r"(?m)^\s*#{1,6}\s+.+").map_err(|e| format!("regex error: {}", e))?;
    let titles: Vec<usize> = re.find_iter(&md_text).map(|m| m.start()).collect();

    let mut chunks: Vec<PaperChunk> = Vec::new();
    let excluded_sections = [
        "references", "reference", "acknowledgements", "acknowledgment",
        "supplementary", "appendix", "author_contributions", "conflict_of_interest",
        "参考文献", "致谢", "附录", "补充材料",
    ];

    for i in 0..titles.len() {
        let start = titles[i];
        let end = if i + 1 < titles.len() { titles[i + 1] } else { md_text.len() };
        let text = md_text[start..end].trim().to_string();
        if text.len() < 200 {
            continue;
        }

        // Detect section type
        let lower = text.to_lowercase();
        let section_type = if lower.contains("method") || lower.contains("方法") || lower.contains("实验") || lower.contains("材料") {
            "methods"
        } else if lower.contains("result") || lower.contains("结果") {
            "results"
        } else if lower.contains("discuss") || lower.contains("讨论") {
            "discussion"
        } else if lower.contains("intro") || lower.contains("引言") || lower.contains("背景") || lower.contains("abstract") || lower.contains("摘要") {
            "introduction"
        } else {
            "other"
        };

        // Exclude certain sections
        let should_exclude = excluded_sections.iter().any(|s| lower.contains(s));
        if should_exclude {
            continue;
        }

        // Reference density check
        let ref_pattern = regex::Regex::new(r"\[\d+\]|\(\w+,\s*\d{4}\)").unwrap();
        let token_count = text.split_whitespace().count().max(1);
        let ref_count = ref_pattern.find_iter(&text).count();
        if (ref_count as f64 / token_count as f64) > 0.3 {
            continue;
        }

        let id = format!("chunk_{}_{}", paper_title.replace(' ', "_"), chunks.len());
        chunks.push(PaperChunk {
            id: id.chars().take(80).collect(),
            char_count: text.len(),
            section_type: section_type.to_string(),
            text,
        });
    }

    Ok(chunks)
}

fn extract_paper_qa_json(content: &str) -> Result<serde_json::Value, String> {
    let trimmed = content.trim();
    // Try direct parse first
    if let Ok(value) = serde_json::from_str(trimmed) {
        return Ok(value);
    }
    // Try extracting from markdown fences
    for segment in trimmed.split("```") {
        let s = segment.trim();
        let json_str = if s.starts_with('{') && s.ends_with('}') {
            s
        } else if let Some(rest) = s.strip_prefix("json") {
            rest.trim()
        } else {
            continue;
        };
        if json_str.starts_with('{') && json_str.ends_with('}') {
            if let Ok(value) = serde_json::from_str(json_str) {
                return Ok(value);
            }
        }
    }
    // Last resort: balanced brace extraction
    let bytes = trimmed.as_bytes();
    let mut start = None;
    let mut depth = 0u32;
    let mut in_string = false;
    let mut escaped = false;
    for (i, &b) in bytes.iter().enumerate() {
        if in_string {
            if escaped {
                escaped = false;
                continue;
            }
            match b {
                b'\\' => { escaped = true; continue; }
                b'"' => { in_string = false; continue; }
                _ => continue,
            }
        }
        match b {
            b'"' => { in_string = true; }
            b'{' => {
                if start.is_none() { start = Some(i); }
                depth += 1;
            }
            b'}' => {
                depth = depth.saturating_sub(1);
                if depth == 0 {
                    if let Some(start_idx) = start {
                        let json_slice = &trimmed[start_idx..=i];
                        if let Ok(value) = serde_json::from_str(json_slice) {
                            return Ok(value);
                        }
                        start = None;
                    }
                }
            }
            _ => {}
        }
    }
    Err(format!("Failed to extract JSON from: {}", &trimmed[..trimmed.len().min(500)]))
}

#[tauri::command]
async fn save_paper_qa_batch(
    app: AppHandle,
    items: Vec<PaperQaItem>,
    paper_title: String,
    provider: String,
    model: String,
) -> Result<QaBatchSummary, String> {
    let output_root = configured_managed_output_root(&app).map_err(error_to_string)?;
    let batch_dir = next_managed_output_dir(&output_root, &paper_title).map_err(error_to_string)?;

    let records: Vec<GeneratedQa> = items
        .iter()
        .map(|item| GeneratedQa {
            id: item.id.clone(),
            shard_id: 0,
            topic_name: item.paper_title.clone(),
            subtopic: item.section_type.clone(),
            axis: item.qa_type.clone(),
            question_type: "paper_qa".to_string(),
            difficulty: "medium".to_string(),
            audience: "researcher".to_string(),
            question: item.instruction.clone(),
            answer: item.output.clone(),
            source_type: "paper_qa".to_string(),
            grounding: item.reasoning.clone().unwrap_or_default(),
            provider: provider.clone(),
            model: model.clone(),
            qa_mode: item.qa_type.clone(),
        })
        .collect();

    let dataset_path = batch_dir.join("dataset.jsonl");
    write_jsonl(&dataset_path, &records).map_err(error_to_string)?;

    let topic = TopicSpec {
        user_intent: format!("Paper QA: {}", paper_title),
        topic_name: paper_title.clone(),
        goal: "Generated from PDF paper".to_string(),
        keywords: vec![],
        subtopics: vec![],
        question_axes: vec!["cot".to_string(), "qa".to_string()],
        target_count: items.len() as u32,
    };
    write_json(&batch_dir.join("topic.json"), &topic).map_err(error_to_string)?;

    let config = GenerateConfig {
        provider: ProviderConfig {
            provider,
            model,
            base_url: None,
            api_key: None,
            api_key_env: None,
            temperature: 0.1,
            max_tokens: 4096,
        },
        runtime: RuntimeConfig {
            target_count: items.len(),
            shard_size: 1,
            batch_size: 1,
            max_in_flight: 1,
            max_retries: 0,
            request_timeout_secs: 120,
            resume: false,
        },
        qa_mode: "mixed".to_string(),
        output_language: "zh".to_string(),
        cot_section_headers: vec![],
        supporting_context: None,
    };
    write_json(&batch_dir.join("generate_config.json"), &config).map_err(error_to_string)?;

    build_qa_batch_summary(&app, &batch_dir).map_err(error_to_string)
}

#[tauri::command]
async fn generate_paper_qa(
    _app: AppHandle,
    window: Window,
    request: PaperQaGenerateRequest,
) -> Result<PaperQaGenerateResponse, String> {
    let client = reqwest::Client::new();
    let cot_ratio = request.cot_ratio.clamp(0.0, 1.0);

    // Resolve auth: platform proxy (token) or direct API key
    let (url, auth_header_value): (String, String) =
        if let (Some(platform_url), Some(username), Some(password)) =
            (request.platform_url.as_ref(), request.username.as_ref(), request.password.as_ref())
        {
            let (_endpoints, token, _user) =
                platform_login_with_token(platform_url, username, password).await?;
            (
                format!("{}/api/generate/chat/completions", platform_url.trim_end_matches('/')),
                format!("Bearer {}", token),
            )
        } else {
            (
                format!("{}/chat/completions", request.base_url.trim_end_matches('/')),
                format!("Bearer {}", request.api_key),
            )
        };

    let cot_system = "你是农业科研助手。基于以下论文片段，生成3-5个思维链问答对。覆盖：研究动机与背景、方法原理与设计思路、参数选择依据、结果之间的逻辑关系、应用意义与展望。输出JSON格式。";

    let qa_system = "你是农业科普助手。基于以下论文片段，生成3-5个直接问答对。问题清晰具体，答案直接简洁，不做长篇推理分析。输出JSON格式。";

    let mut all_items: Vec<PaperQaItem> = Vec::new();
    let mut warnings: Vec<String> = Vec::new();
    let total = request.chunks.len();

    for (idx, chunk) in request.chunks.iter().enumerate() {
        let chunk_text: String = chunk.text.chars().take(8000).collect();

        // Emit progress: CoT started
        let _ = window.emit("paper-qa-progress", serde_json::json!({
            "step": "cot",
            "chunkIndex": idx,
            "totalChunks": total,
            "chunkId": chunk.id,
            "sectionType": chunk.section_type,
            "status": "started",
            "itemCount": all_items.len(),
            "message": format!("CoT: chunk {}/{} ({})", idx + 1, total, chunk.section_type)
        }));
        let _ = window.emit("paper-qa-log", serde_json::json!({
            "message": format!("CoT chunk {}/{}: section={}, {} chars", idx + 1, total, chunk.section_type, chunk.char_count)
        }));

        // Generate CoT
        let cot_human = format!(
            "论文: {}\n章节类型: {}\n内容:\n{}\n\n请生成思维链问答对。输出JSON: {{\"cot_items\": [{{\"instruction\": \"...\", \"reasoning\": \"...\", \"conclusion\": \"...\"}}]}}",
            request.paper_title, chunk.section_type, chunk_text
        );

        let cot_result: Result<Vec<PaperQaItem>, String> = async {
            let resp = client
                .post(&url)
                .header("Authorization", &auth_header_value)
                .json(&serde_json::json!({
                    "model": &request.model,
                    "messages": [
                        {"role": "system", "content": cot_system},
                        {"role": "user", "content": &cot_human}
                    ],
                    "temperature": 0.1,
                    "response_format": {"type": "json_object"}
                }))
                .timeout(std::time::Duration::from_secs(120))
                .send()
                .await
                .map_err(|e| format!("CoT request failed: {}", e))?;
            let status = resp.status();
            if !status.is_success() {
                let body = resp.text().await.unwrap_or_default();
                return Err(format!("CoT API error {}: {}", status.as_u16(), body));
            }
            let completion: LlmChatCompletionResponse = resp
                .json()
                .await
                .map_err(|e| format!("CoT parse error: {}", e))?;
            let content = completion
                .choices
                .first()
                .map(|c| c.message.content.clone())
                .unwrap_or_default();
            let parsed: LlmJsonCotResponse =
                serde_json::from_value(extract_paper_qa_json(&content)?)
                    .map_err(|e| format!("CoT JSON parse: {} — preview: {}", e, &content[..content.len().min(300)]))?;

            Ok(parsed.cot_items.into_iter().map(|item| PaperQaItem {
                id: format!("cot_{}", uuid::Uuid::new_v4()),
                qa_type: "cot".to_string(),
                instruction: item.instruction,
                reasoning: Some(item.reasoning),
                output: item.conclusion,
                paper_title: request.paper_title.clone(),
                chunk_id: chunk.id.clone(),
                section_type: chunk.section_type.clone(),
            }).collect())
        }.await;

        match cot_result {
            Ok(items) => {
                let added = items.len();
                all_items.extend(items);
                let _ = window.emit("paper-qa-progress", serde_json::json!({
                    "step": "cot",
                    "chunkIndex": idx,
                    "totalChunks": total,
                    "chunkId": chunk.id,
                    "status": "completed",
                    "itemCount": all_items.len(),
                    "message": format!("CoT: chunk {}/{} done, {} items", idx + 1, total, added)
                }));
            }
            Err(e) => {
                warnings.push(format!("CoT chunk {}: {}", chunk.id, e));
                let _ = window.emit("paper-qa-progress", serde_json::json!({
                    "step": "cot",
                    "chunkIndex": idx,
                    "totalChunks": total,
                    "chunkId": chunk.id,
                    "status": "error",
                    "itemCount": all_items.len(),
                    "message": format!("CoT: chunk {}/{} failed", idx + 1, total)
                }));
            }
        }

        // Emit progress: QA started
        let _ = window.emit("paper-qa-progress", serde_json::json!({
            "step": "qa",
            "chunkIndex": idx,
            "totalChunks": total,
            "chunkId": chunk.id,
            "sectionType": chunk.section_type,
            "status": "started",
            "itemCount": all_items.len(),
            "message": format!("QA: chunk {}/{} ({})", idx + 1, total, chunk.section_type)
        }));

        // Generate QA
        let qa_human = format!(
            "论文: {}\n章节类型: {}\n内容:\n{}\n\n请生成直接问答对。输出JSON: {{\"qa_items\": [{{\"question\": \"...\", \"context\": \"...\", \"answer\": \"...\"}}]}}",
            request.paper_title, chunk.section_type, chunk_text
        );

        let qa_result: Result<Vec<PaperQaItem>, String> = async {
            let resp = client
                .post(&url)
                .header("Authorization", &auth_header_value)
                .json(&serde_json::json!({
                    "model": &request.model,
                    "messages": [
                        {"role": "system", "content": qa_system},
                        {"role": "user", "content": &qa_human}
                    ],
                    "temperature": 0.1,
                    "response_format": {"type": "json_object"}
                }))
                .timeout(std::time::Duration::from_secs(120))
                .send()
                .await
                .map_err(|e| format!("QA request failed: {}", e))?;
            let status = resp.status();
            if !status.is_success() {
                let body = resp.text().await.unwrap_or_default();
                return Err(format!("QA API error {}: {}", status.as_u16(), body));
            }
            let completion: LlmChatCompletionResponse = resp
                .json()
                .await
                .map_err(|e| format!("QA parse error: {}", e))?;
            let content = completion
                .choices
                .first()
                .map(|c| c.message.content.clone())
                .unwrap_or_default();
            let parsed: LlmJsonQaResponse =
                serde_json::from_value(extract_paper_qa_json(&content)?)
                    .map_err(|e| format!("QA JSON parse: {} — preview: {}", e, &content[..content.len().min(300)]))?;

            Ok(parsed.qa_items.into_iter().map(|item| PaperQaItem {
                id: format!("qa_{}", uuid::Uuid::new_v4()),
                qa_type: "qa".to_string(),
                instruction: item.question,
                reasoning: None,
                output: item.answer,
                paper_title: request.paper_title.clone(),
                chunk_id: chunk.id.clone(),
                section_type: chunk.section_type.clone(),
            }).collect())
        }.await;

        match qa_result {
            Ok(items) => {
                let added = items.len();
                all_items.extend(items);
                let _ = window.emit("paper-qa-progress", serde_json::json!({
                    "step": "qa",
                    "chunkIndex": idx,
                    "totalChunks": total,
                    "chunkId": chunk.id,
                    "status": "completed",
                    "itemCount": all_items.len(),
                    "message": format!("QA: chunk {}/{} done, {} items", idx + 1, total, added)
                }));
            }
            Err(e) => {
                warnings.push(format!("QA chunk {}: {}", chunk.id, e));
                let _ = window.emit("paper-qa-progress", serde_json::json!({
                    "step": "qa",
                    "chunkIndex": idx,
                    "totalChunks": total,
                    "chunkId": chunk.id,
                    "status": "error",
                    "itemCount": all_items.len(),
                    "message": format!("QA: chunk {}/{} failed", idx + 1, total)
                }));
            }
        }
    }

    filter_paper_qa_inner(all_items, cot_ratio, warnings)
}

fn filter_paper_qa_inner(items: Vec<PaperQaItem>, cot_ratio: f64, warnings: Vec<String>) -> Result<PaperQaGenerateResponse, String> {
    // Stage 1: format + length filter
    let filtered: Vec<PaperQaItem> = items
        .into_iter()
        .filter(|item| {
            !item.instruction.is_empty()
                && !item.output.is_empty()
                && item.output.len() >= 30
                && (item.qa_type != "cot" || item.reasoning.as_ref().is_some_and(|r| !r.is_empty()))
        })
        .collect();

    // Stage 2: MD5 dedup
    use std::collections::HashSet;
    let mut seen: HashSet<String> = HashSet::new();
    let deduped: Vec<PaperQaItem> = filtered
        .into_iter()
        .filter(|item| {
            let prefix: String = item.output.chars().take(20).collect();
            let key = format!("{}|{}", item.instruction, prefix);
            seen.insert(key)
        })
        .collect();

    // Stage 3: ratio control (approximate)
    let (mut cot_items, mut qa_items): (Vec<PaperQaItem>, Vec<PaperQaItem>) =
        deduped.into_iter().partition(|i| i.qa_type == "cot");

    let total = cot_items.len() + qa_items.len();
    if total == 0 {
        return Ok(PaperQaGenerateResponse {
            items: vec![],
            stats: PaperQaStats {
                total: 0, cot_count: 0, qa_count: 0,
                cot_ratio: 0.0, qa_ratio: 0.0,
            },
            warnings,
        });
    }

    let target_cot = (total as f64 * cot_ratio) as usize;
    if cot_items.len() > target_cot {
        cot_items.truncate(target_cot);
    }
    let target_qa = total - target_cot;
    if qa_items.len() > target_qa {
        qa_items.truncate(target_qa);
    }

    let cot_count = cot_items.len();
    let qa_count = qa_items.len();
    let final_total = cot_count + qa_count;

    let mut final_items = cot_items;
    final_items.extend(qa_items);

    Ok(PaperQaGenerateResponse {
        items: final_items,
        stats: PaperQaStats {
            total: final_total,
            cot_count,
            qa_count,
            cot_ratio: if final_total > 0 { cot_count as f64 / final_total as f64 } else { 0.0 },
            qa_ratio: if final_total > 0 { qa_count as f64 / final_total as f64 } else { 0.0 },
        },
        warnings,
    })
}

#[tauri::command]
async fn get_qa_batch_platform_statuses(
    platform_url: String,
    username: String,
    password: String,
    batch_ids: Vec<String>,
) -> Result<QaBatchPlatformStatusResponse, String> {
    let (endpoints, token, _user) =
        platform_login_with_token(&platform_url, &username, &password).await?;
    let normalized_batch_ids = batch_ids
        .into_iter()
        .map(|batch_id| batch_id.trim().to_string())
        .filter(|batch_id| !batch_id.is_empty())
        .collect::<Vec<_>>();

    if normalized_batch_ids.is_empty() {
        return Ok(QaBatchPlatformStatusResponse {
            endpoints,
            items: Vec::new(),
        });
    }

    let mut lookup_items = Vec::new();
    for batch_id in &normalized_batch_ids {
        for external_batch_id in platform_status_lookup_candidates(batch_id) {
            lookup_items.push(PlatformImportBatchStatusLookupItem {
                source: QA_PLATFORM_BATCH_SOURCE.to_string(),
                external_batch_id,
            });
        }
    }

    let client = reqwest::Client::new();
    let response = platform_api_post::<
        PlatformImportBatchStatusLookupPayload,
        Vec<PlatformImportBatchStatus>,
    >(
        &client,
        &token,
        format!(
            "{}/api/expert/imports/status",
            endpoints.platform_api_base_url
        ),
        &PlatformImportBatchStatusLookupPayload {
            items: lookup_items,
        },
    )
    .await?;

    let mut status_map = std::collections::HashMap::new();
    for item in response {
        status_map.insert(item.external_batch_id.clone(), item);
    }

    let items = normalized_batch_ids
        .into_iter()
        .map(|batch_id| {
            let exact = status_map.get(&batch_id);
            let legacy = legacy_platform_external_batch_id(&batch_id)
                .and_then(|external_batch_id| status_map.get(&external_batch_id));
            match (exact, legacy) {
                (Some(status), _) if status.exists => {
                    normalize_platform_batch_status_for_batch_id(status, &batch_id)
                }
                (_, Some(status)) if status.exists => {
                    normalize_platform_batch_status_for_batch_id(status, &batch_id)
                }
                (Some(status), _) => {
                    normalize_platform_batch_status_for_batch_id(status, &batch_id)
                }
                (_, Some(status)) => {
                    normalize_platform_batch_status_for_batch_id(status, &batch_id)
                }
                _ => missing_platform_batch_status(&batch_id),
            }
        })
        .collect();

    Ok(QaBatchPlatformStatusResponse { endpoints, items })
}

fn platform_status_lookup_candidates(batch_id: &str) -> Vec<String> {
    let batch_id = batch_id.trim();
    if batch_id.is_empty() {
        return Vec::new();
    }

    let mut candidates = vec![batch_id.to_string()];
    if let Some(legacy) = legacy_platform_external_batch_id(batch_id) {
        candidates.push(legacy);
    }
    candidates
}

fn legacy_platform_external_batch_id(batch_id: &str) -> Option<String> {
    let batch_id = batch_id.trim();
    if batch_id.is_empty() || batch_id.starts_with("output/") {
        return None;
    }
    Some(format!("output/{batch_id}"))
}

fn normalize_platform_batch_status_for_batch_id(
    status: &PlatformImportBatchStatus,
    batch_id: &str,
) -> PlatformImportBatchStatus {
    let mut normalized = status.clone();
    normalized.external_batch_id = batch_id.to_string();
    normalized
}

fn missing_platform_batch_status(batch_id: &str) -> PlatformImportBatchStatus {
    PlatformImportBatchStatus {
        source: QA_PLATFORM_BATCH_SOURCE.to_string(),
        external_batch_id: batch_id.to_string(),
        exists: false,
        batch_id: None,
        import_status: None,
        is_processing: false,
        batch_status: "missing".to_string(),
        self_review_status: None,
        peer_review_status: None,
    }
}

#[tauri::command]
fn list_batch_qa_records(
    app: AppHandle,
    batch_id: String,
    page: Option<usize>,
    page_size: Option<usize>,
) -> Result<QaRecordPage, String> {
    let batch_dir = resolve_batch_dir(&app, &batch_id).map_err(error_to_string)?;
    let batch = build_qa_batch_summary(&app, &batch_dir).map_err(error_to_string)?;
    let records = load_batch_records(&batch_dir).map_err(error_to_string)?;
    let review_state = load_batch_review_state(&batch_dir).map_err(error_to_string)?;
    let page_size = page_size.unwrap_or(20).clamp(1, 200);
    let requested_page = page.unwrap_or(1).max(1);
    let total_items = records.len();
    let total_pages = if total_items == 0 {
        1
    } else {
        total_items.div_ceil(page_size)
    };
    let page = requested_page.min(total_pages);
    let start = (page - 1) * page_size;
    let end = (start + page_size).min(total_items);
    let items = if start >= total_items {
        Vec::new()
    } else {
        records[start..end]
            .iter()
            .map(|item| summarize_record(item, &review_state))
            .collect()
    };

    Ok(QaRecordPage {
        batch,
        items,
        page,
        page_size,
        total_items,
        total_pages,
    })
}

#[tauri::command]
fn list_batch_qa_question_options(
    app: AppHandle,
    batch_id: String,
) -> Result<Vec<QaRecordSummary>, String> {
    let batch_dir = resolve_batch_dir(&app, &batch_id).map_err(error_to_string)?;
    let records = load_batch_records(&batch_dir).map_err(error_to_string)?;
    let review_state = load_batch_review_state(&batch_dir).map_err(error_to_string)?;
    Ok(records
        .into_iter()
        .map(|item| summarize_record(&item, &review_state))
        .collect())
}

#[tauri::command]
fn get_batch_qa_record(
    app: AppHandle,
    batch_id: String,
    qa_id: String,
) -> Result<QaRecordDetail, String> {
    let batch_dir = resolve_batch_dir(&app, &batch_id).map_err(error_to_string)?;
    let batch = build_qa_batch_summary(&app, &batch_dir).map_err(error_to_string)?;
    let records = load_batch_records(&batch_dir).map_err(error_to_string)?;
    let review_state = load_batch_review_state(&batch_dir).map_err(error_to_string)?;
    let item = records
        .into_iter()
        .find(|record| record.id == qa_id)
        .ok_or_else(|| format!("QA record not found: {qa_id}"))?;

    Ok(QaRecordDetail {
        batch,
        review: review_snapshot_for_item(&item, &review_state),
        item,
    })
}

#[tauri::command]
fn save_batch_review_item(
    app: AppHandle,
    batch_id: String,
    qa_id: String,
    edited_question: Option<String>,
    status: Option<String>,
) -> Result<SaveBatchReviewItemResponse, String> {
    let batch_dir = resolve_batch_dir(&app, &batch_id).map_err(error_to_string)?;
    let records = load_batch_records(&batch_dir).map_err(error_to_string)?;
    let item = records
        .iter()
        .find(|record| record.id == qa_id)
        .ok_or_else(|| format!("QA record not found: {qa_id}"))?;
    let mut review_state = load_batch_review_state(&batch_dir).map_err(error_to_string)?;
    let entry = review_state.items.entry(qa_id.clone()).or_default();

    if let Some(status) = status {
        entry.status = parse_review_status(&status)
            .ok_or_else(|| format!("invalid review status: {status}"))?;
    }

    if let Some(question) = edited_question {
        entry.edited_question = normalize_edited_question(item, Some(question));
    }

    entry.updated_at_ms = system_time_to_ms(SystemTime::now());
    if entry.status == ReviewStatus::Unreviewed && entry.edited_question.is_none() {
        review_state.items.remove(&qa_id);
    }

    persist_batch_review_state(&batch_dir, &review_state).map_err(error_to_string)?;
    let review = review_snapshot_for_item(item, &review_state);
    Ok(SaveBatchReviewItemResponse {
        review,
        summary: summarize_review_state(&review_state),
    })
}

#[tauri::command]
fn open_path(app: AppHandle, path: String) -> Result<(), String> {
    let target = resolve_app_relative_path(&app, path.trim()).map_err(error_to_string)?;
    if target.as_os_str().is_empty() {
        return Err("path is empty".to_string());
    }
    if !target.exists() {
        return Err(format!("path does not exist: {}", target.display()));
    }

    #[cfg(target_os = "macos")]
    let mut command = {
        let mut command = Command::new("open");
        command.arg(&target);
        command
    };

    #[cfg(target_os = "linux")]
    let mut command = {
        let mut command = Command::new("xdg-open");
        command.arg(&target);
        command
    };

    #[cfg(target_os = "windows")]
    let mut command = {
        let mut command = Command::new("explorer");
        command.arg(&target);
        command
    };

    command.spawn().map_err(error_to_string)?;
    Ok(())
}

#[tauri::command]
async fn check_for_app_update(
    app: AppHandle,
    window: Window,
) -> Result<AppUpdateCheckResponse, String> {
    let current_version = app.package_info().version.to_string();
    let manual_download_url = manual_download_url(&app);
    let (updater, source_path) = match build_effective_updater(&app).map_err(error_to_string)? {
        Some(value) => value,
        None => {
            emit_app_update_event(
                &window,
                "check",
                "skipped",
                "Updater is not configured. Add a local updater.json or ship a release build updater config first.",
            );
            return Ok(AppUpdateCheckResponse {
                configured: false,
                update_available: false,
                current_version,
                version: None,
                body: None,
                date: None,
                source_path: None,
                manual_download_url,
            });
        }
    };

    emit_app_update_event(&window, "check", "running", "Checking for app updates.");
    let mut update = None;
    let mut last_error = None;
    for attempt in 1..=2 {
        match timeout(Duration::from_secs(8), updater.check()).await {
            Ok(Ok(result)) => {
                update = result;
                last_error = None;
                break;
            }
            Ok(Err(error)) => {
                let message = error_to_string(error);
                last_error = Some(message.clone());
                if attempt < 2 {
                    emit_app_update_event(
                        &window,
                        "check",
                        "running",
                        &format!(
                            "Update check attempt {} failed. Retrying once: {}",
                            attempt, message
                        ),
                    );
                    sleep(Duration::from_millis(600)).await;
                    continue;
                }
            }
            Err(_) => {
                let message =
                    "Update check timed out after 8 seconds while connecting to the update service.";
                last_error = Some(message.to_string());
                if attempt < 2 {
                    emit_app_update_event(
                        &window,
                        "check",
                        "running",
                        "Update check timed out once. Retrying one more time.",
                    );
                    sleep(Duration::from_millis(600)).await;
                    continue;
                }
            }
        }
    }

    if let Some(message) = last_error {
        emit_app_update_event(&window, "check", "failed", &message);
        return Err(message);
    }

    if let Some(update) = update {
        emit_app_update_event(
            &window,
            "check",
            "completed",
            &format!("Update {} is available.", update.version),
        );
        Ok(AppUpdateCheckResponse {
            configured: true,
            update_available: true,
            current_version,
            version: Some(update.version),
            body: update.body,
            date: update.date.map(|value| value.to_string()),
            source_path: source_path.map(|value| value.display().to_string()),
            manual_download_url,
        })
    } else {
        emit_app_update_event(
            &window,
            "check",
            "completed",
            &format!("No update found. Current version is {}.", current_version),
        );
        Ok(AppUpdateCheckResponse {
            configured: true,
            update_available: false,
            current_version,
            version: None,
            body: None,
            date: None,
            source_path: source_path.map(|value| value.display().to_string()),
            manual_download_url,
        })
    }
}

#[tauri::command]
async fn install_app_update(app: AppHandle, window: Window) -> Result<(), String> {
    let Some((updater, _)) = build_effective_updater(&app).map_err(error_to_string)? else {
        return Err(
            "Updater is not configured. Add updater.json or ship a release build updater config before trying to install updates."
                .to_string(),
        );
    };

    emit_app_update_event(
        &window,
        "install",
        "running",
        "Preparing update installation.",
    );
    let Some(update) = timeout(Duration::from_secs(8), updater.check())
        .await
        .map_err(|_| {
            let message = "Update install check timed out after 8 seconds.".to_string();
            emit_app_update_event(&window, "install", "failed", &message);
            message
        })?
        .map_err(error_to_string)?
    else {
        emit_app_update_event(
            &window,
            "install",
            "skipped",
            "No update is currently available.",
        );
        return Err("No update is currently available.".to_string());
    };

    let target_version = update.version.clone();
    emit_app_update_event(
        &window,
        "install",
        "running",
        &format!("Downloading update {}.", target_version),
    );

    let progress_window = window.clone();
    let mut downloaded = 0usize;
    let mut next_percent_mark = 10usize;
    update
        .download_and_install(
            move |chunk_length, content_length| {
                downloaded += chunk_length;
                let Some(total_bytes) = content_length else {
                    return;
                };
                if total_bytes == 0 {
                    return;
                }

                let percent = downloaded.saturating_mul(100) / total_bytes as usize;
                if percent >= next_percent_mark {
                    emit_app_update_event(
                        &progress_window,
                        "download",
                        "running",
                        &format!("Update download progress: {}%.", percent.min(100)),
                    );
                    while next_percent_mark <= percent {
                        next_percent_mark += 10;
                    }
                }
            },
            {
                let ready_window = window.clone();
                let ready_version = target_version.clone();
                move || {
                    emit_app_update_event(
                        &ready_window,
                        "download",
                        "completed",
                        &format!("Update {} has been downloaded.", ready_version),
                    );
                }
            },
        )
        .await
        .map_err(|error| {
            let message = error_to_string(error);
            emit_app_update_event(&window, "install", "failed", &message);
            message
        })?;

    emit_app_update_event(
        &window,
        "install",
        "completed",
        &format!(
            "Update {} installed. The app will restart to finish the upgrade.",
            target_version
        ),
    );
    app.restart();
}

#[tauri::command]
async fn run_pipeline(
    app: AppHandle,
    window: Window,
    state: tauri::State<'_, ActivePipelineState>,
    request: PipelineRequest,
) -> Result<PipelineResponse, String> {
    let cancel_flag = Arc::new(AtomicBool::new(false));
    {
        let mut active_flag = state
            .cancel_flag
            .lock()
            .map_err(|_| "failed to lock active pipeline state".to_string())?;
        if active_flag.is_some() {
            return Err("pipeline is already running".to_string());
        }
        *active_flag = Some(cancel_flag.clone());
    }

    let result = run_pipeline_inner(app, window, request, cancel_flag).await;

    let mut active_flag = state
        .cancel_flag
        .lock()
        .map_err(|_| "failed to lock active pipeline state".to_string())?;
    *active_flag = None;

    result
}

async fn run_pipeline_inner(
    app: AppHandle,
    window: Window,
    request: PipelineRequest,
    cancel_flag: Arc<AtomicBool>,
) -> Result<PipelineResponse, String> {
    let total_steps = 5usize;
    emit_pipeline_event(
        &window,
        "bootstrap",
        "running",
        "Starting pipeline bootstrap.",
        0,
        total_steps,
    );

    let topic = bootstrap_topic(&request.prompt, request.target_count).map_err(error_to_string)?;
    emit_pipeline_event(
        &window,
        "bootstrap",
        "completed",
        &format!("Topic spec ready for `{}`.", topic.topic_name),
        1,
        total_steps,
    );

    let plans = draft_question_plans(&topic, request.plan_limit);
    emit_pipeline_event(
        &window,
        "plan",
        "completed",
        &format!("Drafted {} question plans.", plans.len()),
        2,
        total_steps,
    );

    let (output_dir, reused_existing_output) =
        if request.output_dir.trim() == "__managed__" || request.output_dir.trim().is_empty() {
            let managed_output_root =
                managed_output_root_for_request(&app, &request).map_err(error_to_string)?;
            if request.managed_run_mode == "resume-batch" {
                let batch_id = request.managed_run_batch_id.as_deref().ok_or_else(|| {
                    "managed_run_batch_id is required for resume-batch".to_string()
                })?;
                (
                    resolve_batch_dir(&app, batch_id).map_err(error_to_string)?,
                    true,
                )
            } else if request.managed_run_mode == "resume-latest" {
                if let Some(existing_dir) =
                    find_latest_matching_batch_dir(&app, &request).map_err(error_to_string)?
                {
                    (existing_dir, true)
                } else {
                    (
                        next_managed_output_dir(&managed_output_root, &topic.topic_name)
                            .map_err(error_to_string)?,
                        false,
                    )
                }
            } else {
                (
                    next_managed_output_dir(&managed_output_root, &topic.topic_name)
                        .map_err(error_to_string)?,
                    false,
                )
            }
        } else {
            (
                resolve_app_relative_path(&app, &request.output_dir).map_err(error_to_string)?,
                false,
            )
        };

    let mut config = GenerateConfig {
        provider: ProviderConfig {
            provider: request.provider,
            model: request.model,
            base_url: request.base_url.filter(|value| !value.trim().is_empty()),
            api_key: request.api_key.filter(|value| !value.trim().is_empty()),
            api_key_env: request.api_key_env.filter(|value| !value.trim().is_empty()),
            temperature: request.temperature,
            max_tokens: request.max_tokens,
        },
        runtime: normalize_runtime_for_qa_mode(
            &request.qa_mode,
            topic.target_count as usize,
            request.shard_size,
            request.batch_size,
            request.max_in_flight,
            request.max_retries,
            request.request_timeout_secs,
            request.resume,
        ),
        qa_mode: request.qa_mode.clone(),
        output_language: request.output_language.clone(),
        cot_section_headers: normalize_cot_section_headers_for_language(
            &request.cot_section_headers,
            &request.output_language,
        ),
        supporting_context: None,
    };

    // Auto-detect platform proxy auth: if all three platform fields are present,
    // login with token and override base_url/api_key. Matches Paper QA pattern.
    if let (Some(platform_url), Some(username), Some(password)) = (
        request.qa_platform_url.as_ref(),
        request.qa_platform_username.as_ref(),
        request.qa_platform_password.as_ref(),
    ) {
        if config.provider.base_url.as_ref().is_none_or(|u| u.trim().is_empty()) {
            let (_endpoints, token, _user) =
                platform_login_with_token(platform_url, username, password).await?;
            config.provider.base_url = Some(format!(
                "{}/api/generate",
                platform_url.trim_end_matches('/')
            ));
            config.provider.api_key = Some(token);
        }
    }

    let generated_dir = output_dir.join("generated");
    let topic_path = output_dir.join("topic.json");
    let plans_path = output_dir.join("plans.json");
    let config_path = output_dir.join("generate_config.json");
    let dataset_path = output_dir.join("dataset.jsonl");
    let pack_summary_path = output_dir.join("pack_summary.json");

    write_json(&topic_path, &topic).map_err(error_to_string)?;
    write_json(&plans_path, &plans).map_err(error_to_string)?;
    let mut config_for_disk = config.clone();
    config_for_disk.provider.api_key = None;
    write_json(&config_path, &config_for_disk).map_err(error_to_string)?;
    emit_pipeline_event(
        &window,
        "write-config",
        "completed",
        &if reused_existing_output {
            format!(
                "Continuing existing task. Wrote topic, plans, and config into {}.",
                output_dir.display()
            )
        } else {
            format!(
                "Wrote topic, plans, and config into {}.",
                output_dir.display()
            )
        },
        3,
        total_steps,
    );

    emit_pipeline_event(
        &window,
        "generate",
        "running",
        &format!(
            "Generating {} {} items with {} / {}.",
            config.runtime.target_count,
            config.qa_mode,
            config.provider.provider,
            config.provider.model
        ),
        3,
        total_steps,
    );
    let progress_window = window.clone();
    let progress_callback = move |event: RuntimeProgress| {
        emit_runtime_progress_event(&progress_window, &event, total_steps);
    };
    let generated_summary = generate_to_directory_with_progress(
        &topic,
        &plans,
        &config,
        &generated_dir,
        Some(&progress_callback),
        Some(cancel_flag.as_ref()),
    )
    .await
    .map_err(|error| {
        if is_pipeline_cancelled_error(&error) {
            emit_pipeline_event(
                &window,
                "generate",
                "cancelled",
                "Pipeline stop requested. Generation was cancelled before packing.",
                3,
                total_steps,
            );
        }
        error_to_string(error)
    })?;
    emit_pipeline_event(
        &window,
        "generate",
        "completed",
        &format!(
            "Generated {} items across {} shards.",
            generated_summary.generated_count, generated_summary.shard_count
        ),
        4,
        total_steps,
    );

    emit_pipeline_event(
        &window,
        "pack",
        "running",
        "Packing generated shards into dataset.jsonl.",
        4,
        total_steps,
    );
    let packed = pack_generated_batch(&topic, &generated_dir, &dataset_path, &pack_summary_path)
        .map_err(error_to_string)?;
    emit_pipeline_event(
        &window,
        "pack",
        "completed",
        &format!(
            "Packed {} kept records. Off-topic filtered: {}.",
            packed.kept, packed.dropped_off_topic
        ),
        5,
        total_steps,
    );

    let response = PipelineResponse {
        topic,
        generated_summary,
        kept_count: packed.kept,
        output_dir: output_dir.display().to_string(),
        topic_path: topic_path.display().to_string(),
        plans_path: plans_path.display().to_string(),
        config_path: config_path.display().to_string(),
        generated_dir: generated_dir.display().to_string(),
        dataset_path: dataset_path.display().to_string(),
        pack_summary_path: pack_summary_path.display().to_string(),
    };

    emit_pipeline_event(
        &window,
        "complete",
        "completed",
        &format!(
            "Pipeline finished. Dataset written to {}.",
            response.dataset_path
        ),
        total_steps,
        total_steps,
    );

    Ok(response)
}

fn write_json<T: Serialize>(path: &Path, value: &T) -> anyhow::Result<()> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)?;
    }
    fs::write(path, serde_json::to_string_pretty(value)?)?;
    Ok(())
}

fn write_jsonl(path: &Path, records: &[GeneratedQa]) -> anyhow::Result<()> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)?;
    }
    let mut content = String::new();
    for record in records {
        content.push_str(&serde_json::to_string(record)?);
        content.push('\n');
    }
    fs::write(path, content)?;
    Ok(())
}

fn pack_generated_batch(
    topic: &TopicSpec,
    generated_dir: &Path,
    dataset_path: &Path,
    pack_summary_path: &Path,
) -> anyhow::Result<PackedDataset> {
    let (_, records) = load_generated_records(generated_dir)?;
    let pack_config: PackConfig = default_pack_config();
    let packed = pack_qa_records(topic, records, &pack_config);
    write_jsonl(dataset_path, &packed.items)?;
    write_json(pack_summary_path, &packed)?;
    Ok(packed)
}

fn repack_batch_dir(app: &AppHandle, batch_dir: &Path) -> anyhow::Result<RepackQaBatchResponse> {
    let topic_path = batch_dir.join("topic.json");
    let generated_dir = batch_dir.join("generated");
    let dataset_path = batch_dir.join("dataset.jsonl");
    let pack_summary_path = batch_dir.join("pack_summary.json");

    if !topic_path.exists() {
        anyhow::bail!("topic.json not found in {}", batch_dir.display());
    }
    if !generated_dir.exists() || !has_generated_shards(batch_dir) {
        anyhow::bail!("generated shards not found in {}", batch_dir.display());
    }

    let topic: TopicSpec = read_json(&topic_path)?;
    let packed = pack_generated_batch(&topic, &generated_dir, &dataset_path, &pack_summary_path)?;
    let batch = build_qa_batch_summary(app, batch_dir)?;

    Ok(RepackQaBatchResponse {
        batch,
        kept_count: packed.kept,
        total_input: packed.total_input,
        dropped_off_topic: packed.dropped_off_topic,
        dataset_path: dataset_path.display().to_string(),
        pack_summary_path: pack_summary_path.display().to_string(),
    })
}

fn load_generated_shards(input_dir: &Path) -> anyhow::Result<Vec<QaShard>> {
    let mut paths = fs::read_dir(input_dir)?
        .filter_map(|entry| entry.ok().map(|e| e.path()))
        .filter(|path| {
            path.extension().and_then(|ext| ext.to_str()) == Some("json")
                && path.file_name().and_then(|name| name.to_str()) != Some("summary.json")
        })
        .collect::<Vec<_>>();
    paths.sort();

    paths
        .into_iter()
        .map(|path| -> anyhow::Result<QaShard> {
            let content = fs::read_to_string(&path)?;
            Ok(serde_json::from_str(&content)?)
        })
        .collect()
}

fn load_generated_records(input_dir: &Path) -> anyhow::Result<(String, Vec<GeneratedQa>)> {
    let shards = load_generated_shards(input_dir)?;
    let topic_name = shards
        .first()
        .map(|shard| shard.topic_name.clone())
        .unwrap_or_default();
    let records = shards.into_iter().flat_map(|shard| shard.items).collect();

    Ok((topic_name, records))
}

fn load_batch_records(batch_dir: &Path) -> anyhow::Result<Vec<GeneratedQa>> {
    let dataset_path = batch_dir.join("dataset.jsonl");
    if dataset_path.exists() {
        let records = read_jsonl_records(&dataset_path)?;
        if !records.is_empty() {
            return Ok(records);
        }
    }

    let pack_summary_path = batch_dir.join("pack_summary.json");
    if pack_summary_path.exists() {
        let packed: PackedDataset = read_json(&pack_summary_path)?;
        if !packed.items.is_empty() {
            return Ok(packed.items);
        }
    }

    let generated_dir = batch_dir.join("generated");
    if generated_dir.exists() {
        let (_, records) = load_generated_records(&generated_dir)?;
        return Ok(records);
    }

    anyhow::bail!("no QA records found in {}", batch_dir.display());
}

fn batch_review_state_path(batch_dir: &Path) -> PathBuf {
    batch_dir.join("review_state.json")
}

fn load_batch_review_state(batch_dir: &Path) -> anyhow::Result<BatchReviewState> {
    let path = batch_review_state_path(batch_dir);
    if !path.exists() {
        return Ok(BatchReviewState::default());
    }
    read_json(&path)
}

fn persist_batch_review_state(batch_dir: &Path, state: &BatchReviewState) -> anyhow::Result<()> {
    let path = batch_review_state_path(batch_dir);
    if state.items.is_empty() {
        if path.exists() {
            fs::remove_file(path)?;
        }
        return Ok(());
    }
    write_json(&path, state)
}

fn parse_review_status(value: &str) -> Option<ReviewStatus> {
    match value.trim() {
        "unreviewed" => Some(ReviewStatus::Unreviewed),
        "kept" => Some(ReviewStatus::Kept),
        "discarded" => Some(ReviewStatus::Discarded),
        _ => None,
    }
}

fn normalize_edited_question(item: &GeneratedQa, value: Option<String>) -> Option<String> {
    value.and_then(|question| {
        let trimmed = question.trim();
        if trimmed.is_empty() || trimmed == item.question.trim() {
            None
        } else {
            Some(trimmed.to_string())
        }
    })
}

fn review_snapshot_for_item(item: &GeneratedQa, state: &BatchReviewState) -> QaRecordReview {
    let review = state.items.get(&item.id);
    let edited_question = review
        .and_then(|value| value.edited_question.clone())
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty());
    QaRecordReview {
        status: review.map(|value| value.status).unwrap_or_default(),
        effective_question: edited_question
            .clone()
            .unwrap_or_else(|| item.question.clone()),
        edited_question,
        updated_at_ms: review.and_then(|value| value.updated_at_ms),
    }
}

fn summarize_record(item: &GeneratedQa, review_state: &BatchReviewState) -> QaRecordSummary {
    let review = review_snapshot_for_item(item, review_state);
    QaRecordSummary {
        id: item.id.clone(),
        question: item.question.clone(),
        subtopic: item.subtopic.clone(),
        axis: item.axis.clone(),
        question_type: item.question_type.clone(),
        difficulty: item.difficulty.clone(),
        audience: item.audience.clone(),
        review_status: review.status,
        edited_question: review.edited_question,
        effective_question: review.effective_question,
    }
}

fn summarize_review_state(state: &BatchReviewState) -> QaBatchReviewSummary {
    let mut summary = QaBatchReviewSummary::default();
    for item in state.items.values() {
        match item.status {
            ReviewStatus::Kept => {
                summary.reviewed_count += 1;
                summary.kept_count += 1;
            }
            ReviewStatus::Discarded => {
                summary.reviewed_count += 1;
                summary.discarded_count += 1;
            }
            ReviewStatus::Unreviewed => {}
        }
    }
    summary
}

fn upload_ready_records(
    records: Vec<GeneratedQa>,
    review_state: &BatchReviewState,
) -> Vec<GeneratedQa> {
    if review_state.items.is_empty() {
        return records;
    }

    records
        .into_iter()
        .filter_map(|mut item| {
            let review = review_snapshot_for_item(&item, review_state);
            if review.status != ReviewStatus::Kept {
                return None;
            }
            item.question = review.effective_question;
            Some(item)
        })
        .collect()
}

fn read_jsonl_records(path: &Path) -> anyhow::Result<Vec<GeneratedQa>> {
    let content = fs::read_to_string(path)?;
    let mut records = Vec::new();

    for (idx, line) in content.lines().enumerate() {
        let trimmed = line.trim();
        if trimmed.is_empty() {
            continue;
        }
        let record = serde_json::from_str(trimmed).with_context(|| {
            format!(
                "failed to parse dataset line {} in {}",
                idx + 1,
                path.display()
            )
        })?;
        records.push(record);
    }

    Ok(records)
}

fn load_qa_batches(app: &AppHandle) -> anyhow::Result<Vec<QaBatchSummary>> {
    let output_root = configured_managed_output_root(app)?;
    if !output_root.exists() {
        return Ok(Vec::new());
    }

    let mut batches = Vec::new();
    for entry in fs::read_dir(&output_root)? {
        let path = entry?.path();
        if !path.is_dir() {
            continue;
        }
        if path.join("dataset.jsonl").exists()
            || path.join("pack_summary.json").exists()
            || has_generated_shards(&path)
        {
            if let Ok(summary) = build_qa_batch_summary(app, &path) {
                batches.push(summary);
            }
        }
    }

    Ok(batches)
}

fn normalize_prompt_for_match(value: &str) -> String {
    value.split_whitespace().collect::<Vec<_>>().join(" ")
}

fn find_latest_matching_batch_dir(
    app: &AppHandle,
    request: &PipelineRequest,
) -> anyhow::Result<Option<PathBuf>> {
    let normalized_prompt = normalize_prompt_for_match(&request.prompt);
    let mut matches = load_qa_batches(app)?
        .into_iter()
        .filter(|batch| normalize_prompt_for_match(&batch.prompt) == normalized_prompt)
        .filter(|batch| batch.qa_mode.as_deref().unwrap_or("normal") == request.qa_mode)
        .filter(|batch| batch.provider.as_deref().unwrap_or_default() == request.provider)
        .filter(|batch| batch.model.as_deref().unwrap_or_default() == request.model)
        .collect::<Vec<_>>();

    matches.sort_by(|left, right| right.updated_at_ms.cmp(&left.updated_at_ms));

    Ok(matches
        .into_iter()
        .next()
        .map(|batch| PathBuf::from(batch.output_dir)))
}

fn build_qa_batch_summary(app: &AppHandle, batch_dir: &Path) -> anyhow::Result<QaBatchSummary> {
    let output_root = configured_managed_output_root(app)?;
    let id = path_relative_id(&output_root, batch_dir)?;
    let name = batch_dir
        .file_name()
        .and_then(|value| value.to_str())
        .unwrap_or("unknown")
        .to_string();

    let topic_path = batch_dir.join("topic.json");
    let config_path = batch_dir.join("generate_config.json");
    let pack_summary_path = batch_dir.join("pack_summary.json");
    let dataset_path = batch_dir.join("dataset.jsonl");
    let generated_dir = batch_dir.join("generated");
    let generated_summary_path = generated_dir.join("summary.json");
    let review_state_path = batch_review_state_path(batch_dir);

    let topic = if topic_path.exists() {
        Some(read_json::<TopicSpec>(&topic_path)?)
    } else {
        None
    };
    let config = if config_path.exists() {
        Some(read_json::<GenerateConfig>(&config_path)?)
    } else {
        None
    };
    let pack_summary = if pack_summary_path.exists() {
        Some(read_json::<PackedDataset>(&pack_summary_path)?)
    } else {
        None
    };
    let generated_summary = if generated_summary_path.exists() {
        Some(read_json::<GenerateSummary>(&generated_summary_path)?)
    } else {
        None
    };
    let generated_shards = if generated_dir.exists() {
        Some(load_generated_shards(&generated_dir)?)
    } else {
        None
    };
    let generated_records = generated_shards.as_ref().map(|shards| {
        shards
            .iter()
            .flat_map(|shard| shard.items.iter().cloned())
            .collect::<Vec<_>>()
    });
    let review_summary = summarize_review_state(&load_batch_review_state(batch_dir)?);
    let fallback_shard_count = config
        .as_ref()
        .map(|value| {
            value
                .runtime
                .target_count
                .div_ceil(value.runtime.shard_size.max(1))
        })
        .or_else(|| generated_shards.as_ref().map(|shards| shards.len()));
    let fallback_completed_shards = generated_shards
        .as_ref()
        .map(|shards| shards.iter().filter(|shard| shard.completed).count())
        .unwrap_or(0);
    let fallback_request_count = generated_shards.as_ref().map(|shards| {
        let batch_size = config
            .as_ref()
            .map(|value| value.runtime.batch_size)
            .unwrap_or(1)
            .max(1);
        shards
            .iter()
            .map(|shard| shard.item_count.div_ceil(batch_size))
            .sum::<usize>()
    });

    let generated_count = if let Some(summary) = &generated_summary {
        summary.generated_count
    } else if let Some(records) = &generated_records {
        records.len()
    } else {
        0
    };

    let total_count = if let Some(summary) = &pack_summary {
        summary.total_input
    } else if dataset_path.exists() {
        read_jsonl_records(&dataset_path)?.len()
    } else {
        generated_count
    };
    let kept_count = pack_summary
        .as_ref()
        .map(|summary| summary.kept)
        .unwrap_or(total_count);
    let status = if pack_summary_path.exists() || dataset_path.exists() {
        "completed".to_string()
    } else if generated_count > 0 {
        if generated_summary
            .as_ref()
            .is_some_and(|summary| summary.completed_shards >= summary.shard_count)
            || generated_shards.as_ref().is_some_and(|shards| {
                !shards.is_empty() && shards.iter().all(|shard| shard.completed)
            })
        {
            "generated".to_string()
        } else {
            "running".to_string()
        }
    } else {
        "prepared".to_string()
    };

    let updated_at_ms = latest_modified_ms(&[
        dataset_path.as_path(),
        pack_summary_path.as_path(),
        topic_path.as_path(),
        config_path.as_path(),
        generated_summary_path.as_path(),
        review_state_path.as_path(),
    ])
    .into_iter()
    .chain(latest_modified_ms_in_dir(&generated_dir))
    .max();

    Ok(QaBatchSummary {
        id,
        name: name.clone(),
        topic_name: topic
            .as_ref()
            .map(|value| value.topic_name.clone())
            .or_else(|| pack_summary.as_ref().map(|value| value.topic_name.clone()))
            .unwrap_or_else(|| name.clone()),
        prompt: topic
            .as_ref()
            .map(|value| value.user_intent.clone())
            .unwrap_or_default(),
        qa_mode: config.as_ref().map(|value| value.qa_mode.clone()),
        target_count: config.as_ref().map(|value| value.runtime.target_count),
        generated_count,
        kept_count,
        total_count,
        shard_count: generated_summary
            .as_ref()
            .map(|value| value.shard_count)
            .or(fallback_shard_count),
        completed_shards: generated_summary
            .as_ref()
            .map(|value| value.completed_shards)
            .unwrap_or(fallback_completed_shards),
        skipped_shards: generated_summary
            .as_ref()
            .map(|value| value.skipped_shards)
            .unwrap_or(0),
        request_count: generated_summary
            .as_ref()
            .map(|value| value.request_count)
            .or(fallback_request_count),
        status,
        provider: config.as_ref().map(|value| value.provider.provider.clone()),
        model: config.as_ref().map(|value| value.provider.model.clone()),
        cot_section_headers: config
            .as_ref()
            .map(|value| {
                normalize_cot_section_headers_for_language(
                    &value.cot_section_headers,
                    &value.output_language,
                )
            })
            .unwrap_or_else(default_cot_section_headers),
        output_dir: batch_dir.display().to_string(),
        updated_at_ms,
        reviewed_count: review_summary.reviewed_count,
        review_kept_count: review_summary.kept_count,
        discarded_count: review_summary.discarded_count,
    })
}

fn resolve_batch_dir(app: &AppHandle, batch_id: &str) -> anyhow::Result<PathBuf> {
    let output_root = configured_managed_output_root(app)?;
    let batch_dir = if Path::new(batch_id).is_absolute() {
        PathBuf::from(batch_id)
    } else {
        output_root.join(batch_id)
    };
    if !batch_dir.exists() {
        anyhow::bail!("batch directory does not exist: {}", batch_dir.display());
    }
    Ok(batch_dir)
}

fn path_relative_id(root: &Path, path: &Path) -> anyhow::Result<String> {
    let relative = path
        .strip_prefix(root)
        .with_context(|| format!("{} is not inside {}", path.display(), root.display()))?;
    let parts = relative
        .components()
        .map(|component| component.as_os_str().to_string_lossy().to_string())
        .collect::<Vec<_>>();
    Ok(parts.join("/"))
}

fn latest_modified_ms(paths: &[&Path]) -> Option<u64> {
    paths
        .iter()
        .filter_map(|path| fs::metadata(path).ok())
        .filter_map(|metadata| metadata.modified().ok())
        .filter_map(system_time_to_ms)
        .max()
}

fn latest_modified_ms_in_dir(path: &Path) -> Option<u64> {
    if !path.exists() {
        return None;
    }

    fs::read_dir(path)
        .ok()?
        .filter_map(|entry| entry.ok().map(|value| value.path()))
        .filter_map(|entry_path| fs::metadata(entry_path).ok())
        .filter_map(|metadata| metadata.modified().ok())
        .filter_map(system_time_to_ms)
        .max()
}

fn has_generated_shards(batch_dir: &Path) -> bool {
    let generated_dir = batch_dir.join("generated");
    if !generated_dir.exists() {
        return false;
    }

    fs::read_dir(generated_dir)
        .ok()
        .into_iter()
        .flat_map(|entries| entries.filter_map(|entry| entry.ok().map(|value| value.path())))
        .any(|path| {
            path.file_name()
                .and_then(|value| value.to_str())
                .is_some_and(|name| {
                    name.starts_with("shard_")
                        && path.extension().and_then(|ext| ext.to_str()) == Some("json")
                })
        })
}

fn system_time_to_ms(time: SystemTime) -> Option<u64> {
    time.duration_since(UNIX_EPOCH)
        .ok()
        .map(|duration| duration.as_millis() as u64)
}

fn next_managed_output_dir(output_root: &Path, topic_name: &str) -> anyhow::Result<PathBuf> {
    fs::create_dir_all(output_root)?;

    let slug = slugify_for_path(topic_name);
    let timestamp = system_time_to_ms(SystemTime::now()).unwrap_or(0);
    Ok(output_root.join(format!("{slug}-{timestamp}")))
}

fn slugify_for_path(value: &str) -> String {
    let mut slug = String::new();
    let mut last_was_separator = false;

    for ch in value.chars() {
        if ch.is_ascii_alphanumeric() {
            slug.push(ch.to_ascii_lowercase());
            last_was_separator = false;
            continue;
        }

        if !last_was_separator {
            slug.push('-');
            last_was_separator = true;
        }
    }

    let slug = slug.trim_matches('-').to_string();
    if slug.is_empty() {
        "qa-batch".to_string()
    } else {
        slug.chars().take(48).collect()
    }
}

fn read_json<T: serde::de::DeserializeOwned>(path: &Path) -> anyhow::Result<T> {
    let content = fs::read_to_string(path)?;
    Ok(serde_json::from_str(&content)?)
}

fn error_to_string<E>(error: E) -> String
where
    E: Into<anyhow::Error>,
{
    let error = error.into();
    error
        .chain()
        .map(|cause| cause.to_string())
        .collect::<Vec<_>>()
        .join(": ")
}

fn dev_app_root() -> Option<PathBuf> {
    let app_root = Path::new(env!("CARGO_MANIFEST_DIR"))
        .parent()
        .map(Path::to_path_buf)?;

    let has_workspace_markers = app_root.join("package.json").exists()
        && app_root.join("src-tauri/tauri.conf.json").exists();
    if has_workspace_markers {
        Some(app_root)
    } else {
        None
    }
}

fn runtime_data_root(app: &AppHandle) -> anyhow::Result<PathBuf> {
    if let Some(root) = dev_app_root() {
        Ok(root)
    } else {
        Ok(app.path().app_data_dir()?.join("workspace"))
    }
}

fn runtime_config_root(app: &AppHandle) -> anyhow::Result<PathBuf> {
    if let Some(root) = dev_app_root() {
        Ok(root)
    } else {
        Ok(app.path().app_config_dir()?)
    }
}

fn resolve_app_relative_path(app: &AppHandle, path: &str) -> anyhow::Result<PathBuf> {
    let trimmed = path.trim();
    if trimmed.is_empty() {
        return Ok(PathBuf::new());
    }

    let target = PathBuf::from(trimmed);
    if target.is_absolute() {
        Ok(target)
    } else {
        Ok(runtime_data_root(app)?.join(target))
    }
}

fn updater_runtime_config_path(app: &AppHandle) -> anyhow::Result<PathBuf> {
    if let Some(root) = dev_app_root() {
        Ok(root.join("config/local/updater.json"))
    } else {
        Ok(runtime_config_root(app)?.join("updater.json"))
    }
}

fn local_pipeline_profiles_dir(app: &AppHandle) -> anyhow::Result<PathBuf> {
    if let Some(root) = dev_app_root() {
        Ok(root.join("config/local/profiles"))
    } else {
        Ok(runtime_config_root(app)?.join("profiles"))
    }
}

fn local_pipeline_profile_path(app: &AppHandle, profile_name: &str) -> anyhow::Result<PathBuf> {
    Ok(local_pipeline_profiles_dir(app)?.join(format!("{profile_name}.json")))
}

fn legacy_local_pipeline_config_path(app: &AppHandle) -> anyhow::Result<PathBuf> {
    if let Some(root) = dev_app_root() {
        Ok(root.join("config/local/gui.pipeline.json"))
    } else {
        Ok(runtime_config_root(app)?.join("gui.pipeline.json"))
    }
}

fn default_profile_name() -> String {
    "default".to_string()
}

fn normalize_profile_name(profile_name: Option<String>) -> String {
    let raw = profile_name
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .unwrap_or("default");

    let mut normalized = String::new();
    let mut last_was_separator = false;

    for ch in raw.chars() {
        let keep = ch.is_ascii_alphanumeric() || ch == '-' || ch == '_';
        if keep {
            normalized.push(ch);
            last_was_separator = false;
            continue;
        }

        if (ch.is_whitespace() || ch == '.') && !last_was_separator {
            normalized.push('-');
            last_was_separator = true;
        }
    }

    let normalized = normalized.trim_matches('-').to_string();
    if normalized.is_empty() {
        default_profile_name()
    } else {
        normalized
    }
}

fn load_updater_runtime_config(
    app: &AppHandle,
) -> anyhow::Result<Option<(UpdaterRuntimeConfig, PathBuf)>> {
    let path = updater_runtime_config_path(app)?;
    if !path.exists() {
        return Ok(None);
    }

    let config: UpdaterRuntimeConfig = read_json(&path)?;
    let pubkey = config.pubkey.trim().to_string();
    let endpoints = config
        .endpoints
        .into_iter()
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
        .collect::<Vec<_>>();

    if pubkey.is_empty() {
        anyhow::bail!("updater pubkey is empty in {}", path.display());
    }
    if endpoints.is_empty() {
        anyhow::bail!("updater endpoints are empty in {}", path.display());
    }

    Ok(Some((UpdaterRuntimeConfig { pubkey, endpoints }, path)))
}

fn release_page_url_from_endpoint(endpoint: &str) -> Option<String> {
    let trimmed = endpoint.trim();
    if trimmed.is_empty() {
        return None;
    }

    if let Some(prefix) = trimmed.strip_suffix("/releases/latest/download/latest.json") {
        return Some(format!("{prefix}/releases/latest"));
    }

    if let Some((prefix, suffix)) = trimmed.split_once("/releases/download/") {
        if let Some((tag, _)) = suffix.split_once('/') {
            return Some(format!("{prefix}/releases/tag/{tag}"));
        }
    }

    None
}

fn manual_download_url(app: &AppHandle) -> Option<String> {
    load_updater_runtime_config(app)
        .ok()
        .flatten()
        .and_then(|(config, _)| {
            config
                .endpoints
                .iter()
                .find_map(|endpoint| release_page_url_from_endpoint(endpoint))
        })
        .or_else(|| Some(DEFAULT_RELEASES_PAGE_URL.to_string()))
}

fn build_runtime_updater(
    app: &AppHandle,
    config: &UpdaterRuntimeConfig,
) -> anyhow::Result<tauri_plugin_updater::Updater> {
    let endpoints = config
        .endpoints
        .iter()
        .map(|value| {
            Url::parse(value).with_context(|| format!("invalid updater endpoint URL `{value}`"))
        })
        .collect::<anyhow::Result<Vec<_>>>()?;

    Ok(app
        .updater_builder()
        .pubkey(config.pubkey.clone())
        .endpoints(endpoints)?
        .build()?)
}

fn build_effective_updater(
    app: &AppHandle,
) -> anyhow::Result<Option<(tauri_plugin_updater::Updater, Option<PathBuf>)>> {
    if let Some((config, source_path)) = load_updater_runtime_config(app)? {
        let updater = build_runtime_updater(app, &config)?;
        return Ok(Some((updater, Some(source_path))));
    }

    match app.updater_builder().build() {
        Ok(updater) => Ok(Some((updater, None))),
        Err(tauri_plugin_updater::Error::EmptyEndpoints) => Ok(None),
        Err(error) => Err(error.into()),
    }
}

fn emit_pipeline_event(
    window: &Window,
    stage: &str,
    status: &str,
    message: &str,
    current_step: usize,
    total_steps: usize,
) {
    let _ = window.emit(
        "pipeline-progress",
        PipelineProgressEvent {
            stage: stage.to_string(),
            status: status.to_string(),
            message: message.to_string(),
            current_step,
            total_steps,
            runtime_kind: None,
            retry_attempt: None,
            retry_limit: None,
            attempt_number: None,
            attempt_limit: None,
            error_message: None,
            shard_index: None,
            shard_count: None,
            shard_item_completed: None,
            shard_item_total: None,
            total_generated: None,
            target_count: None,
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

fn emit_runtime_progress_event(window: &Window, event: &RuntimeProgress, total_steps: usize) {
    let plan_suffix = format_runtime_plan_suffix(event);
    let batch_suffix = format_runtime_batch_suffix(event);
    let duration_suffix = format_runtime_duration_suffix(event.duration_ms);
    let (status, message) = match event.kind {
        RuntimeProgressKind::ShardStarted => (
            "running",
            format!(
                "Generating shard {}/{} (target {} items).",
                event.shard_index,
                event.shard_count,
                event.shard_item_total.unwrap_or(0)
            ),
        ),
        RuntimeProgressKind::ShardSkipped => (
            "completed",
            format!(
                "Skipped existing shard {}/{} ({} items already available).",
                event.shard_index,
                event.shard_count,
                event.shard_item_completed.unwrap_or(0)
            ),
        ),
        RuntimeProgressKind::BatchStarted => (
            "running",
            format!(
                "Shard {}/{}{} started attempt {}/{} for {} item(s){}{}.",
                event.shard_index,
                event.shard_count,
                batch_suffix,
                event.attempt_number.unwrap_or(1),
                event.attempt_limit.unwrap_or(1),
                event.batch_size.unwrap_or(0),
                plan_suffix,
                duration_suffix
            ),
        ),
        RuntimeProgressKind::BatchCompleted => (
            "running",
            format!(
                "Shard {}/{}{} completed {} item(s){} · shard {}/{} · total {}/{}{}.",
                event.shard_index,
                event.shard_count,
                batch_suffix,
                event.batch_size.unwrap_or(0),
                plan_suffix,
                event.shard_item_completed.unwrap_or(0),
                event.shard_item_total.unwrap_or(0),
                event.total_generated.unwrap_or(0),
                event.target_count.unwrap_or(0),
                duration_suffix
            ),
        ),
        RuntimeProgressKind::ShardCompleted => (
            "completed",
            format!(
                "Shard {}/{} completed: {}/{} · total {}/{}.",
                event.shard_index,
                event.shard_count,
                event.shard_item_completed.unwrap_or(0),
                event.shard_item_total.unwrap_or(0),
                event.total_generated.unwrap_or(0),
                event.target_count.unwrap_or(0)
            ),
        ),
        RuntimeProgressKind::BatchRetry => (
            "running",
            format!(
                "Shard {}/{}{} attempt {}/{} failed{}; retry {}/{} in {}s: {}{}",
                event.shard_index,
                event.shard_count,
                batch_suffix,
                event.attempt_number.unwrap_or(0),
                event.attempt_limit.unwrap_or(0),
                duration_suffix,
                event.retry_attempt.unwrap_or(0),
                event.retry_limit.unwrap_or(0),
                event.backoff_secs.unwrap_or(0),
                event.error_message.as_deref().unwrap_or("unknown error"),
                plan_suffix
            ),
        ),
        RuntimeProgressKind::BatchFailed => (
            "failed",
            format!(
                "Shard {}/{}{} failed on attempt {}/{} after {}/{} retries{}: {}{}",
                event.shard_index,
                event.shard_count,
                batch_suffix,
                event.attempt_number.unwrap_or(0),
                event.attempt_limit.unwrap_or(0),
                event.retry_attempt.unwrap_or(0),
                event.retry_limit.unwrap_or(0),
                duration_suffix,
                event.error_message.as_deref().unwrap_or("unknown error"),
                plan_suffix
            ),
        ),
    };

    let _ = window.emit(
        "pipeline-progress",
        PipelineProgressEvent {
            stage: "generate".to_string(),
            status: status.to_string(),
            message,
            current_step: 3,
            total_steps,
            runtime_kind: Some(
                match event.kind {
                    RuntimeProgressKind::ShardStarted => "shard_started",
                    RuntimeProgressKind::ShardSkipped => "shard_skipped",
                    RuntimeProgressKind::BatchStarted => "batch_started",
                    RuntimeProgressKind::BatchCompleted => "batch_completed",
                    RuntimeProgressKind::ShardCompleted => "shard_completed",
                    RuntimeProgressKind::BatchRetry => "batch_retry",
                    RuntimeProgressKind::BatchFailed => "batch_failed",
                }
                .to_string(),
            ),
            retry_attempt: event.retry_attempt,
            retry_limit: event.retry_limit,
            attempt_number: event.attempt_number,
            attempt_limit: event.attempt_limit,
            error_message: event.error_message.clone(),
            shard_index: Some(event.shard_index),
            shard_count: Some(event.shard_count),
            shard_item_completed: event.shard_item_completed,
            shard_item_total: event.shard_item_total,
            total_generated: event.total_generated,
            target_count: event.target_count,
            batch_index: event.batch_index,
            batch_count_in_shard: event.batch_count_in_shard,
            batch_size: event.batch_size,
            duration_ms: event.duration_ms,
            backoff_secs: event.backoff_secs,
            subtopic: event.subtopic.clone(),
            axis: event.axis.clone(),
            question_type: event.question_type.clone(),
            difficulty: event.difficulty.clone(),
            audience: event.audience.clone(),
        },
    );
}

fn format_runtime_batch_suffix(event: &RuntimeProgress) -> String {
    match (event.batch_index, event.batch_count_in_shard) {
        (Some(batch_index), Some(batch_count_in_shard)) => {
            format!(" batch {batch_index}/{batch_count_in_shard}")
        }
        _ => String::new(),
    }
}

fn format_runtime_duration_suffix(duration_ms: Option<u64>) -> String {
    let Some(duration_ms) = duration_ms else {
        return String::new();
    };

    if duration_ms >= 1_000 {
        format!(" in {:.1}s", duration_ms as f64 / 1_000.0)
    } else {
        format!(" in {duration_ms}ms")
    }
}

fn format_runtime_plan_suffix(event: &RuntimeProgress) -> String {
    let mut parts = Vec::new();
    if let Some(value) = event.subtopic.as_deref() {
        parts.push(format!("subtopic={value}"));
    }
    if let Some(value) = event.axis.as_deref() {
        parts.push(format!("axis={value}"));
    }
    if let Some(value) = event.question_type.as_deref() {
        parts.push(format!("type={value}"));
    }
    if let Some(value) = event.difficulty.as_deref() {
        parts.push(format!("difficulty={value}"));
    }
    if let Some(value) = event.audience.as_deref() {
        parts.push(format!("audience={value}"));
    }

    if parts.is_empty() {
        String::new()
    } else {
        format!(" [{}]", parts.join(" · "))
    }
}

fn is_pipeline_cancelled_error(error: &anyhow::Error) -> bool {
    error.to_string().contains("pipeline canceled by user")
}

fn emit_app_update_event(window: &Window, stage: &str, status: &str, message: &str) {
    let _ = window.emit(
        "app-update-progress",
        AppUpdateProgressEvent {
            stage: stage.to_string(),
            status: status.to_string(),
            message: message.to_string(),
        },
    );
}

// ---- Chat QA: send_chat_message ----

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ChatMessage {
    role: String,
    content: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ChatSendRequest {
    #[serde(default)]
    platform_url: Option<String>,
    #[serde(default)]
    username: Option<String>,
    #[serde(default)]
    password: Option<String>,
    provider: String,
    base_url: String,
    api_key: String,
    model: String,
    messages: Vec<ChatMessage>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ChatSendResponse {
    message: ChatMessage,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct OpenAiChatChoice {
    message: ChatMessage,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct OpenAiChatCompletion {
    choices: Vec<OpenAiChatChoice>,
}

#[tauri::command]
async fn send_chat_message(request: ChatSendRequest) -> Result<ChatSendResponse, String> {
    // Auto-detect: platform proxy (token) or direct API key (match Paper QA pattern)
    if let (Some(platform_url), Some(username), Some(password)) =
        (request.platform_url.as_ref(), request.username.as_ref(), request.password.as_ref())
    {
        let (_endpoints, token, _user) =
            platform_login_with_token(platform_url, username, password).await?;
        let client = reqwest::Client::new();
        let resp = client
            .post(format!("{}/api/generate/chat/completions", platform_url))
            .bearer_auth(&token)
            .json(&serde_json::json!({
                "model": request.model,
                "messages": request.messages.iter().map(|m| {
                    serde_json::json!({ "role": m.role, "content": m.content })
                }).collect::<Vec<_>>()
            }))
            .timeout(std::time::Duration::from_secs(120))
            .send()
            .await
            .map_err(error_to_string)?;

        if !resp.status().is_success() {
            let status = resp.status();
            let body = resp.text().await.unwrap_or_default();
            return Err(format!("platform chat API error {}: {}", status, body));
        }

        // Platform generate endpoints return OpenAI-compatible format,
        // not the standard { code, data } envelope used by other platform APIs.
        let completion: OpenAiChatCompletion = resp
            .json()
            .await
            .map_err(|e| format!("failed to parse platform chat response: {}", e))?;

        let choice = completion
            .choices
            .into_iter()
            .next()
            .ok_or("no response from platform model")?;

        Ok(ChatSendResponse { message: choice.message })
    } else {
        // OpenAI-compatible chat completions
        let client = reqwest::Client::new();
        let url = format!("{}/chat/completions", request.base_url.trim_end_matches('/'));
        let resp = client
            .post(&url)
            .header("Authorization", format!("Bearer {}", request.api_key))
            .json(&serde_json::json!({
                "model": request.model,
                "messages": request.messages.iter().map(|m| {
                    serde_json::json!({ "role": m.role, "content": m.content })
                }).collect::<Vec<_>>()
            }))
            .timeout(Duration::from_secs(60))
            .send()
            .await
            .map_err(|e| format!("chat request failed: {}", e))?;

        if !resp.status().is_success() {
            let status = resp.status();
            let body = resp.text().await.unwrap_or_default();
            return Err(format!("chat API error {}: {}", status, body));
        }

        let completion: OpenAiChatCompletion = resp
            .json()
            .await
            .map_err(|e| format!("failed to parse chat response: {}", e))?;

        let choice = completion
            .choices
            .into_iter()
            .next()
            .ok_or("no response from model")?;

        Ok(ChatSendResponse { message: choice.message })
    }
}

#[tauri::command]
async fn send_chat_message_stream(
    window: Window,
    request: ChatSendRequest,
) -> Result<ChatSendResponse, String> {
    // Resolve auth (match send_chat_message pattern)
    let (url, auth_header_value): (String, String) =
        if let (Some(platform_url), Some(username), Some(password)) =
            (request.platform_url.as_ref(), request.username.as_ref(), request.password.as_ref())
        {
            let (_endpoints, token, _user) =
                platform_login_with_token(platform_url, username, password).await?;
            (
                format!("{}/api/generate/chat/completions", platform_url.trim_end_matches('/')),
                format!("Bearer {}", token),
            )
        } else {
            (
                format!("{}/chat/completions", request.base_url.trim_end_matches('/')),
                format!("Bearer {}", request.api_key),
            )
        };

    let client = reqwest::Client::new();
    let resp = client
        .post(&url)
        .header("Authorization", &auth_header_value)
        .json(&serde_json::json!({
            "model": request.model,
            "messages": request.messages.iter().map(|m| {
                serde_json::json!({ "role": m.role, "content": m.content })
            }).collect::<Vec<_>>(),
            "stream": true
        }))
        .timeout(std::time::Duration::from_secs(120))
        .send()
        .await
        .map_err(|e| format!("stream request failed: {}", e))?;

    if !resp.status().is_success() {
        let status = resp.status();
        let body = resp.text().await.unwrap_or_default();
        return Err(format!("stream API error {}: {}", status, body));
    }

    let mut stream = resp.bytes_stream();
    let mut full_content = String::new();

    use futures::StreamExt;
    while let Some(chunk_result) = stream.next().await {
        let chunk = chunk_result.map_err(|e| format!("stream read error: {}", e))?;
        let text = String::from_utf8_lossy(&chunk);

        for line in text.lines() {
            let line = line.trim();
            if line.is_empty() || !line.starts_with("data: ") {
                continue;
            }
            let data = &line["data: ".len()..];
            if data == "[DONE]" {
                break;
            }
            if let Ok(parsed) = serde_json::from_str::<serde_json::Value>(data) {
                if let Some(delta) = parsed["choices"][0]["delta"]["content"].as_str() {
                    full_content.push_str(delta);
                    let _ = window.emit("chat-qa-token", serde_json::json!({
                        "token": delta,
                        "fullContent": full_content
                    }));
                }
            }
        }
    }

    Ok(ChatSendResponse {
        message: ChatMessage {
            role: "assistant".to_string(),
            content: full_content,
        },
    })
}

pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            app.handle()
                .plugin(tauri_plugin_updater::Builder::new().build())?;
            Ok(())
        })
        .manage(ActivePipelineState::default())
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            health_check,
            stop_pipeline,
            preview_topic_spec,
            get_app_metadata,
            get_managed_output_root,
            save_local_pipeline_config,
            load_local_pipeline_config,
            list_local_pipeline_profiles,
            list_qa_batches,
            load_batch_pipeline_request,
            delete_qa_batch,
            repack_qa_batch,
            check_platform_health,
            login_platform,
            load_model_trial_workspace,
            get_model_trial_session_detail,
            create_model_trial_session,
            send_model_trial_message,
            delete_model_trial_session,
            list_platform_import_batches,
            get_platform_import_batch_detail,
            upload_qa_batch,
            save_paper_qa_batch,
            get_qa_batch_platform_statuses,
            list_batch_qa_records,
            list_batch_qa_question_options,
            get_batch_qa_record,
            save_batch_review_item,
            open_path,
            open_external_url,
            run_pipeline,
            check_for_app_update,
            install_app_update,
            get_platform_news,
            get_dashboard_overview,
            change_platform_password,
            logout_platform,
            get_model_changelog,
            submit_feedback,
            get_platform_stats,
            get_exports_stats,
            get_generate_models,
            send_chat_message,
            send_chat_message_stream,
            push_chat_conversations,
            convert_pdf_via_mineru,
            chunk_paper_md,
            generate_paper_qa,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
