import { invoke } from "@tauri-apps/api/core";

declare const __APP_VERSION__: string;

type Lang = "zh" | "en";

type TopicPreview = {
  topic_name: string;
  goal: string;
  target_count: number;
  keywords: string[];
  subtopics: Array<{ name: string; intent: string }>;
  question_axes: string[];
};

type PipelineResponse = {
  topic: TopicPreview;
  generatedSummary: {
    generatedCount: number;
    shardCount: number;
    completedShards: number;
    skippedShards: number;
    requestCount: number;
    provider: string;
    model: string;
  };
  keptCount: number;
  outputDir: string;
  topicPath: string;
  plansPath: string;
  configPath: string;
  generatedDir: string;
  datasetPath: string;
  packSummaryPath: string;
};

type PipelineProgressEvent = {
  stage: string;
  status: string;
  message: string;
  currentStep: number;
  totalSteps: number;
  runtimeKind?: string | null;
  retryAttempt?: number | null;
  retryLimit?: number | null;
  attemptNumber?: number | null;
  attemptLimit?: number | null;
  errorMessage?: string | null;
  shardIndex?: number | null;
  shardCount?: number | null;
  shardItemCompleted?: number | null;
  shardItemTotal?: number | null;
  totalGenerated?: number | null;
  targetCount?: number | null;
  batchIndex?: number | null;
  batchCountInShard?: number | null;
  batchSize?: number | null;
  durationMs?: number | null;
  backoffSecs?: number | null;
  subtopic?: string | null;
  axis?: string | null;
  questionType?: string | null;
  difficulty?: string | null;
  audience?: string | null;
};

type AppUpdateCheckResponse = {
  configured: boolean;
  updateAvailable: boolean;
  currentVersion: string;
  version: string | null;
  body: string | null;
  date: string | null;
  sourcePath: string | null;
  manualDownloadUrl: string | null;
};

type AppUpdateProgressEvent = {
  stage: string;
  status: string;
  message: string;
};

type AppMetadataResponse = {
  productName: string;
  version: string;
};

type ManagedOutputRootResponse = {
  outputRoot: string;
};

type ReviewStatus = "unreviewed" | "kept" | "discarded";

type QaBatchSummary = {
  id: string;
  name: string;
  topicName: string;
  prompt: string;
  qaMode: string | null;
  cotSectionHeaders: string[];
  targetCount: number | null;
  generatedCount: number;
  keptCount: number;
  totalCount: number;
  shardCount: number | null;
  completedShards: number;
  skippedShards: number;
  requestCount: number | null;
  status: string;
  provider: string | null;
  model: string | null;
  outputDir: string;
  updatedAtMs: number | null;
  reviewedCount: number;
  reviewKeptCount: number;
  discardedCount: number;
};

type QaRecordSummary = {
  id: string;
  question: string;
  subtopic: string;
  axis: string;
  questionType: string;
  difficulty: string;
  audience: string;
  reviewStatus: ReviewStatus;
  editedQuestion: string | null;
  effectiveQuestion: string;
};

type QaRecordReview = {
  status: ReviewStatus;
  editedQuestion: string | null;
  effectiveQuestion: string;
  updatedAtMs: number | null;
};

type QaRecordPage = {
  batch: QaBatchSummary;
  items: QaRecordSummary[];
  page: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
};

type QaRecordDetail = {
  batch: QaBatchSummary;
  item: {
    id: string;
    shard_id: number;
    topic_name: string;
    subtopic: string;
    axis: string;
    question_type: string;
    difficulty: string;
    audience: string;
    question: string;
    answer: string;
    source_type: string;
    grounding: string;
    provider: string;
    model: string;
    qa_mode: string;
  };
  review: QaRecordReview;
};

type SaveBatchReviewItemResponse = {
  review: QaRecordReview;
  summary: {
    reviewedCount: number;
    keptCount: number;
    discardedCount: number;
  };
};

type PlatformEndpoints = {
  normalizedPlatformUrl: string;
  platformWebBaseUrl: string;
  platformApiBaseUrl: string;
};

type PlatformHealthResponse = {
  reachable: boolean;
  endpoints: PlatformEndpoints;
  message: string;
};

type PlatformApplicationSummary = {
  id: number;
  name: string;
};

type PlatformUserSummary = {
  id: number;
  username: string;
  role: string;
  status: string;
  applications: PlatformApplicationSummary[];
};

type PlatformLoginResponse = {
  endpoints: PlatformEndpoints;
  user: PlatformUserSummary;
};

type TrialLlmConfigOption = {
  id: number;
  name: string;
  providerCode: string;
  modelName: string;
  isEnabled: boolean;
  isTrialEnabled: boolean;
  hasApiKey: boolean;
  lastTestedAt: string | null;
  lastTestStatus: string | null;
};

type TrialSourceItem = {
  qaItemId: number;
  answerId: number | null;
  questionText: string;
  answerText: string | null;
  contextText: string | null;
  applicationName: string | null;
  technicalTypeCode: string | null;
  technicalTypeName: string | null;
  taskType: string | null;
  taskStatus: string | null;
  updatedAt: string | null;
  questionSummary: string | null;
};

type TrialSessionSummary = {
  id: number;
  llmConfigId: number;
  llmConfigName: string | null;
  llmModelName: string | null;
  title: string;
  status: string;
  createdAt: string;
  updatedAt: string;
};

type TrialMessage = {
  id: number;
  role: string;
  content: string;
  createdAt: string;
};

type TrialSessionDetail = {
  session: TrialSessionSummary;
  source: TrialSourceItem | null;
  messages: TrialMessage[];
};

type TrialWorkspaceResponse = {
  endpoints: PlatformEndpoints;
  user: PlatformUserSummary;
  configs: TrialLlmConfigOption[];
  sources: TrialSourceItem[];
  sessions: TrialSessionSummary[];
};

type TrialSessionCreateResponse = {
  sessionId: number;
};

type TrialSendMessageResponse = {
  reply: string;
  status: string;
  sessionId: number;
};

type UiTab = "recent-updates" | "chat-qa" | "topic" | "settings" | "browse" | "qa-evaluate" | "model-trial" | "feedback2" | "paper-qa";
type BrowseView = "batches" | "questions" | "detail" | "review";

type ProviderPresetId =
  | "custom"
  | "platform"
  | "qwen_dashscope"
  | "deepseek"
  | "moonshot_kimi"
  | "zhipu_glm"
  | "minimax"
  | "tencent_hunyuan"
  | "baidu_qianfan"
  | "stub_local";

type ProviderPresetConfigKey = Exclude<ProviderPresetId, "custom" | "platform">;
type ProviderPresetConfig = {
  provider: string;
  defaultModel: string;
  models: readonly string[];
  baseUrl: string;
  batchSize: number;
  maxInFlight: number;
  requestTimeoutSecs: number;
};

type ResearchFieldNode = {
  id: string;
  zh: string;
  en: string;
  children?: readonly ResearchFieldNode[];
};

type ResearchFieldLabelMeta = {
  fullZh: string;
  fullEn: string;
  shortZh: string;
  shortEn: string;
};

type ValidationIssueKey =
  | "validation_issue_prompt_required"
  | "validation_issue_model_required"
  | "validation_issue_base_url_required"
  | "validation_issue_api_key_required"
  | "validation_issue_target_count_invalid"
  | "validation_issue_plan_limit_invalid"
  | "validation_issue_shard_size_invalid"
  | "validation_issue_batch_size_invalid"
  | "validation_issue_max_in_flight_invalid"
  | "validation_issue_max_retries_invalid"
  | "validation_issue_timeout_invalid";

type PipelineFormRequest = {
  prompt: string;
  topicTags: string[];
  qaMode: "normal" | "cot";
  outputLanguage: "zh" | "en";
  cotSectionHeaders: string[];
  targetCount: number;
  planLimit: number;
  outputDir: string;
  managedOutputRoot?: string | null;
  provider: string;
  model: string;
  baseUrl: string | null;
  apiKey: string | null;
  apiKeyEnv?: string | null;
  temperature: number;
  maxTokens: number;
  shardSize: number;
  batchSize: number;
  maxInFlight: number;
  maxRetries: number;
  requestTimeoutSecs: number;
  resume: boolean;
  managedRunMode: "new" | "resume-latest" | "resume-batch";
  managedRunBatchId?: string | null;
  qaPlatformUrl: string | null;
  qaPlatformUsername: string | null;
  qaPlatformPassword: string | null;
  literatureApiUrl: string | null;
  literatureApiAuthToken: string | null;
};

type QaBatchUploadResponse = {
  uploadedCount: number;
  platformWebBaseUrl: string;
  platformApiBaseUrl: string;
  batchId: number | null;
  existingBatch: boolean | null;
  selfReviewStatus: string | null;
  technicalTypeCode: string;
  applicationId: number;
};

type PlatformBatchStatusKind = "missing" | "uploaded" | "processing" | "parsed" | "failed";

type PlatformImportBatchStatus = {
  source: string;
  externalBatchId: string;
  exists: boolean;
  batchId: number | null;
  importStatus: string | null;
  isProcessing: boolean;
  batchStatus: PlatformBatchStatusKind;
  selfReviewStatus: string | null;
  peerReviewStatus: string | null;
};

type QaBatchPlatformStatusResponse = {
  endpoints: PlatformEndpoints;
  items: PlatformImportBatchStatus[];
};

type PlatformImportBatchSummary = {
  id: number;
  name: string;
  source: string | null;
  sourceBatchName: string | null;
  externalBatchId: string | null;
  importStatus: string | null;
  totalCount: number;
  successCount: number;
  failCount: number;
  createdAt: string;
  applicationName: string | null;
  technicalTypeCode: string | null;
  technicalTypeName: string | null;
  selfReviewStatus: string | null;
  peerReviewStatus: string | null;
  batchStatus: PlatformBatchStatusKind | null;
};

type PlatformImportBatchItem = {
  id: number;
  externalId: string | null;
  status: string | null;
  questionText: string;
  questionSummary: string | null;
  source: string | null;
  sourceModel: string | null;
  metadataJson: string | null;
  currentAnswerId: number | null;
  currentAnswerText: string | null;
  selfReviewTaskStatus: string | null;
  peerReviewTotal: number;
  peerReviewSubmitted: number;
};

type PlatformImportBatchDetail = {
  batch: PlatformImportBatchSummary;
  items: PlatformImportBatchItem[];
};

type OutputState =
  | { kind: "idle" }
  | { kind: "preview_loading" }
  | { kind: "run_loading" }
  | { kind: "preview_success"; preview: TopicPreview }
  | { kind: "run_success"; response: PipelineResponse }
  | { kind: "cancelled"; message: string }
  | { kind: "validation_error"; issues: ValidationIssueKey[] }
  | { kind: "error"; phase: "preview" | "run"; message: string };

type RunStatsSnapshot = {
  startedAtMs: number | null;
  lastUpdatedAtMs: number | null;
  generatedCount: number;
  targetCount: number | null;
  shardIndex: number | null;
  shardCount: number | null;
  completedBatchCount: number;
  estimatedBatchCount: number | null;
  completedShardCount: number;
  skippedShardCount: number;
  retryCount: number;
  failedBatchCount: number;
  samples: Array<{ atMs: number; generatedCount: number }>;
};

export type {
  Lang,
  UiTab,
  TopicPreview,
  PipelineResponse,
  PipelineProgressEvent,
  PipelineFormRequest,
  OutputState,
  QaBatchSummary,
  QaRecordSummary,
  QaRecordDetail,
  QaRecordPage,
  QaRecordReview,
  SaveBatchReviewItemResponse,
  BrowseView,
  ReviewStatus,
  PlatformEndpoints,
  PlatformHealthResponse,
  PlatformLoginResponse,
  PlatformApplicationSummary,
  PlatformUserSummary,
  PlatformImportBatchSummary,
  PlatformImportBatchDetail,
  PlatformImportBatchItem,
  PlatformImportBatchStatus,
  PlatformBatchStatusKind,
  QaBatchPlatformStatusResponse,
  QaBatchUploadResponse,
  ProviderPresetId,
  ProviderPresetConfigKey,
  ProviderPresetConfig,
  ResearchFieldNode,
  ResearchFieldLabelMeta,
  ValidationIssueKey,
  TrialLlmConfigOption,
  TrialSourceItem,
  TrialSessionSummary,
  TrialMessage,
  TrialSessionDetail,
  TrialWorkspaceResponse,
  TrialSessionCreateResponse,
  TrialSendMessageResponse,
  AppUpdateCheckResponse,
  AppUpdateProgressEvent,
  AppMetadataResponse,
  ManagedOutputRootResponse,
  RunStatsSnapshot,
};
