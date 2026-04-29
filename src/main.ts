import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { message, open } from "@tauri-apps/plugin-dialog";
import "./styles.css";

declare const __APP_VERSION__: string;

type Lang = "zh" | "en";
const DEFAULT_MANUAL_UPDATE_URL = "https://github.com/AI4S-YB/distill-studio/releases/latest";

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

type ProviderPresetConfigKey = Exclude<ProviderPresetId, "custom">;
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

function formatCotSectionHeaders(headers: readonly string[] | null | undefined): string {
  return normalizeCotSectionHeaders(headers).join("\n");
}

function defaultCotSectionHeadersForLang(lang: Lang): string[] {
  return [...(lang === "zh" ? DEFAULT_COT_SECTION_HEADERS_ZH : DEFAULT_COT_SECTION_HEADERS_EN)];
}

function isDefaultCotSectionHeaderText(value: string): boolean {
  const normalized = formatCotSectionHeaders(value.split(/\r?\n/));
  return (
    normalized === formatCotSectionHeaders(DEFAULT_COT_SECTION_HEADERS_ZH) ||
    normalized === formatCotSectionHeaders(DEFAULT_COT_SECTION_HEADERS_EN)
  );
}

const LANG_STORAGE_KEY = "distill-studio.lang";
const DEFAULT_PROFILE_NAME = "default";
const AUTO_SAVE_DELAY_MS = 600;
const MANAGED_OUTPUT_DIR = "__managed__";
const CUSTOM_MODEL_VALUE = "__custom__";
const DEFAULT_COT_TARGET_COUNT = 10;
const COT_TARGET_COUNT_CAP = 100;
const DEFAULT_COT_SHARD_SIZE = 10;
const COT_SAFE_SHARD_SIZE_CAP = 10;
const DEFAULT_COT_BATCH_SIZE = 1;
const DEFAULT_COT_MAX_IN_FLIGHT = 2;
const DEFAULT_COT_SECTION_HEADERS_EN = [
  "Workflow Summary",
  "Reference Milestones",
  "Reference Steps",
  "Step Rationale",
  "Decision Points",
  "Quality Checks",
  "Failure Modes",
  "Final Interpretation"
] as const;
const DEFAULT_COT_SECTION_HEADERS_ZH = [
  "研究流程概述",
  "参考里程碑",
  "参考步骤",
  "步骤依据",
  "关键决策点",
  "质量检查",
  "失败模式",
  "最终解释"
] as const;
const FALLBACK_REAL_PROVIDER_PRESET: ProviderPresetId = "qwen_dashscope";
const DEFAULT_QA_PLATFORM_URL = "http://182.92.166.143";
const PLATFORM_REMOTE_VIRTUAL_BATCH_ID = -1;
const PLATFORM_REMOTE_VIRTUAL_BATCH_SOURCE = "remote-server";
const PLATFORM_REMOTE_VIRTUAL_BATCH_SYNTHETIC_ID = "platform:remote-server";
const DEFAULT_COT_SECTION_TRANSLATION_KEYS: Record<string, string> = {
  "Workflow Summary": "cot_section_workflow_summary",
  "Reference Milestones": "cot_section_reference_milestones",
  "Reference Steps": "cot_section_reference_steps",
  "Step Rationale": "cot_section_step_rationale",
  "Decision Points": "cot_section_decision_points",
  "Quality Checks": "cot_section_quality_checks",
  "Failure Modes": "cot_section_failure_modes",
  "Final Interpretation": "cot_section_final_interpretation"
};

const SETTING_HELP_CONTENT: Record<Lang, Record<string, { title: string; body: string }>> = {
  zh: {
    provider_preset: {
      title: "模型厂商",
      body: "用于快速套用常见平台的接入配置。\n\n选择厂商后，程序会自动填写对应的模型列表、Base URL 和推荐运行参数。只有在你接自建网关或特殊兼容接口时，才需要切到自定义。"
    },
    model: {
      title: "模型",
      body: "本次实际调用的大模型名称。\n\n如果厂商已内置常用模型，直接下拉选择即可；只有接私有模型名时才需要改成自定义模型。"
    },
    base_url: {
      title: "Base URL",
      body: "模型接口的根地址。\n\n对于 OpenAI 兼容接口，程序会向这个地址下的 `/chat/completions` 发请求。一般使用厂商默认值即可，只有代理网关或私有部署时才需要修改。"
    },
    api_key: {
      title: "API 密钥",
      body: "访问模型服务所需的鉴权密钥。\n\n当前桌面版会把密钥保存在本地配置中，界面默认隐藏显示，不会写入输出结果目录。"
    },
    qa_platform_url: {
      title: "QA评测平台地址",
      body: "QA 评测平台的统一访问地址。\n\n普通用户只需要填写这一个地址。程序会在内部自动派生页面地址和接口地址。开发联调时填写 `127.0.0.1` 或 `localhost` 也会自动拆到 3100 / 8100。"
    },
    qa_platform_username: {
      title: "QA评测用户名",
      body: "你在 QA 评测平台自己的账号。\n\n这里不是管理员账号。后续上传、自评和平台联通检查，都使用这个账号。"
    },
    qa_platform_password: {
      title: "QA评测密码",
      body: "你在 QA 评测平台自己的登录密码。\n\n密码会跟随本地设置保存，界面默认隐藏，不会写入 QA 结果批次目录。"
    },
    literature_api_url: {
      title: "文献 API 地址",
      body: "预留给文献增强链路的接口地址。\n\n当前你已要求先不接入正式生成流程，所以它现在主要是为后续扩展准备。"
    },
    literature_api_auth: {
      title: "文献 API 鉴权",
      body: "访问文献接口时使用的鉴权令牌或密钥。\n\n会跟随本地设置保存，不会写入输出批次目录。"
    },
    target_count: {
      title: "目标数量",
      body: "本次任务想最终生成多少条 QA。\n\n普通 QA 可以按正式生产规模填写。CoT QA 会自动限制在 100 条以内，避免一次测试过重。"
    },
    plan_limit: {
      title: "规划上限",
      body: "前置生成多少个候选问题计划。\n\n它不是最终 QA 数量，而是问题草案池。数量越高，主题覆盖可能更丰富，但前置规划也会更重。"
    },
    shard_size: {
      title: "Shard 大小",
      body: "每个结果分片文件最多包含多少条 QA。\n\n生成结果会按 `shard_XXXX.json` 分片保存，便于续跑、浏览和排错。它不能大于目标数量；CoT 模式下还会额外限制在 10 以内。"
    },
    batch_size: {
      title: "Batch 大小",
      body: "单次模型请求希望返回多少条 QA。\n\n值越大，速度可能更快，但模型更容易返回不稳定 JSON。它不能大于 shard 大小；CoT 模式固定为 1。"
    },
    max_in_flight: {
      title: "最大并发",
      body: "同时允许多少个生成请求并行发送。\n\n并发越高，速度可能越快，但也更容易触发限流、超时和格式不稳定。CoT 模式当前固定为 2，属于保守低并发。"
    },
    max_retries: {
      title: "最大重试",
      body: "单个请求失败后，最多再自动重试几次。\n\n适合应对临时网络抖动、上游限流或模型偶发返回异常。"
    },
    timeout_secs: {
      title: "超时秒数",
      body: "单个模型请求最多等待多久。\n\n如果回答很长或上游较慢，超时过短会导致误判失败；过长则会拖慢失败恢复。"
    },
    resume_existing: {
      title: "续跑已有 shard",
      body: "重新运行时，如果某些 shard 文件已经存在，是否直接跳过。\n\n适合长任务中断后的恢复，不必从头再跑全部分片。"
    }
  },
  en: {
    provider_preset: {
      title: "Model Provider",
      body: "Applies a ready-made vendor preset.\n\nChoosing a provider fills the model list, Base URL, and suggested runtime defaults. Use Custom only for private gateways or unusual compatible endpoints."
    },
    model: {
      title: "Model",
      body: "The actual model name used for generation.\n\nPick from the built-in list when available. Use a custom model only when you need a private or non-listed model id."
    },
    base_url: {
      title: "Base URL",
      body: "Root endpoint for the model API.\n\nFor OpenAI-compatible providers, the app sends requests to `/chat/completions` under this base URL. Most users should keep the vendor default."
    },
    api_key: {
      title: "API Key",
      body: "Authentication key for the model service.\n\nThe desktop app stores it in the local config, hides it by default in the UI, and does not write it into output batch folders."
    },
    qa_platform_url: {
      title: "QA Platform URL",
      body: "Unified base address for the QA evaluation platform.\n\nOrdinary users only need this one field. The app derives the web base and API base internally."
    },
    qa_platform_username: {
      title: "QA Platform Username",
      body: "Your own account on the QA evaluation platform.\n\nThis is not an admin account. Upload, self-review, and platform checks use this account."
    },
    qa_platform_password: {
      title: "QA Platform Password",
      body: "Your own login password for the QA evaluation platform.\n\nIt is stored with local settings, hidden in the UI by default, and never written into generated batch folders."
    },
    literature_api_url: {
      title: "Literature API URL",
      body: "Reserved endpoint for literature-enhanced workflows.\n\nIt is currently kept as a future integration field and is not yet part of the active generation path."
    },
    literature_api_auth: {
      title: "Literature API Auth",
      body: "Token or key used to access the literature API.\n\nIt is stored with the local settings and not written into output batch folders."
    },
    target_count: {
      title: "Target Count",
      body: "How many QA items this run should produce overall.\n\nNormal QA can use production-scale counts. CoT QA is automatically capped at 100 items for safer testing."
    },
    plan_limit: {
      title: "Plan Limit",
      body: "How many candidate question plans to draft before generation.\n\nThis is not the final QA count. A larger pool can improve coverage but makes the planning phase heavier."
    },
    shard_size: {
      title: "Shard Size",
      body: "Maximum QA items written into one shard file.\n\nOutputs are saved as `shard_XXXX.json` files for resume, browse, and debugging. It cannot exceed the target count, and CoT mode also caps it at 10."
    },
    batch_size: {
      title: "Batch Size",
      body: "How many QA items one model request should return.\n\nLarger batches can be faster but are more likely to produce unstable JSON. It cannot exceed the shard size, and CoT mode fixes it at 1."
    },
    max_in_flight: {
      title: "Max In Flight",
      body: "How many generation requests can run at the same time.\n\nHigher concurrency may improve speed but also increases rate-limit, timeout, and formatting risks. CoT mode currently fixes it at 2 as a conservative low-concurrency setting."
    },
    max_retries: {
      title: "Max Retries",
      body: "Maximum automatic retries for one failed request.\n\nUseful for temporary network problems, upstream rate limits, or occasional malformed model responses."
    },
    timeout_secs: {
      title: "Timeout Secs",
      body: "How long one model request can wait before timing out.\n\nIf responses are long or the upstream is slow, values that are too small can fail otherwise valid runs."
    },
    resume_existing: {
      title: "Resume Existing Shards",
      body: "Whether to skip shard files that already exist when rerunning.\n\nUseful for recovering long jobs without regenerating completed shards."
    }
  }
};
const RESEARCH_FIELD_TAXONOMY: readonly ResearchFieldNode[] = [
  {
    id: "agri",
    zh: "农业与生物育种",
    en: "Agriculture and Biological Breeding",
    children: [
      {
        id: "agri.crop_science",
        zh: "作物科学",
        en: "Crop Science",
        children: [
          { id: "agri.crop_science.crop_breeding", zh: "作物遗传育种", en: "Crop Genetics and Breeding" },
          { id: "agri.crop_science.molecular_breeding", zh: "分子育种", en: "Molecular Breeding" },
          { id: "agri.crop_science.genomic_selection", zh: "基因组选择", en: "Genomic Selection" },
          { id: "agri.crop_science.germplasm", zh: "种质创新与资源利用", en: "Germplasm Innovation and Utilization" },
          { id: "agri.crop_science.quality_improvement", zh: "品质改良", en: "Quality Improvement" }
        ]
      },
      {
        id: "agri.plant_biology",
        zh: "植物生物学",
        en: "Plant Biology",
        children: [
          { id: "agri.plant_biology.molecular_biology", zh: "植物分子生物学", en: "Plant Molecular Biology" },
          { id: "agri.plant_biology.gene_regulation", zh: "基因调控", en: "Gene Regulation" },
          { id: "agri.plant_biology.stress_biology", zh: "逆境生物学", en: "Stress Biology" },
          { id: "agri.plant_biology.development", zh: "植物发育", en: "Plant Development" },
          { id: "agri.plant_biology.physiology", zh: "植物生理", en: "Plant Physiology" }
        ]
      },
      {
        id: "agri.plant_protection",
        zh: "植物保护",
        en: "Plant Protection",
        children: [
          { id: "agri.plant_protection.disease_resistance", zh: "病害抗性", en: "Disease Resistance" },
          { id: "agri.plant_protection.insect_resistance", zh: "虫害抗性", en: "Insect Resistance" },
          { id: "agri.plant_protection.host_pathogen", zh: "寄主-病原互作", en: "Host-Pathogen Interaction" },
          { id: "agri.plant_protection.integrated_management", zh: "综合防控", en: "Integrated Pest Management" }
        ]
      },
      {
        id: "agri.seed_horticulture",
        zh: "种子与园艺",
        en: "Seed Science and Horticulture",
        children: [
          { id: "agri.seed_horticulture.seed_science", zh: "种子科学与技术", en: "Seed Science and Technology" },
          { id: "agri.seed_horticulture.vegetable_science", zh: "蔬菜科学", en: "Vegetable Science" },
          { id: "agri.seed_horticulture.fruit_science", zh: "果树科学", en: "Fruit Science" },
          { id: "agri.seed_horticulture.postharvest", zh: "采后生物学", en: "Postharvest Biology" }
        ]
      },
      {
        id: "agri.omics_bioinformatics",
        zh: "组学与农业生物信息",
        en: "Omics and Agricultural Bioinformatics",
        children: [
          { id: "agri.omics_bioinformatics.genomics", zh: "基因组学", en: "Genomics" },
          { id: "agri.omics_bioinformatics.transcriptomics", zh: "转录组学", en: "Transcriptomics" },
          { id: "agri.omics_bioinformatics.multiomics", zh: "多组学整合", en: "Multi-omics Integration" },
          { id: "agri.omics_bioinformatics.phenomics", zh: "表型组学", en: "Phenomics" },
          { id: "agri.omics_bioinformatics.systems_biology", zh: "系统生物学", en: "Systems Biology" }
        ]
      },
      {
        id: "agri.environment",
        zh: "农业资源与环境",
        en: "Agricultural Resources and Environment",
        children: [
          { id: "agri.environment.soil_science", zh: "土壤科学", en: "Soil Science" },
          { id: "agri.environment.nutrient_management", zh: "养分管理", en: "Nutrient Management" },
          { id: "agri.environment.agroecology", zh: "农业生态", en: "Agroecology" },
          { id: "agri.environment.smart_agriculture", zh: "智慧农业", en: "Smart Agriculture" }
        ]
      }
    ]
  },
  {
    id: "medicine",
    zh: "医学与健康",
    en: "Medicine and Health",
    children: [
      {
        id: "medicine.basic",
        zh: "基础医学",
        en: "Basic Medicine",
        children: [
          { id: "medicine.basic.molecular_medicine", zh: "分子医学", en: "Molecular Medicine" },
          { id: "medicine.basic.immunology", zh: "免疫学", en: "Immunology" },
          { id: "medicine.basic.neuroscience", zh: "神经科学", en: "Neuroscience" },
          { id: "medicine.basic.genomics", zh: "医学基因组学", en: "Medical Genomics" }
        ]
      },
      {
        id: "medicine.clinical",
        zh: "临床医学",
        en: "Clinical Medicine",
        children: [
          { id: "medicine.clinical.oncology", zh: "肿瘤学", en: "Oncology" },
          { id: "medicine.clinical.cardiovascular", zh: "心血管医学", en: "Cardiovascular Medicine" },
          { id: "medicine.clinical.infectious", zh: "感染性疾病", en: "Infectious Diseases" },
          { id: "medicine.clinical.precision", zh: "精准医学", en: "Precision Medicine" }
        ]
      },
      {
        id: "medicine.public_health",
        zh: "公共卫生与药学",
        en: "Public Health and Pharmacy",
        children: [
          { id: "medicine.public_health.epidemiology", zh: "流行病学", en: "Epidemiology" },
          { id: "medicine.public_health.drug_discovery", zh: "药物发现", en: "Drug Discovery" },
          { id: "medicine.public_health.pharmacology", zh: "药理学", en: "Pharmacology" },
          { id: "medicine.public_health.medical_informatics", zh: "医学信息学", en: "Medical Informatics" }
        ]
      }
    ]
  },
  {
    id: "chemistry_materials",
    zh: "化学与材料",
    en: "Chemistry and Materials",
    children: [
      {
        id: "chemistry_materials.chemistry",
        zh: "化学",
        en: "Chemistry",
        children: [
          { id: "chemistry_materials.chemistry.organic", zh: "有机化学", en: "Organic Chemistry" },
          { id: "chemistry_materials.chemistry.analytical", zh: "分析化学", en: "Analytical Chemistry" },
          { id: "chemistry_materials.chemistry.physical", zh: "物理化学", en: "Physical Chemistry" },
          { id: "chemistry_materials.chemistry.computational", zh: "计算化学", en: "Computational Chemistry" }
        ]
      },
      {
        id: "chemistry_materials.materials",
        zh: "材料科学",
        en: "Materials Science",
        children: [
          { id: "chemistry_materials.materials.nanomaterials", zh: "纳米材料", en: "Nanomaterials" },
          { id: "chemistry_materials.materials.energy_storage", zh: "储能材料", en: "Energy Storage Materials" },
          { id: "chemistry_materials.materials.polymer", zh: "高分子材料", en: "Polymer Materials" },
          { id: "chemistry_materials.materials.biomaterials", zh: "生物材料", en: "Biomaterials" }
        ]
      }
    ]
  },
  {
    id: "computer_ai",
    zh: "计算机与人工智能",
    en: "Computer Science and AI",
    children: [
      {
        id: "computer_ai.ai",
        zh: "人工智能",
        en: "Artificial Intelligence",
        children: [
          { id: "computer_ai.ai.large_models", zh: "大模型与智能体", en: "Large Models and Agents" },
          { id: "computer_ai.ai.machine_learning", zh: "机器学习", en: "Machine Learning" },
          { id: "computer_ai.ai.cv", zh: "计算机视觉", en: "Computer Vision" },
          { id: "computer_ai.ai.nlp", zh: "自然语言处理", en: "Natural Language Processing" }
        ]
      },
      {
        id: "computer_ai.data",
        zh: "数据与软件系统",
        en: "Data and Software Systems",
        children: [
          { id: "computer_ai.data.data_mining", zh: "数据挖掘", en: "Data Mining" },
          { id: "computer_ai.data.databases", zh: "数据库与知识管理", en: "Databases and Knowledge Management" },
          { id: "computer_ai.data.systems", zh: "分布式系统", en: "Distributed Systems" },
          { id: "computer_ai.data.scientific_computing", zh: "科学计算", en: "Scientific Computing" }
        ]
      }
    ]
  },
  {
    id: "engineering",
    zh: "工程技术",
    en: "Engineering",
    children: [
      {
        id: "engineering.information",
        zh: "电子与信息工程",
        en: "Electronic and Information Engineering",
        children: [
          { id: "engineering.information.communication", zh: "通信与网络", en: "Communication and Networking" },
          { id: "engineering.information.signal", zh: "信号处理", en: "Signal Processing" },
          { id: "engineering.information.microelectronics", zh: "微电子", en: "Microelectronics" },
          { id: "engineering.information.control", zh: "自动控制", en: "Automatic Control" }
        ]
      },
      {
        id: "engineering.mechanical",
        zh: "机械与制造",
        en: "Mechanical and Manufacturing",
        children: [
          { id: "engineering.mechanical.robotics", zh: "机器人", en: "Robotics" },
          { id: "engineering.mechanical.intelligent_manufacturing", zh: "智能制造", en: "Intelligent Manufacturing" },
          { id: "engineering.mechanical.thermal_fluids", zh: "热流体工程", en: "Thermal and Fluid Engineering" },
          { id: "engineering.mechanical.design", zh: "机械设计", en: "Mechanical Design" }
        ]
      },
      {
        id: "engineering.energy_environment",
        zh: "能源化工与环境工程",
        en: "Energy, Chemical, and Environmental Engineering",
        children: [
          { id: "engineering.energy_environment.process", zh: "过程系统工程", en: "Process Systems Engineering" },
          { id: "engineering.energy_environment.renewable", zh: "可再生能源", en: "Renewable Energy" },
          { id: "engineering.energy_environment.carbon", zh: "碳管理与减排", en: "Carbon Management and Mitigation" },
          { id: "engineering.energy_environment.water", zh: "水处理与环境修复", en: "Water Treatment and Remediation" }
        ]
      }
    ]
  },
  {
    id: "physics_math",
    zh: "物理与数学统计",
    en: "Physics, Mathematics, and Statistics",
    children: [
      {
        id: "physics_math.physics",
        zh: "物理学",
        en: "Physics",
        children: [
          { id: "physics_math.physics.condensed_matter", zh: "凝聚态物理", en: "Condensed Matter Physics" },
          { id: "physics_math.physics.optics", zh: "光学与光子学", en: "Optics and Photonics" },
          { id: "physics_math.physics.particle", zh: "粒子与核物理", en: "Particle and Nuclear Physics" },
          { id: "physics_math.physics.computational", zh: "计算物理", en: "Computational Physics" }
        ]
      },
      {
        id: "physics_math.math",
        zh: "数学与统计",
        en: "Mathematics and Statistics",
        children: [
          { id: "physics_math.math.applied_math", zh: "应用数学", en: "Applied Mathematics" },
          { id: "physics_math.math.statistics", zh: "统计学", en: "Statistics" },
          { id: "physics_math.math.optimization", zh: "优化方法", en: "Optimization" },
          { id: "physics_math.math.biostatistics", zh: "生物统计", en: "Biostatistics" }
        ]
      }
    ]
  },
  {
    id: "earth_environment",
    zh: "地球与环境科学",
    en: "Earth and Environmental Sciences",
    children: [
      {
        id: "earth_environment.earth",
        zh: "地球科学",
        en: "Earth Science",
        children: [
          { id: "earth_environment.earth.climate", zh: "气候变化", en: "Climate Change" },
          { id: "earth_environment.earth.remote_sensing", zh: "遥感与地理信息", en: "Remote Sensing and GIS" },
          { id: "earth_environment.earth.hydrology", zh: "水文学", en: "Hydrology" },
          { id: "earth_environment.earth.geology", zh: "地质过程", en: "Geological Processes" }
        ]
      },
      {
        id: "earth_environment.ecology",
        zh: "生态与保护",
        en: "Ecology and Conservation",
        children: [
          { id: "earth_environment.ecology.biodiversity", zh: "生物多样性保护", en: "Biodiversity Conservation" },
          { id: "earth_environment.ecology.restoration", zh: "生态修复", en: "Ecological Restoration" },
          { id: "earth_environment.ecology.pollution", zh: "污染生态学", en: "Pollution Ecology" },
          { id: "earth_environment.ecology.sustainability", zh: "可持续发展", en: "Sustainability" }
        ]
      }
    ]
  },
  {
    id: "economics_management",
    zh: "经济与管理",
    en: "Economics and Management",
    children: [
      {
        id: "economics_management.economics",
        zh: "经济学",
        en: "Economics",
        children: [
          { id: "economics_management.economics.agri_economics", zh: "农业经济", en: "Agricultural Economics" },
          { id: "economics_management.economics.innovation", zh: "创新经济", en: "Innovation Economics" },
          { id: "economics_management.economics.finance", zh: "金融与投资", en: "Finance and Investment" },
          { id: "economics_management.economics.policy", zh: "政策评估", en: "Policy Evaluation" }
        ]
      },
      {
        id: "economics_management.management",
        zh: "管理科学",
        en: "Management Science",
        children: [
          { id: "economics_management.management.operations", zh: "运营与供应链", en: "Operations and Supply Chain" },
          { id: "economics_management.management.project", zh: "项目管理", en: "Project Management" },
          { id: "economics_management.management.strategy", zh: "战略管理", en: "Strategic Management" },
          { id: "economics_management.management.digital", zh: "数字化管理", en: "Digital Management" }
        ]
      }
    ]
  },
  {
    id: "social_humanities",
    zh: "社会科学与人文",
    en: "Social Sciences and Humanities",
    children: [
      {
        id: "social_humanities.social",
        zh: "社会科学",
        en: "Social Sciences",
        children: [
          { id: "social_humanities.social.education", zh: "教育研究", en: "Education Research" },
          { id: "social_humanities.social.psychology", zh: "心理学", en: "Psychology" },
          { id: "social_humanities.social.sociology", zh: "社会学", en: "Sociology" },
          { id: "social_humanities.social.media", zh: "传播与媒体", en: "Communication and Media" }
        ]
      },
      {
        id: "social_humanities.humanities",
        zh: "人文与法政",
        en: "Humanities and Law/Policy",
        children: [
          { id: "social_humanities.humanities.law", zh: "法学", en: "Law" },
          { id: "social_humanities.humanities.policy", zh: "公共政策", en: "Public Policy" },
          { id: "social_humanities.humanities.history", zh: "历史与文化研究", en: "History and Cultural Studies" },
          { id: "social_humanities.humanities.linguistics", zh: "语言学", en: "Linguistics" }
        ]
      }
    ]
  },
  {
    id: "interdisciplinary",
    zh: "交叉前沿",
    en: "Interdisciplinary Frontiers",
    children: [
      {
        id: "interdisciplinary.aiforscience",
        zh: "AI for Science",
        en: "AI for Science",
        children: [
          { id: "interdisciplinary.aiforscience.digital_agriculture", zh: "数字农业", en: "Digital Agriculture" },
          { id: "interdisciplinary.aiforscience.synthetic_biology", zh: "合成生物学", en: "Synthetic Biology" },
          { id: "interdisciplinary.aiforscience.biomedical_engineering", zh: "生物医学工程", en: "Biomedical Engineering" },
          { id: "interdisciplinary.aiforscience.science_foundation_models", zh: "科学基础模型", en: "Scientific Foundation Models" }
        ]
      }
    ]
  }
] as const;
const QUICK_TOPIC_TAG_IDS = [
  "agri.crop_science.crop_breeding",
  "agri.crop_science.molecular_breeding",
  "agri.crop_science.genomic_selection",
  "agri.crop_science.germplasm",
  "agri.omics_bioinformatics.transcriptomics",
  "agri.omics_bioinformatics.multiomics",
  "agri.omics_bioinformatics.phenomics",
  "agri.plant_protection.disease_resistance"
] as const;
const RESEARCH_FIELD_LABELS = createResearchFieldLabels(RESEARCH_FIELD_TAXONOMY);
const PROVIDER_PRESETS: Record<ProviderPresetConfigKey, ProviderPresetConfig> = {
  qwen_dashscope: {
    provider: "openai-compatible",
    defaultModel: "qwen3.6-max-preview",
    models: [
      "qwen3.6-max-preview",
      "qwen3.6-plus",
      "qwen-plus",
      "qwen-max",
      "qwen-turbo",
      "qwen-long",
      "qwen3-max"
    ],
    baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1",
    batchSize: 8,
    maxInFlight: 4,
    requestTimeoutSecs: 180
  },
  deepseek: {
    provider: "openai-compatible",
    defaultModel: "deepseek-chat",
    models: ["deepseek-chat", "deepseek-reasoner"],
    baseUrl: "https://api.deepseek.com",
    batchSize: 8,
    maxInFlight: 4,
    requestTimeoutSecs: 240
  },
  moonshot_kimi: {
    provider: "openai-compatible",
    defaultModel: "kimi-latest-32k",
    models: ["kimi-latest-8k", "kimi-latest-32k", "kimi-latest-128k", "kimi-k2-0711-preview"],
    baseUrl: "https://api.moonshot.cn/v1",
    batchSize: 8,
    maxInFlight: 4,
    requestTimeoutSecs: 240
  },
  zhipu_glm: {
    provider: "openai-compatible",
    defaultModel: "glm-4.5-flash",
    models: ["glm-4.5-flash", "glm-4.5-air", "glm-4.5", "glm-5.1"],
    baseUrl: "https://open.bigmodel.cn/api/paas/v4",
    batchSize: 8,
    maxInFlight: 4,
    requestTimeoutSecs: 240
  },
  minimax: {
    provider: "openai-compatible",
    defaultModel: "MiniMax-M2.5",
    models: ["MiniMax-M2.5", "MiniMax-M2.5-Preview", "MiniMax-M1"],
    baseUrl: "https://api.minimaxi.com/v1",
    batchSize: 8,
    maxInFlight: 4,
    requestTimeoutSecs: 240
  },
  tencent_hunyuan: {
    provider: "openai-compatible",
    defaultModel: "hunyuan-turbos-latest",
    models: ["hunyuan-lite", "hunyuan-turbos-latest", "hunyuan-t1-latest"],
    baseUrl: "https://api.hunyuan.cloud.tencent.com/v1",
    batchSize: 8,
    maxInFlight: 4,
    requestTimeoutSecs: 240
  },
  baidu_qianfan: {
    provider: "openai-compatible",
    defaultModel: "ERNIE-4.5-Turbo-128K",
    models: ["ERNIE-4.5-Turbo-128K", "ERNIE-5.0", "ERNIE-X1.1"],
    baseUrl: "https://qianfan.baidubce.com/v2",
    batchSize: 8,
    maxInFlight: 4,
    requestTimeoutSecs: 240
  },
  stub_local: {
    provider: "stub",
    defaultModel: "stub-topic-distiller",
    models: ["stub-topic-distiller"],
    baseUrl: "",
    batchSize: 24,
    maxInFlight: 16,
    requestTimeoutSecs: 120
  }
} as const;

const translations: Record<Lang, Record<string, string>> = {
  zh: {
    eyebrow: "DISTILL STUDIO",
    hero_title: "QA小灶",
    hero_lede: "你生成QA，我们帮你建模型、服务社区。",
    app_author_badge: "开发 kentnf",
    lang_label: "语言",
    panel_title: "流水线输入",
    panel_copy: "左侧切换工作区，中间编辑当前设置，右侧查看结果和运行状态。",
    nav_title: "工作区",
    nav_copy: "像应用程序一样切换设置页。",
    actions_setup: "应用",
    action_check_update: "检查更新",
    action_install_update: "安装更新",
    action_retry_update: "重试更新",
    telemetry_title: "运行遥测",
    telemetry_copy: "实时查看 Rust 后端发出的阶段进度和日志。",
    setup_title: "当前配置",
    setup_copy: "显示当前页配置的关键摘要。",
    result_title: "当前结果",
    result_copy: "把最近一次 Topic 预览或流水线输出整理成便于查看的摘要卡片。",
    raw_json: "原始 JSON",
    result_actions: "结果操作",
    output_mode_idle: "空白",
    output_mode_preview: "Topic 预览",
    output_mode_run: "流水线结果",
    output_mode_validation: "配置检查",
    output_mode_error: "错误",
    tab_topic: "QA生成",
    tab_settings: "设置",
    tab_browse: "浏览QA",
    tab_qa_evaluate: "QA评测",
    tab_model_trial: "模型试用",
    tab_recent_updates: "最近更新",
    tab_chat_qa: "对话QA",
    tab_feedback: "功能建议",
    tab_feedback2: "功能建议",
    chat_qa_tab_copy: "与配置好的大模型进行对话，支持本地模型和平台模型。",
    chat_qa_model: "当前模型",
    chat_qa_no_model: "请先在设置页面配置模型和 API Key",
    chat_qa_empty: "输入消息开始对话",
    chat_qa_user: "你",
    chat_qa_assistant: "助手",
    chat_qa_send_failed: "消息发送失败",
    chat_qa_placeholder: "输入你的消息...",
    chat_qa_send: "发送",
    chat_qa_new_session: "新建会话",
    chat_qa_session_untitled: "新会话",
    chat_qa_upload: "上传至平台",
    chat_qa_uploading: "上传中...",
    chat_qa_upload_success: "上传成功",
    chat_qa_upload_failed: "上传失败",
    chat_qa_upload_no_auth: "请先在设置中登录平台",
    chat_qa_upload_empty: "当前会话无消息可上传",
    paper_qa_tab: "文献问答",
    paper_qa_add: "添加 PDF",
    paper_qa_convert: "转换",
    paper_qa_generate: "生成问答",
    paper_qa_upload: "上传到平台",
    paper_qa_save_batch: "存为批次",
    paper_qa_cot_ratio: "思维链比例",
    paper_qa_pending: "等待中",
    paper_qa_converting: "转换中…",
    paper_qa_converted: "已转换",
    paper_qa_chunked: "{n} 个分块",
    paper_qa_error: "出错",
    paper_qa_empty: "添加 PDF 文献开始使用",
    paper_qa_no_provider: "请先在设置中配置模型",
    paper_qa_max_files: "最多 20 篇 PDF",
    paper_qa_drag_hint: "拖拽 PDF 文件到此处",
    paper_qa_stats: "共 {total} 条 · {cot} 思维链 + {qa} 问答",
    paper_qa_uploading: "保存中…",
    paper_qa_save_batch_done: "已存入浏览 QA",
    paper_qa_save_batch_error: "存入批次失败",
    paper_qa_generating: "生成中…",
    paper_qa_generate_error: "生成失败",
    tab_internal_badge: "内测",
    tab_topic_copy: "研究主题与领域标签",
    tab_settings_copy: "模型、输出与批处理参数",
    topic_tab_title: "QA生成",
    topic_tab_copy: "先写核心研究主题，再用标签补充学科领域、研究方向或语境。",
    settings_tab_title: "设置",
    settings_tab_copy: "模型、接口、输出和批处理参数。",
    settings_basic_copy: "普通用户通常只需要选择模型厂商、模型并填写 API 密钥。",
    cot_structure_section_title: "CoT结构",
    cot_section_headers: "CoT标题结构",
    cot_section_headers_hint: "一行一个标题。运行时会按这些标题组织 CoT 回答；留空时会自动回退到默认八段式结构。",
    output_root: "输出目录",
    output_root_hint: "选择生成任务和历史任务使用的根目录。程序仍会在该目录下自动创建每次运行的子文件夹。",
    settings_checklist_title: "首次配置提示",
    settings_checklist_copy: "这里仅检查能否开始使用的最小条件。填写后会自动保存在本机，无需手动保存。",
    settings_checklist_done: "已完成",
    settings_checklist_pending: "待补充",
    settings_checklist_provider: "模型厂商",
    settings_checklist_provider_ready: "当前已选择：{value}",
    settings_checklist_provider_pending: "请先选择一个可用的模型厂商或接入方式。",
    settings_checklist_model: "模型",
    settings_checklist_model_ready: "当前已选择：{value}",
    settings_checklist_model_pending: "请先选择模型，或填写自定义模型名。",
    settings_checklist_connection: "接口与鉴权",
    settings_checklist_connection_ready: "Base URL 与 API 密钥已就绪，设置会自动保存在本机。",
    settings_checklist_connection_not_required: "当前接入方式不需要额外填写 Base URL 或 API 密钥。",
    settings_checklist_connection_pending: "还需补充：{value}",
    settings_checklist_ready: "开始使用",
    settings_checklist_ready_done: "基础设置已完成。现在可以返回“QA生成”直接运行任务。",
    settings_checklist_ready_pending: "还不能直接运行，请先补齐：{value}",
    settings_checklist_missing_provider: "模型厂商",
    settings_checklist_missing_model: "模型",
    settings_checklist_missing_base_url: "Base URL",
    settings_checklist_missing_api_key: "API 密钥",
    browse_tab_title: "浏览QA",
    qa_evaluate_tab_title: "QA评测",
    qa_evaluate_tab_copy: "检查平台连通性、确认登录状态，并打开平台评测工作区。",
    model_trial_tab_title: "模型试用",
    model_trial_tab_copy: "直接在桌面端内嵌试用对话，选择模型和参考 QA 后即可开始测试。",
    model_section_title: "模型配置",
    integration_section_title: "平台接口",
    literature_section_title: "文献接口",
    runtime_section_title: "运行参数",
    advanced_settings_summary: "高级设置",
    advanced_settings_copy: "这里主要是平台接口和运行参数。普通用户一般保持默认即可。",
    run_status_title: "运行状态",
    run_logs_title: "运行日志",
    run_stats_title: "运行统计",
    action_export_logs: "导出日志",
    action_open_run_output_dir: "打开输出文件夹",
    continue_run: "继续",
    field_help_button: "查看说明",
    runtime_constraint_hint_normal: "参数联动：Shard 大小不能超过目标数量，Batch 大小不能超过 Shard 大小。",
    runtime_constraint_hint_cot: "CoT 安全约束：目标数量不超过 100，Batch 大小固定为 1，最大并发固定为 2，Shard 大小不超过 10 且不超过目标数量。",
    run_locked_hint: "运行中参数已锁定；停止后才会接受新的修改。",
    browse_batches_title: "历史任务",
    browse_batches_empty: "还没有历史任务记录。",
    browse_questions_title: "QA问题列表",
    browse_questions_empty: "请先选择一个批次。",
    browse_review_title: "快审问题",
    browse_review_empty: "这个批次里还没有可审阅的问题。",
    browse_detail_title: "QA详情",
    browse_detail_empty: "请选择一条 QA。",
    browse_questions_loading: "正在加载 QA 问题列表...",
    browse_review_loading: "正在加载快审问题...",
    browse_detail_loading: "正在加载 QA 详情...",
    browse_back_batches: "返回批次",
    browse_back_questions: "返回问题列表",
    browse_prev: "上一页",
    browse_next: "下一页",
    browse_total_items: "总数",
    browse_kept_items: "保留",
    browse_generated_items: "已生成",
    browse_target_items: "目标",
    browse_updated_at: "更新时间",
    browse_task_status: "状态",
    browse_request_count: "请求数",
    browse_shard_progress: "分片进度",
    browse_history_count: "任务数",
    browse_review_progress: "快审",
    browse_review_kept: "本地保留",
    browse_review_discarded: "本地丢弃",
    browse_review_status: "快审状态",
    browse_review_status_unreviewed: "未品审",
    browse_review_status_kept: "保留",
    browse_review_status_discarded: "丢弃",
    browse_review_question_edited: "已改题",
    browse_question_original: "原问题",
    browse_status_completed: "已完成",
    browse_status_running: "进行中",
    browse_status_generated: "待打包",
    browse_status_prepared: "已准备",
    browse_subtopic: "子主题",
    browse_axis: "问题轴",
    browse_question_type: "问题类型",
    browse_difficulty: "难度",
    browse_audience: "受众",
    browse_provider: "Provider",
    browse_model: "模型",
    browse_batch_name: "批次",
    browse_output_dir: "输出目录",
    browse_prompt: "主题描述",
    browse_action_open: "浏览",
    browse_action_continue: "继续",
    browse_action_continue_run: "继续生成",
    browse_action_load_generate: "加载到生成页",
    browse_action_delete: "删除",
    browse_action_review: "快审",
    browse_action_upload: "上传",
    browse_action_uploading: "上传中...",
    browse_review_save: "保存问题",
    browse_review_saving: "保存中...",
    browse_review_save_failed: "保存快审失败",
    browse_review_keep: "保留",
    browse_review_discard: "丢弃",
    browse_review_prev_question: "上一个问题",
    browse_review_next_question: "下一个问题",
    browse_uploaded_badge: "已上传",
    browse_platform_status_uploaded: "已上传",
    browse_platform_status_processing: "解析中",
    browse_platform_status_parsed: "已入库",
    browse_platform_status_failed: "解析失败",
    browse_platform_status_sync_failed: "批次平台状态同步失败",
    browse_platform_url_missing: "请先在设置里填写 QA评测平台地址。",
    browse_platform_credentials_missing: "请先在设置里填写 QA评测用户名和密码。",
    browse_upload_url: "QA 上传地址",
    browse_upload_url_hint: "填写 QA 评测平台地址后，生成批次里的“上传”按钮会可用。",
    browse_upload_url_missing: "请先在设置里填写 QA 上传地址。",
    browse_delete_confirm: "确认删除这个生成批次及其全部 QA 吗？",
    browse_delete_success: "已删除生成批次。",
    browse_upload_success: "QA 批次上传成功。",
    browse_upload_exists: "这个 QA 批次已经上传，不必重复上传。",
    browse_upload_failed: "上传失败",
    browse_upload_no_kept_items: "这个批次还没有本地保留的问题可上传。",
    qa_platform_url: "QA评测平台地址",
    qa_platform_url_hint: "实验室内部使用。普通用户只需要填写这一个地址，程序会自动派生页面地址和接口地址。",
    qa_platform_dev: "127.0.0.1（开发）",
    qa_platform_prod: "182.92.166.143（生产）",
    qa_platform_env_label: "QA 平台",
    qa_platform_username: "QA评测用户名",
    qa_platform_password: "QA评测密码",
    platform_internal_hint: "实验室内部使用。生产环境通常直接填写 182.92.166.143；本机联调可填写 127.0.0.1。",
    platform_trial_hint: "内嵌模型试用需要先确认平台地址、用户名和密码都已填写。",
    platform_trial_entry: "试用方式",
    platform_trial_entry_hint: "这里直接调用 qaevaluate 的独立 trial API，在桌面端内嵌会话列表和聊天框。",
    platform_health_idle: "还没有检查平台连通性。",
    platform_login_idle: "还没有检查平台登录状态。",
    platform_health_checking: "正在检查平台连通性...",
    platform_login_checking: "正在检查平台登录状态...",
    platform_web_base: "平台页面地址",
    platform_api_base: "平台接口地址",
    platform_current_user: "当前平台用户",
    platform_application: "所属应用",
    platform_no_application: "当前账号还没有分配应用",
    platform_action_check: "检查联通",
    platform_action_login: "检查登录",
    platform_action_open_qa: "打开平台评测页",
    platform_action_open_trial: "打开平台模型试用页",
    platform_action_refresh_trial: "刷新试用数据",
    platform_action_create_trial: "新建会话",
    platform_action_send_trial: "发送",
    platform_health_ok: "QA评测平台连通正常：",
    platform_health_failed: "QA评测平台连通失败",
    platform_login_ok: "QA评测平台登录成功：",
    platform_login_failed: "QA评测平台登录失败",
    platform_opened_qa_page: "已在浏览器中打开 QA评测页面；如浏览器未登录平台，可能会先进入登录页。",
    platform_opened_trial_page: "已在浏览器中打开模型试用页面；如浏览器未登录平台，可能会先进入登录页。",
    platform_open_failed: "打开平台页面失败",
    model_trial_settings_required: "请先在设置里填写 QA评测平台地址、用户名和密码。",
    model_trial_loading: "正在加载模型试用数据...",
    model_trial_empty_sessions: "还没有试用会话。先选择模型，再开始一轮对话。",
    model_trial_empty_detail: "请选择一个会话，或直接新建一个试用会话。",
    model_trial_select_model: "试用模型",
    model_trial_select_batch: "参考批次",
    model_trial_select_question: "参考问题",
    model_trial_select_batch_empty: "先选择一个本地生成批次",
    model_trial_select_question_empty: "先选择一个批次，再选择其中的问题",
    model_trial_session_list: "会话列表",
    model_trial_conversation: "对话测试",
    model_trial_source_card: "参考 QA",
    model_trial_user_badge: "当前用户",
    model_trial_model_badge: "模型",
    model_trial_input_placeholder: "输入你要测试的问题、指令，或围绕参考 QA 继续追问。",
    model_trial_error_load: "加载模型试用数据失败",
    model_trial_error_detail: "加载会话详情失败",
    model_trial_error_send: "发送试用消息失败",
    model_trial_error_create: "创建试用会话失败",
    model_trial_error_delete: "删除试用会话失败",
    model_trial_notice_created: "新试用会话已创建。",
    model_trial_notice_deleted: "试用会话已删除。",
    model_trial_notice_refreshed: "模型试用数据已刷新。",
    model_trial_delete: "删除",
    model_trial_delete_busy: "删除中...",
    model_trial_source_application: "应用",
    model_trial_source_type: "QA类型",
    model_trial_source_status: "任务状态",
    model_trial_source_none: "当前会话没有绑定参考 QA。",
    model_trial_source_local: "本地批次问题",
    model_trial_message_user: "你",
    model_trial_message_assistant: "模型",
    model_trial_message_empty: "当前还没有消息，先发一条开始测试。",
    model_trial_need_message: "请输入要发送的内容。",
    model_trial_need_model: "请先选择一个开放试用的模型。",
    model_trial_retry_open: "也可以先在浏览器打开平台模型试用页继续排查。",
    browse_question: "问题",
    browse_answer: "答案",
    browse_qa_mode: "QA类型",
    browse_source_type: "来源类型",
    browse_grounding: "依据",
    provider_preset: "模型厂商",
    provider_preset_hint: "选择厂商后会自动填入接入方式、模型列表和 Base URL；也可以切到自定义并手动填写。",
    config_profile: "配置档案",
    config_profile_hint: "保存和加载都会作用到这个本地档案名。适合保留多套运行参数。",
    topic_tags: "领域与方向",
    topic_tags_hint: "可以选农业生物育种快速标签，也可以通过弹窗选择二级或三级研究方向；选中的标签会拼接到实际发送给模型的主题描述里。",
    qa_mode: "QA类型",
    qa_mode_hint: "普通 QA 产出标准问答；CoT QA 产出更偏科研思路与分析决策的结构化回答。",
    qa_mode_normal: "普通QA",
    qa_mode_cot: "CoT QA",
    selected_tags: "已选标签",
    quick_tags: "农业生物育种快速标签",
    topic_field_selector: "选择研究领域",
    topic_field_selector_hint: "按基金申请或期刊审稿常见方式，选择二级或三级研究领域方向。",
    topic_field_modal_title: "选择研究领域",
    topic_field_modal_copy: "先选一级领域，再从右侧勾选二级或三级方向，可一次添加多个标签。",
    topic_field_primary_title: "一级领域",
    topic_field_detail_title: "二级 / 三级方向",
    topic_field_pending_title: "待添加标签",
    topic_field_add_selected: "添加所选标签",
    topic_field_cancel: "取消",
    topic_field_close: "关闭",
    topic_field_empty: "当前一级领域下还没有可选方向。",
    topic_field_selected_count: "已选 {count} 个",
    no_tags: "还没有添加标签。",
    custom_tag: "自定义标签",
    custom_tag_placeholder: "例如 作物育种、代谢调控、病害抗性",
    add_tag: "自定义标签",
    preset_custom: "自定义",
    preset_qwen_dashscope: "Qwen / DashScope",
    preset_deepseek: "DeepSeek",
    preset_moonshot_kimi: "Kimi / Moonshot",
    preset_zhipu_glm: "智谱 GLM",
    preset_minimax: "MiniMax",
    preset_tencent_hunyuan: "腾讯混元",
    preset_baidu_qianfan: "百度千帆",
    preset_stub_local: "Stub 本地测试",
    preset_platform: "平台模型",
    custom_model: "自定义模型",
    model_custom_option: "自定义模型...",
    topic_prompt: "主题描述",
    literature_api_url: "文献 API 地址",
    literature_api_auth: "文献 API 鉴权 Token",
    literature_api_auth_hint: "用于访问文献接口的鉴权信息，保存在本地设置中。",
    browse: "选择",
    provider: "接入方式",
    model: "模型",
    base_url: "Base URL",
    api_key: "API 密钥",
    api_key_hint: "密钥会保存在本地配置档案中，界面默认隐藏显示。",
    show_secret: "显示",
    hide_secret: "隐藏",
    target_count: "目标数量",
    plan_limit: "规划上限",
    shard_size: "Shard 大小",
    batch_size: "Batch 大小",
    max_in_flight: "最大并发",
    max_retries: "最大重试",
    timeout_secs: "超时秒数",
    resume_existing: "续跑已有 shard",
    preview: "预览 Topic",
    load_config: "加载配置",
    save_config: "保存配置",
    run_pipeline: "运行",
    stop_run: "停止",
    stop_requested: "停止中...",
    managed_run_mode: "任务模式",
    managed_run_mode_new: "新建任务",
    managed_run_mode_resume_latest: "继续当前任务",
    managed_run_mode_hint: "新建任务会创建新的输出目录；继续当前任务会复用最近一次同主题、同 QA 模式、同模型配置的任务目录，并接着已有 shard 继续跑。",
    managed_run_mode_exact_hint: "当前将继续指定历史任务：{value}",
    managed_run_mode_clear: "取消继续，改为新任务",
    managed_run_mode_pick_label: "选择历史任务",
    managed_run_mode_pick_placeholder: "选择一个历史任务继续",
    managed_run_mode_pick_empty: "暂无可继续的历史任务",
    managed_run_mode_pick_hint: "如果要精确接着某个旧任务继续生成，可以直接在这里选择。",
    log_resuming_latest_task: "已切换为继续当前任务模式，将优先复用最近一次匹配任务。",
    log_loaded_batch_task: "已载入历史任务，运行时将继续这个指定批次。",
    log_cleared_batch_task: "已取消指定历史任务续跑，后续运行将新建任务。",
    no_preview: "还没有预览结果。",
    no_run: "还没有运行记录。",
    waiting_events: "等待流水线事件...",
    status_idle: "空闲",
    status_previewing: "预览中",
    status_running: "运行中",
    status_stopping: "停止中",
    status_updating: "更新中",
    preview_generating: "正在生成预览...",
    running_pipeline: "正在运行流水线...",
    stats_elapsed: "已运行",
    stats_avg_speed: "平均速度",
    stats_current_speed: "当前速度",
    stats_eta: "预计剩余",
    stats_generated_progress: "生成进度",
    stats_request_progress: "请求进度",
    stats_shard_progress: "分片进度",
    stats_retry_count: "重试次数",
    stats_failed_requests: "失败请求",
    stats_success_rate: "请求成功率",
    stats_idle: "等待运行",
    stats_not_available: "暂无",
    output_mode_cancelled: "已停止",
    validation_failed: "运行前检查未通过",
    preview_failed: "预览失败",
    pipeline_failed: "流水线失败",
    pipeline_cancelled: "流水线已停止",
    log_request_submitted: "已从 GUI 提交流水线请求。",
    log_stop_requested: "已请求停止运行，正在等待当前请求收尾。",
    log_stop_not_running: "当前没有正在运行的任务。",
    log_stop_failed: "停止运行失败",
    log_pipeline_cancelled: "流水线已按请求停止。",
    log_no_local_config: "还没有本地配置文件。",
    log_loaded_startup: "启动时已加载本地配置。",
    log_loaded_manual: "已加载本地配置。",
    log_load_failed: "加载本地配置失败",
    log_profile_list_failed: "读取本地配置档案列表失败",
    log_no_local_config_profile: "未找到本地配置档案",
    log_loaded_startup_profile: "启动时已加载配置档案",
    log_loaded_manual_profile: "已加载配置档案",
    log_selected_output: "已选择输出目录",
    log_browse_failed: "选择输出目录失败",
    log_saved_config: "已保存本地配置到",
    log_saved_profile: "已保存配置档案",
    log_save_failed: "保存本地配置失败",
    log_stub_migrated: "检测到旧版 Stub 配置，已自动切换到 Qwen / DashScope，请填写真实 API 密钥后测试。",
    log_cot_runtime_normalized: "检测到旧版 CoT 运行参数，已自动调整为保守低并发安全模式。",
    log_pipeline_completed: "流水线完成，数据集输出到",
    log_exported_logs: "已导出运行日志到",
    log_export_failed: "导出运行日志失败",
    log_export_empty: "当前还没有可导出的运行日志。",
    log_opened_path: "已打开路径",
    log_open_failed: "打开路径失败",
    log_copied_value: "已复制到剪贴板",
    log_copy_failed: "复制失败",
    log_applied_preset: "已应用预设",
    log_validation_failed: "运行前检查未通过",
    log_update_not_configured: "自动更新尚未配置。请先准备本地 updater.json。",
    log_update_source: "自动更新配置文件",
    log_update_available: "发现新版本",
    log_update_not_available: "当前已是最新版本",
    log_update_declined: "已取消安装更新。",
    log_update_installing: "正在安装更新",
    log_update_timeout: "检查更新超时：8 秒内无法连接更新服务，已自动重试一次，请稍后再试。",
    log_update_failed: "自动更新失败",
    log_update_manual_download: "打开发布页手动下载",
    log_update_manual_prompt: "自动更新失败。是否打开 GitHub Release 页面手动下载？",
    summary_topic_name: "Topic 名称",
    summary_goal: "目标",
    summary_target_count: "目标数量",
    summary_keyword_count: "关键词数量",
    summary_keywords: "关键词",
    summary_subtopic_count: "子主题数量",
    summary_axis_count: "问题轴数量",
    summary_provider: "Provider",
    summary_model: "模型",
    summary_generated_count: "生成数量",
    summary_kept_count: "保留数量",
    summary_shards: "Shards",
    summary_request_count: "请求次数",
    summary_dataset_path: "数据集路径",
    summary_output_dir: "输出目录",
    summary_profile: "配置档案",
    summary_prompt: "主题摘要",
    summary_topic_tags: "标签",
    summary_preset: "预设",
    action_open_output_dir: "打开输出目录",
    action_select_output_dir: "选择文件夹",
    action_restore_default: "恢复默认",
    action_open_dataset: "打开数据集",
    action_open_pack_summary: "打开打包摘要",
    action_copy_output_dir: "复制输出目录",
    action_copy_dataset_path: "复制数据集路径",
    skipped: "跳过",
    empty_value: "暂无",
    validation_issues: "请先修正以下问题",
    validation_issue_prompt_required: "主题描述不能为空。",
    validation_issue_model_required: "模型名称不能为空。",
    validation_issue_base_url_required: "使用 openai-compatible 时必须填写 Base URL。",
    validation_issue_api_key_required: "使用 openai-compatible 时必须填写 API 密钥。",
    validation_issue_target_count_invalid: "目标数量必须是大于 0 的整数。",
    validation_issue_plan_limit_invalid: "规划上限必须是大于 0 的整数。",
    validation_issue_shard_size_invalid: "Shard 大小必须是大于 0 的整数。",
    validation_issue_batch_size_invalid: "Batch 大小必须是大于 0 的整数。",
    validation_issue_max_in_flight_invalid: "最大并发必须是大于 0 的整数。",
    validation_issue_max_retries_invalid: "最大重试必须是大于等于 0 的整数。",
    validation_issue_timeout_invalid: "超时秒数必须是大于 0 的整数。",
    stage_bootstrap: "初始化",
    stage_plan: "规划",
    stage_literature: "文献增强",
    stage_write_config: "写配置",
    stage_generate: "生成",
    stage_pack: "打包",
    stage_complete: "完成",
    event_running: "进行中",
    event_completed: "已完成",
    event_cancelled: "已停止",
    cot_section_workflow_summary: "研究流程概述",
    cot_section_reference_milestones: "参考里程碑",
    cot_section_reference_steps: "参考步骤",
    cot_section_step_rationale: "步骤依据",
    cot_section_decision_points: "关键决策点",
    cot_section_quality_checks: "质量检查",
    cot_section_failure_modes: "失败模式",
    cot_section_final_interpretation: "最终解释",
    tag_plant_breeding: "植物育种",
    tag_crop_genomics: "作物基因组学",
    tag_transcriptomics: "转录组学",
    tag_bioinformatics: "生物信息学",
    tag_trait_mapping: "性状解析",
    tag_stress_biology: "逆境生物学",
    tag_gene_regulation: "基因调控",
    tag_phenotyping: "表型组",
    tag_literature_mining: "文献挖掘",
    recent_updates_title: "最近更新",
    recent_updates_disconnected: "此页面需要连接 QA 评测平台。请在设置中填写平台地址、用户名和密码。",
    recent_updates_today_qa: "今日新增 QA",
    recent_updates_week_qa: "本周新增 QA",
    recent_updates_last_refresh: "最近刷新",
    recent_updates_model_changes: "模型更新提醒",
    recent_updates_no_model_changes: "本周暂无模型更新",
    recent_updates_messages: "平台消息",
    recent_updates_no_messages: "暂无平台消息",
    feedback_title: "功能建议",
    feedback_email: "发送邮件至 zhengyi@yzwlab.cn",
    feedback_email_hint: "直接发送邮件描述你的建议或问题。",
    feedback_github: "提交 GitHub Issue",
    feedback_github_hint: "在本项目 GitHub 仓库创建 issue。",
    feedback_form: "提交反馈表单",
    feedback_form_hint: "登录后填写表单，你的反馈会提交到平台。",
    feedback_form_login_required: "表单反馈需先登录 QA 评测平台",
    feedback_title_label: "主题",
    feedback_title_placeholder: "简要描述你的建议",
    feedback_content_label: "详细说明",
    feedback_content_placeholder: "请详细描述...",
    feedback_category_label: "分类",
    feedback_category_bug: "Bug 反馈",
    feedback_category_feature: "功能建议",
    feedback_category_other: "其他",
    feedback_submit: "提交反馈",
    feedback_submitting: "提交中...",
    feedback_success: "感谢你的反馈！",
    platform_account_card_title: "平台账号",
    platform_role: "角色",
    platform_action_change_password: "修改密码",
    platform_action_logout: "退出登录",
    platform_change_password_title: "修改密码",
    platform_current_password: "当前密码",
    platform_new_password: "新密码",
    platform_confirm_password: "确认新密码",
    platform_password_submit: "确认修改",
    platform_password_submitting: "修改中...",
    platform_password_success: "密码修改成功",
    platform_password_mismatch: "两次输入的新密码不一致",
  },
  en: {
    eyebrow: "Distill Studio",
    hero_title: "High-throughput QA Distillation",
    hero_lede: "You create QA. We help turn it into models and community-facing services.",
    app_author_badge: "Built by kentnf",
    lang_label: "Language",
    panel_title: "Pipeline Input",
    panel_copy: "Switch workspaces on the left, edit the current page in the center, inspect results on the right.",
    nav_title: "Workspace",
    nav_copy: "Switch settings pages like a desktop app.",
    actions_setup: "App",
    action_check_update: "Check Update",
    action_install_update: "Install Update",
    action_retry_update: "Retry Update",
    telemetry_title: "Run Telemetry",
    telemetry_copy: "Live stage progress and backend log messages from the Rust pipeline.",
    setup_title: "Current Setup",
    setup_copy: "Key summary of the active configuration.",
    result_title: "Current Result",
    result_copy: "Structured summary cards for the latest topic preview or pipeline run.",
    raw_json: "Raw JSON",
    result_actions: "Result Actions",
    output_mode_idle: "Idle",
    output_mode_preview: "Topic Preview",
    output_mode_run: "Pipeline Result",
    output_mode_validation: "Validation",
    output_mode_error: "Error",
    tab_topic: "QA Generation",
    tab_settings: "Settings",
    tab_browse: "Browse QA",
    tab_qa_evaluate: "QA Evaluate",
    tab_model_trial: "Model Trial",
    tab_recent_updates: "Recent Updates",
    tab_chat_qa: "Chat QA",
    tab_feedback: "Feedback",
    chat_qa_tab_copy: "Chat with the configured LLM model. Supports local models and platform models.",
    chat_qa_model: "Current Model",
    chat_qa_no_model: "Please configure a model and API Key in Settings first",
    chat_qa_empty: "Send a message to start a conversation",
    chat_qa_user: "You",
    chat_qa_assistant: "Assistant",
    chat_qa_send_failed: "Message send failed",
    chat_qa_placeholder: "Type your message...",
    chat_qa_send: "Send",
    chat_qa_new_session: "New Session",
    chat_qa_session_untitled: "New Session",
    chat_qa_upload: "Upload to Platform",
    chat_qa_uploading: "Uploading...",
    chat_qa_upload_success: "Uploaded",
    chat_qa_upload_failed: "Upload failed",
    chat_qa_upload_no_auth: "Please login to platform in Settings first",
    chat_qa_upload_empty: "No messages to upload",
    paper_qa_tab: "Paper QA",
    paper_qa_add: "Add PDF",
    paper_qa_convert: "Convert",
    paper_qa_generate: "Generate QA",
    paper_qa_upload: "Upload to Platform",
    paper_qa_save_batch: "Save as Batch",
    paper_qa_cot_ratio: "CoT Ratio",
    paper_qa_pending: "Pending",
    paper_qa_converting: "Converting...",
    paper_qa_converted: "Converted",
    paper_qa_chunked: "{n} chunks",
    paper_qa_error: "Error",
    paper_qa_empty: "Add PDF files to get started.",
    paper_qa_no_provider: "Configure a provider in Settings first.",
    paper_qa_max_files: "Maximum 20 PDF files.",
    paper_qa_drag_hint: "Drop PDF files here",
    paper_qa_stats: "{total} total · {cot} CoT + {qa} QA",
    paper_qa_uploading: "Saving...",
    paper_qa_save_batch_done: "Saved to Browse QA",
    paper_qa_save_batch_error: "Save batch failed",
    paper_qa_generating: "Generating...",
    paper_qa_generate_error: "Generation failed",
    tab_internal_badge: "Beta",
    tab_topic_copy: "Research topic and domain tags",
    tab_settings_copy: "Model, output, and batch parameters",
    topic_tab_title: "QA Generation",
    topic_tab_copy: "Write the core research theme first, then use tags to add domains, directions, or context.",
    settings_tab_title: "Settings",
    settings_tab_copy: "Model, endpoint, output, and batch settings.",
    settings_basic_copy: "Most users only need a provider, a model, and an API key.",
    cot_structure_section_title: "CoT Structure",
    cot_section_headers: "CoT Section Headers",
    cot_section_headers_hint: "Use one header per line. The runtime will build the CoT answer format from these lines. Empty input falls back to the default 8-section structure.",
    output_root: "Output Directory",
    output_root_hint: "Choose the root folder used for generated runs and history. The app still creates one subfolder per run inside it.",
    settings_checklist_title: "First-Time Setup",
    settings_checklist_copy: "This checks only the minimum needed to get started. Values are saved automatically on this device.",
    settings_checklist_done: "Done",
    settings_checklist_pending: "Pending",
    settings_checklist_provider: "Provider",
    settings_checklist_provider_ready: "Selected: {value}",
    settings_checklist_provider_pending: "Choose a model provider or a compatible adapter first.",
    settings_checklist_model: "Model",
    settings_checklist_model_ready: "Selected: {value}",
    settings_checklist_model_pending: "Choose a model, or enter a custom model name.",
    settings_checklist_connection: "Endpoint and Auth",
    settings_checklist_connection_ready: "Base URL and API key are ready. The settings are saved locally automatically.",
    settings_checklist_connection_not_required: "This adapter does not require a Base URL or API key.",
    settings_checklist_connection_pending: "Still needed: {value}",
    settings_checklist_ready: "Ready to Use",
    settings_checklist_ready_done: "The basic setup is ready. You can return to QA Generation and run a task now.",
    settings_checklist_ready_pending: "The app is not ready to run yet. Please complete: {value}",
    settings_checklist_missing_provider: "provider",
    settings_checklist_missing_model: "model",
    settings_checklist_missing_base_url: "Base URL",
    settings_checklist_missing_api_key: "API key",
    run_readiness_missing_prompt: "topic",
    browse_tab_title: "Browse QA",
    qa_evaluate_tab_title: "QA Evaluate",
    qa_evaluate_tab_copy: "Check platform reachability, verify sign-in, and open the QA evaluation workspace.",
    model_trial_tab_title: "Model Trial",
    model_trial_tab_copy: "Use the dedicated qaevaluate trial API directly inside the desktop app.",
    model_section_title: "Model Configuration",
    integration_section_title: "Platform Integrations",
    literature_section_title: "Literature API",
    runtime_section_title: "Runtime Parameters",
    advanced_settings_summary: "Advanced Settings",
    advanced_settings_copy: "These fields are mainly for integrations and runtime tuning. Most users can keep the defaults.",
    run_status_title: "Run Status",
    run_logs_title: "Run Logs",
    run_stats_title: "Run Stats",
    action_export_logs: "Export Logs",
    action_open_run_output_dir: "Open Output Folder",
    continue_run: "Continue",
    field_help_button: "Show details",
    runtime_constraint_hint_normal: "Linked constraints: shard size cannot exceed target count, and batch size cannot exceed shard size.",
    runtime_constraint_hint_cot: "CoT safety constraints: target count is capped at 100, batch size is fixed at 1, max in flight is fixed at 2, and shard size cannot exceed 10 or the target count.",
    run_locked_hint: "Run parameters are locked while the pipeline is active. Stop the run before changing them.",
    browse_batches_title: "Run History",
    browse_batches_empty: "No historical runs yet.",
    browse_questions_title: "QA Question List",
    browse_questions_empty: "Select a batch first.",
    browse_review_title: "Fast Review",
    browse_review_empty: "No QA items are available for review in this batch.",
    browse_detail_title: "QA Detail",
    browse_detail_empty: "Select a QA item.",
    browse_questions_loading: "Loading QA questions...",
    browse_review_loading: "Loading fast review items...",
    browse_detail_loading: "Loading QA detail...",
    browse_back_batches: "Back to Batches",
    browse_back_questions: "Back to Questions",
    browse_prev: "Previous",
    browse_next: "Next",
    browse_total_items: "Total",
    browse_kept_items: "Kept",
    browse_generated_items: "Generated",
    browse_target_items: "Target",
    browse_updated_at: "Updated",
    browse_task_status: "Status",
    browse_request_count: "Requests",
    browse_shard_progress: "Shard Progress",
    browse_history_count: "Runs",
    browse_review_progress: "Reviewed",
    browse_review_kept: "Locally Kept",
    browse_review_discarded: "Locally Discarded",
    browse_review_status: "Review Status",
    browse_review_status_unreviewed: "Unreviewed",
    browse_review_status_kept: "Kept",
    browse_review_status_discarded: "Discarded",
    browse_review_question_edited: "Question Edited",
    browse_question_original: "Original Question",
    browse_status_completed: "Completed",
    browse_status_running: "Running",
    browse_status_generated: "Awaiting Pack",
    browse_status_prepared: "Prepared",
    browse_subtopic: "Subtopic",
    browse_axis: "Axis",
    browse_question_type: "Question Type",
    browse_difficulty: "Difficulty",
    browse_audience: "Audience",
    browse_provider: "Provider",
    browse_model: "Model",
    browse_batch_name: "Batch",
    browse_output_dir: "Output Directory",
    browse_prompt: "Topic Prompt",
    browse_action_open: "Browse",
    browse_action_continue: "Continue",
    browse_action_continue_run: "Resume Run",
    browse_action_load_generate: "Load to Generate",
    browse_action_delete: "Delete",
    browse_action_review: "Fast Review",
    browse_action_upload: "Upload",
    browse_action_uploading: "Uploading...",
    browse_review_save: "Save Question",
    browse_review_saving: "Saving...",
    browse_review_save_failed: "Failed to save fast review",
    browse_review_keep: "Keep",
    browse_review_discard: "Discard",
    browse_review_prev_question: "Previous Question",
    browse_review_next_question: "Next Question",
    browse_uploaded_badge: "Uploaded",
    browse_platform_status_uploaded: "Uploaded",
    browse_platform_status_processing: "Processing",
    browse_platform_status_parsed: "Imported",
    browse_platform_status_failed: "Failed",
    browse_platform_status_sync_failed: "Failed to sync platform batch status",
    browse_platform_url_missing: "Set the QA platform URL in Settings first.",
    browse_platform_credentials_missing: "Set the QA platform username and password in Settings first.",
    browse_upload_url: "QA Upload URL",
    browse_upload_url_hint: "Set the QA evaluation platform URL to enable batch upload.",
    browse_upload_url_missing: "Set the QA upload URL in Settings first.",
    browse_delete_confirm: "Delete this batch and all of its QA items?",
    browse_delete_success: "Batch deleted.",
    browse_upload_success: "QA batch uploaded.",
    browse_upload_exists: "This QA batch has already been uploaded. No need to upload it again.",
    browse_upload_failed: "Upload failed",
    browse_upload_no_kept_items: "This batch has no locally kept QA items to upload.",
    qa_platform_url: "QA Platform URL",
    qa_platform_url_hint: "Internal laboratory use. Ordinary users only need this one address, and the app derives the web/API bases automatically.",
    qa_platform_dev: "127.0.0.1 (Dev)",
    qa_platform_prod: "182.92.166.143 (Prod)",
    qa_platform_env_label: "QA Platform",
    qa_platform_username: "QA Platform Username",
    qa_platform_password: "QA Platform Password",
    platform_internal_hint: "Internal laboratory use. Production usually points to 182.92.166.143, while local joint debugging can use 127.0.0.1.",
    platform_trial_hint: "Embedded trial needs the platform URL, username, and password to be configured first.",
    platform_trial_entry: "Trial Mode",
    platform_trial_entry_hint: "This panel calls qaevaluate trial APIs directly and embeds the session list plus chat UI.",
    platform_health_idle: "Platform reachability has not been checked yet.",
    platform_login_idle: "Platform sign-in has not been checked yet.",
    platform_health_checking: "Checking platform reachability...",
    platform_login_checking: "Checking platform sign-in...",
    platform_web_base: "Platform Web Base",
    platform_api_base: "Platform API Base",
    platform_current_user: "Current Platform User",
    platform_application: "Assigned Application",
    platform_no_application: "This account has no assigned application yet",
    platform_action_check: "Check Reachability",
    platform_action_login: "Check Sign-in",
    platform_action_open_qa: "Open QA Workspace",
    platform_action_open_trial: "Open Platform Trial",
    platform_action_refresh_trial: "Refresh Trial Data",
    platform_action_create_trial: "New Session",
    platform_action_send_trial: "Send",
    platform_health_ok: "QA platform reachable:",
    platform_health_failed: "QA platform reachability failed",
    platform_login_ok: "QA platform sign-in succeeded:",
    platform_login_failed: "QA platform sign-in failed",
    platform_opened_qa_page: "Opened the QA evaluation page in your browser. If the browser is not logged in, it may show the login page first.",
    platform_opened_trial_page: "Opened the model trial page in your browser. If the browser is not logged in, it may show the login page first.",
    platform_open_failed: "Failed to open platform page",
    model_trial_settings_required: "Fill the QA platform URL, username, and password in Settings first.",
    model_trial_loading: "Loading model-trial workspace...",
    model_trial_empty_sessions: "No trial sessions yet. Select a model and start a conversation.",
    model_trial_empty_detail: "Select a session or create a new one to begin.",
    model_trial_select_model: "Trial Model",
    model_trial_select_batch: "Reference Batch",
    model_trial_select_question: "Reference Question",
    model_trial_select_batch_empty: "Select a local generated batch first",
    model_trial_select_question_empty: "Select a batch, then pick a question from it",
    model_trial_session_list: "Sessions",
    model_trial_conversation: "Conversation",
    model_trial_source_card: "Reference QA",
    model_trial_user_badge: "User",
    model_trial_model_badge: "Model",
    model_trial_input_placeholder: "Ask a question, send an instruction, or continue from the reference QA.",
    model_trial_error_load: "Failed to load model-trial data",
    model_trial_error_detail: "Failed to load session detail",
    model_trial_error_send: "Failed to send trial message",
    model_trial_error_create: "Failed to create trial session",
    model_trial_error_delete: "Failed to delete trial session",
    model_trial_notice_created: "Trial session created.",
    model_trial_notice_deleted: "Trial session deleted.",
    model_trial_notice_refreshed: "Model-trial workspace refreshed.",
    model_trial_delete: "Delete",
    model_trial_delete_busy: "Deleting...",
    model_trial_source_application: "Application",
    model_trial_source_type: "QA Type",
    model_trial_source_status: "Task Status",
    model_trial_source_none: "This session has no bound reference QA.",
    model_trial_source_local: "Local Batch Question",
    model_trial_message_user: "You",
    model_trial_message_assistant: "Assistant",
    model_trial_message_empty: "No messages yet. Send one to start testing.",
    model_trial_need_message: "Enter a message first.",
    model_trial_need_model: "Select an enabled trial model first.",
    model_trial_retry_open: "You can also open the platform trial page in the browser for debugging.",
    browse_question: "Question",
    browse_answer: "Answer",
    browse_qa_mode: "QA Mode",
    browse_source_type: "Source Type",
    browse_grounding: "Grounding",
    provider_preset: "Model Provider",
    provider_preset_hint: "Selecting a provider fills the adapter type, model list, and base URL. Switch to Custom if you need a private gateway or manual values.",
    config_profile: "Config Profile",
    config_profile_hint: "Load and save both target this local profile name. Use it to keep multiple run setups.",
    topic_tags: "Domains and Directions",
    topic_tags_hint: "Use the agriculture and breeding quick tags, or open the selector to add level-2 or level-3 research fields. Selected tags are appended to the effective prompt.",
    qa_mode: "QA Mode",
    qa_mode_hint: "Normal QA generates standard question-answer pairs. CoT QA generates compact research-planning and decision-oriented answers.",
    qa_mode_normal: "Normal QA",
    qa_mode_cot: "CoT QA",
    selected_tags: "Selected Tags",
    quick_tags: "Agriculture and Breeding Quick Tags",
    topic_field_selector: "Choose Research Field",
    topic_field_selector_hint: "Pick level-2 or level-3 fields similar to grant applications or reviewer forms.",
    topic_field_modal_title: "Choose Research Field",
    topic_field_modal_copy: "Start with a primary domain, then select level-2 or level-3 directions on the right. You can add multiple tags at once.",
    topic_field_primary_title: "Primary Domain",
    topic_field_detail_title: "Level-2 / Level-3 Directions",
    topic_field_pending_title: "Pending Tags",
    topic_field_add_selected: "Add Selected Tags",
    topic_field_cancel: "Cancel",
    topic_field_close: "Close",
    topic_field_empty: "No selectable directions in this primary domain.",
    topic_field_selected_count: "{count} selected",
    no_tags: "No tags added yet.",
    custom_tag: "Custom Tag",
    custom_tag_placeholder: "For example: crop breeding, metabolic regulation, disease resistance",
    add_tag: "Custom Tag",
    preset_custom: "Custom",
    preset_qwen_dashscope: "Qwen / DashScope",
    preset_deepseek: "DeepSeek",
    preset_moonshot_kimi: "Kimi / Moonshot",
    preset_zhipu_glm: "Zhipu GLM",
    preset_minimax: "MiniMax",
    preset_tencent_hunyuan: "Tencent Hunyuan",
    preset_baidu_qianfan: "Baidu Qianfan",
    preset_stub_local: "Stub Local Test",
    preset_platform: "Platform Model",
    custom_model: "Custom Model",
    model_custom_option: "Custom model...",
    topic_prompt: "Topic Prompt",
    literature_api_url: "Literature API URL",
    literature_api_auth: "Literature API Auth Token",
    literature_api_auth_hint: "Authentication token for the literature API, stored in local settings.",
    browse: "Browse",
    provider: "Adapter Type",
    model: "Model",
    base_url: "Base URL",
    api_key: "API Key",
    api_key_hint: "The key is stored in the local config profile and hidden by default in the UI.",
    qa_upload_url_hint: "The key is stored in the local config profile and hidden by default in the UI.",
    show_secret: "Show",
    hide_secret: "Hide",
    target_count: "Target Count",
    plan_limit: "Plan Limit",
    shard_size: "Shard Size",
    batch_size: "Batch Size",
    max_in_flight: "Max In Flight",
    max_retries: "Max Retries",
    timeout_secs: "Timeout Secs",
    resume_existing: "Resume Existing Shards",
    preview: "Preview Topic",
    load_config: "Load Config",
    save_config: "Save Config",
    run_pipeline: "Run",
    stop_run: "Stop",
    stop_requested: "Stopping...",
    managed_run_mode: "Run Mode",
    managed_run_mode_new: "New Run",
    managed_run_mode_resume_latest: "Continue Current Run",
    managed_run_mode_hint: "New Run creates a fresh output directory. Continue Current Run reuses the most recent matching task directory with the same topic, QA mode, and model configuration, then resumes from existing shards.",
    managed_run_mode_exact_hint: "Currently continuing this saved task: {value}",
    managed_run_mode_clear: "Cancel and Start New Run",
    managed_run_mode_pick_label: "Pick History Run",
    managed_run_mode_pick_placeholder: "Choose a historical run to continue",
    managed_run_mode_pick_empty: "No resumable historical runs yet",
    managed_run_mode_pick_hint: "Use this when you want to continue one exact historical run instead of only the latest match.",
    log_resuming_latest_task: "Switched to continue-current-run mode. The app will try to reuse the latest matching task.",
    log_loaded_batch_task: "Loaded a historical task. Running will continue this exact batch.",
    log_cleared_batch_task: "Cleared the specific historical resume target. Future runs will create a new task.",
    no_preview: "No preview yet.",
    no_run: "No run yet.",
    waiting_events: "Waiting for pipeline events...",
    status_idle: "Idle",
    status_previewing: "Previewing",
    status_running: "Running",
    status_stopping: "Stopping",
    status_updating: "Updating",
    preview_generating: "Generating preview...",
    running_pipeline: "Running pipeline...",
    stats_elapsed: "Elapsed",
    stats_avg_speed: "Average Speed",
    stats_current_speed: "Current Speed",
    stats_eta: "ETA",
    stats_generated_progress: "Generated",
    stats_request_progress: "Requests",
    stats_shard_progress: "Shards",
    stats_retry_count: "Retries",
    stats_failed_requests: "Failed Requests",
    stats_success_rate: "Request Success Rate",
    stats_idle: "Waiting to run",
    stats_not_available: "N/A",
    output_mode_cancelled: "Stopped",
    validation_failed: "Run validation failed",
    preview_failed: "Preview failed",
    pipeline_failed: "Pipeline failed",
    pipeline_cancelled: "Pipeline stopped",
    log_request_submitted: "Pipeline request submitted from GUI.",
    log_stop_requested: "Stop requested. Waiting for the current request to settle.",
    log_stop_not_running: "No pipeline is currently running.",
    log_stop_failed: "Failed to stop pipeline",
    log_pipeline_cancelled: "Pipeline stopped on request.",
    log_no_local_config: "No local config file found yet.",
    log_loaded_startup: "Loaded local config on startup.",
    log_loaded_manual: "Loaded local config.",
    log_load_failed: "Failed to load local config",
    log_profile_list_failed: "Failed to read local config profile list",
    log_no_local_config_profile: "No local config profile found",
    log_loaded_startup_profile: "Loaded config profile on startup",
    log_loaded_manual_profile: "Loaded config profile",
    log_selected_output: "Selected output directory",
    log_browse_failed: "Failed to browse output directory",
    log_saved_config: "Saved local config to",
    log_saved_profile: "Saved config profile",
    log_save_failed: "Failed to save local config",
    log_stub_migrated: "Legacy Stub config detected. Switched to Qwen / DashScope. Add a real API key before testing.",
    log_cot_runtime_normalized: "Legacy CoT runtime settings detected. Switched to a conservative low-concurrency safe mode.",
    log_pipeline_completed: "Pipeline completed. Dataset at",
    log_exported_logs: "Exported run logs to",
    log_export_failed: "Failed to export run logs",
    log_export_empty: "There are no run logs to export yet.",
    log_opened_path: "Opened path",
    log_open_failed: "Failed to open path",
    log_copied_value: "Copied to clipboard",
    log_copy_failed: "Failed to copy value",
    log_applied_preset: "Applied preset",
    log_validation_failed: "Run validation failed",
    log_update_not_configured: "Auto update is not configured yet. Add a local updater.json first.",
    log_update_source: "Updater config file",
    log_update_available: "Update available",
    log_update_not_available: "Already on the latest version",
    log_update_declined: "Update install was cancelled.",
    log_update_installing: "Installing update",
    log_update_timeout: "Update check timed out: the update service was still unreachable after one automatic retry.",
    log_update_failed: "Auto update failed",
    log_update_manual_download: "Open release page for manual download",
    log_update_manual_prompt: "Auto update failed. Open the GitHub release page for manual download?",
    summary_topic_name: "Topic Name",
    summary_goal: "Goal",
    summary_target_count: "Target Count",
    summary_keyword_count: "Keyword Count",
    summary_keywords: "Keywords",
    summary_subtopic_count: "Subtopic Count",
    summary_axis_count: "Question Axes",
    summary_provider: "Provider",
    summary_model: "Model",
    summary_generated_count: "Generated",
    summary_kept_count: "Kept",
    summary_shards: "Shards",
    summary_request_count: "Requests",
    summary_dataset_path: "Dataset Path",
    summary_output_dir: "Output Directory",
    summary_profile: "Profile",
    summary_prompt: "Topic Summary",
    summary_topic_tags: "Tags",
    summary_preset: "Preset",
    action_open_output_dir: "Open Output Directory",
    action_select_output_dir: "Choose Folder",
    action_restore_default: "Restore Default",
    action_open_dataset: "Open Dataset",
    action_open_pack_summary: "Open Pack Summary",
    action_copy_output_dir: "Copy Output Directory",
    action_copy_dataset_path: "Copy Dataset Path",
    skipped: "skipped",
    empty_value: "N/A",
    validation_issues: "Fix these issues before running",
    validation_issue_prompt_required: "Topic prompt is required.",
    validation_issue_model_required: "Model name is required.",
    validation_issue_base_url_required: "Base URL is required for openai-compatible provider.",
    validation_issue_api_key_required: "API key is required for openai-compatible provider.",
    validation_issue_target_count_invalid: "Target count must be an integer greater than 0.",
    validation_issue_plan_limit_invalid: "Plan limit must be an integer greater than 0.",
    validation_issue_shard_size_invalid: "Shard size must be an integer greater than 0.",
    validation_issue_batch_size_invalid: "Batch size must be an integer greater than 0.",
    validation_issue_max_in_flight_invalid: "Max in flight must be an integer greater than 0.",
    validation_issue_max_retries_invalid: "Max retries must be an integer greater than or equal to 0.",
    validation_issue_timeout_invalid: "Timeout secs must be an integer greater than 0.",
    stage_bootstrap: "Bootstrap",
    stage_plan: "Plan",
    stage_literature: "Literature",
    stage_write_config: "Write Config",
    stage_generate: "Generate",
    stage_pack: "Pack",
    stage_complete: "Complete",
    event_running: "running",
    event_completed: "completed",
    event_cancelled: "cancelled",
    cot_section_workflow_summary: "Workflow Summary",
    cot_section_reference_milestones: "Reference Milestones",
    cot_section_reference_steps: "Reference Steps",
    cot_section_step_rationale: "Step Rationale",
    cot_section_decision_points: "Decision Points",
    cot_section_quality_checks: "Quality Checks",
    cot_section_failure_modes: "Failure Modes",
    cot_section_final_interpretation: "Final Interpretation",
    tag_plant_breeding: "Plant Breeding",
    tag_crop_genomics: "Crop Genomics",
    tag_transcriptomics: "Transcriptomics",
    tag_bioinformatics: "Bioinformatics",
    tag_trait_mapping: "Trait Mapping",
    tag_stress_biology: "Stress Biology",
    tag_gene_regulation: "Gene Regulation",
    tag_phenotyping: "Phenotyping",
    tag_literature_mining: "Literature Mining",
    recent_updates_title: "Recent Updates",
    recent_updates_disconnected: "This page needs the QA evaluation platform. Fill in the platform URL, username, and password in Settings.",
    recent_updates_today_qa: "Today's New QA",
    recent_updates_week_qa: "This Week's New QA",
    recent_updates_last_refresh: "Last Refreshed",
    recent_updates_model_changes: "Model Updates",
    recent_updates_no_model_changes: "No model updates this week",
    recent_updates_messages: "Platform Messages",
    recent_updates_no_messages: "No messages",
    feedback_title: "Feedback",
    feedback_email: "Send email to zhengyi@yzwlab.cn",
    feedback_email_hint: "Describe your suggestion or issue via email.",
    feedback_github: "Submit GitHub Issue",
    feedback_github_hint: "Create an issue on the GitHub repository.",
    feedback_form: "Submit Feedback Form",
    feedback_form_hint: "Log in to fill in the feedback form and submit to the platform.",
    feedback_form_login_required: "Feedback form requires QA platform login",
    feedback_title_label: "Title",
    feedback_title_placeholder: "Briefly describe your suggestion",
    feedback_content_label: "Description",
    feedback_content_placeholder: "Describe in detail...",
    feedback_category_label: "Category",
    feedback_category_bug: "Bug Report",
    feedback_category_feature: "Feature Request",
    feedback_category_other: "Other",
    feedback_submit: "Submit",
    feedback_submitting: "Submitting...",
    feedback_success: "Thank you for your feedback!",
    tab_feedback2: "Feedback",
    platform_account_card_title: "Platform Account",
    platform_role: "Role",
    platform_action_change_password: "Change Password",
    platform_action_logout: "Log Out",
    platform_change_password_title: "Change Password",
    platform_current_password: "Current Password",
    platform_new_password: "New Password",
    platform_confirm_password: "Confirm New Password",
    platform_password_submit: "Confirm",
    platform_password_submitting: "Changing...",
    platform_password_success: "Password changed successfully",
    platform_password_mismatch: "New passwords do not match",
  }
};

const storedLang = window.localStorage.getItem(LANG_STORAGE_KEY);
let currentLang: Lang =
  storedLang === "zh" || storedLang === "en"
    ? storedLang
    : navigator.language.toLowerCase().startsWith("zh")
      ? "zh"
      : "en";
let currentTab: UiTab = "topic";
let currentStatus: "idle" | "previewing" | "running" | "stopping" | "updating" = "idle";
let outputState: OutputState = { kind: "idle" };
let topicTags: string[] = [];
let topicFieldModalPrimaryId = RESEARCH_FIELD_TAXONOMY[0]?.id ?? null;
let pendingTopicFieldTags: string[] = [];
let apiKeyVisible = false;
let autoSaveTimer: number | null = null;
let autoSaveEnabled = false;
let lastPipelineProgressEvent: PipelineProgressEvent | null = null;
let browseBatches: QaBatchSummary[] = [];
let browsePageData: QaRecordPage | null = null;
let browseDetailData: QaRecordDetail | null = null;
let browseSelectedBatchId: string | null = null;
let browseLoading = false;
let browseView: BrowseView = "batches";
let browseQuestionsLoading = false;
let browseDetailLoading = false;
let browseReviewLoading = false;
let browseReviewSaving = false;
let browseErrorMessage: string | null = null;
let browseUploadingBatchId: string | null = null;
let browsePlatformStatusLoading = false;
let browsePlatformStatusRequestId = 0;
let browsePlatformStatusMap = new Map<string, PlatformImportBatchStatus>();
let browseRemoteVirtualBatch: QaBatchSummary | null = null;
let browseRemoteVirtualBatchDetail: PlatformImportBatchDetail | null = null;
let browseReviewItems: QaRecordSummary[] = [];
let browseReviewIndex = 0;
let browseReviewDrafts = new Map<string, string>();
let managedResumeBatchId: string | null = null;
let managedResumeBatchLabel: string | null = null;
let appVersion = __APP_VERSION__;
let pendingAppUpdate: AppUpdateCheckResponse | null = null;
let appUpdateLastError: string | null = null;
let appUpdateManualDownloadUrl: string | null = DEFAULT_MANUAL_UPDATE_URL;
let platformHealthState:
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "success"; response: PlatformHealthResponse }
  | { kind: "error"; message: string } = { kind: "idle" };
let platformLoginState:
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "success"; response: PlatformLoginResponse }
  | { kind: "error"; message: string } = { kind: "idle" };
let modelTrialWorkspaceLoading = false;
let modelTrialDetailLoading = false;
let modelTrialCreating = false;
let modelTrialSending = false;
let modelTrialDeletingSessionId: number | null = null;
let modelTrialConfigs: TrialLlmConfigOption[] = [];
let modelTrialSessions: TrialSessionSummary[] = [];
let modelTrialDetail: TrialSessionDetail | null = null;
let modelTrialSelectedConfigId: number | null = null;
let modelTrialSelectedSessionId: number | null = null;
let modelTrialComposer = "";
let modelTrialErrorMessage: string | null = null;
let modelTrialNoticeMessage: string | null = null;
let modelTrialLocalBatches: QaBatchSummary[] = [];
let modelTrialSelectedBatchId: string | null = null;
let modelTrialLocalQuestions: QaRecordSummary[] = [];
let modelTrialSelectedQuestionId: string | null = null;
let modelTrialLocalQuestionDetail: QaRecordDetail | null = null;
let modelTrialLocalQuestionsLoading = false;
let runStatsTimer: number | null = null;

// ---- v0.1.8: Recent updates & feedback state ----

type PlatformNews = {
  id: number;
  title: string;
  content: string;
  isPublished: boolean;
  createdAt: string;
  createdByName: string | null;
};

type DashboardOverview = {
  todayQas: number;
  weekQas: number;
  todayReviews?: number;
  weekReviews?: number;
  availableModels?: number;
};

type ChangePasswordResponse = {
  success: boolean;
};

type ModelChangelogEntry = {
  id: number;
  modelName: string;
  changeType: string;
  description: string;
  createdAt: string;
};

type PlatformGenerateModel = {
  id: number;
  name: string;
  provider: string;
  baseUrl: string;
  model: string;
  temperature: number;
  maxTokens: number;
  batchSize: number;
  maxInFlight: number;
};

type FeedbackResponse = {
  id: number;
  createdAt: string;
};

type ExportsStatsDaily = {
  period: string;
  importCount: number;
  reviewCount?: number;
};

type ExportsStatsWeekly = {
  period: string;
  periodStart: string;
  periodEnd: string;
  importCount: number;
  reviewCount?: number;
};

type ExportsStatsData = {
  daily: ExportsStatsDaily[];
  weekly: ExportsStatsWeekly[];
};

let platformNewsState:
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "success"; items: PlatformNews[] }
  | { kind: "error"; message: string } = { kind: "idle" };

let dashboardOverviewState:
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "success"; data: DashboardOverview }
  | { kind: "error"; message: string } = { kind: "idle" };

let modelChangelogState:
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "success"; items: ModelChangelogEntry[] }
  | { kind: "error"; message: string } = { kind: "idle" };

let exportsStatsState:
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "success"; data: ExportsStatsData }
  | { kind: "error"; message: string } = { kind: "idle" };

let platformGenerateModels: PlatformGenerateModel[] = [];
let selectedPlatformModelId: number | null = null;

// Paper QA state
type PaperFileStatus = "pending" | "converting" | "converted" | "chunked" | "error";
type PaperChunk = {
  id: string;
  text: string;
  sectionType: string;
  charCount: number;
};
type PaperQaItem = {
  id: string;
  qaType: string;
  instruction: string;
  reasoning?: string | null;
  output: string;
  paperTitle: string;
  chunkId: string;
  sectionType: string;
};
type PaperQaStats = {
  total: number;
  cotCount: number;
  qaCount: number;
  cotRatio: number;
  qaRatio: number;
};
type PaperQaGenerateResponse = {
  items: PaperQaItem[];
  stats: PaperQaStats;
  warnings?: string[];
};
type PaperFile = {
  id: string;
  name: string;
  path: string;
  status: PaperFileStatus;
  mdText: string | null;
  chunks: PaperChunk[] | null;
  error: string | null;
};
let paperFiles: PaperFile[] = [];
let paperQaResult: PaperQaGenerateResponse | null = null;
let paperQaCotRatio = 0.4;
let paperQaConverting = false;
let paperQaGenerating = false;
let paperQaUploading = false;
let paperQaErrorMessage: string | null = null;
let paperQaUploadMessage: string | null = null;
let paperQaSelectedFileId: string | null = null;
let paperQaProgressMessage = "";
let paperQaProgressPercent = 0;
let paperQaLogLines: string[] = [];

let feedback2FormState:
  | { kind: "idle" }
  | { kind: "submitting" }
  | { kind: "success" }
  | { kind: "error"; message: string } = { kind: "idle" };

let passwordChangeState:
  | { kind: "idle" }
  | { kind: "submitting" }
  | { kind: "success" }
  | { kind: "error"; message: string } = { kind: "idle" };

type ChatSession = {
  id: string;
  name: string;
  messages: { role: "user" | "assistant"; content: string }[];
  createdAt: number;
};

let chatSessions: ChatSession[] = [];
let currentChatSessionId: string | null = null;
let sessionCounter = 0;
let chatSending = false;
let chatError: string | null = null;

type ChatUploadResponse = {
  batch_id: number | null;
  external_batch_id: string;
  existing_batch: boolean | null;
  import_status: string | null;
  parse_queued: boolean | null;
};

let sessionUploadStates: Record<string,
  | { kind: "idle" }
  | { kind: "uploading" }
  | { kind: "success"; batchId: number }
  | { kind: "error"; message: string }
> = {};

let recentUpdatesLastRefreshTime: number | null = null;
let recentUpdatesRefreshTimer: number | null = null;
let runStats: RunStatsSnapshot = {
  startedAtMs: null,
  lastUpdatedAtMs: null,
  generatedCount: 0,
  targetCount: null,
  shardIndex: null,
  shardCount: null,
  completedBatchCount: 0,
  estimatedBatchCount: null,
  completedShardCount: 0,
  skippedShardCount: 0,
  retryCount: 0,
  failedBatchCount: 0,
  samples: []
};

const app = document.querySelector<HTMLDivElement>("#app");

if (!app) {
  throw new Error("App root not found");
}

app.innerHTML = `
  <main class="app-shell">
    <header class="topbar">
      <div class="topbar-copy">
        <p class="eyebrow" id="eyebrow">Distill Studio</p>
        <h1 id="hero-title">High-throughput QA distillation</h1>
        <p class="lede" id="hero-lede">
          Input one topic statement, pick a provider, and let the Rust pipeline
          expand that into planning and QA generation tasks.
        </p>
      </div>
      <div class="topbar-meta">
        <div class="version-badge" id="app-version-badge">v0.1.6</div>
        <button class="topbar-check-update" type="button" id="check-update">Check Update</button>
        <div class="status-badge" id="status">Idle</div>
        <div class="platform-status-badge" id="platform-status-badge" title="QA Platform"></div>
        <label class="workspace-switch">
          <span id="workspace-switch-label">Workspace</span>
          <select id="topbar-tab-select">
            <option value="recent-updates" id="topbar-tab-option-recent-updates">Recent Updates</option>
            <option value="chat-qa" id="topbar-tab-option-chat-qa">Chat QA</option>
            <option value="topic" id="topbar-tab-option-topic">QA Generation</option>
            <option value="browse" id="topbar-tab-option-browse">Browse QA</option>
            <option value="qa-evaluate" id="topbar-tab-option-qa-evaluate">QA Evaluate</option>
            <option value="model-trial" id="topbar-tab-option-model-trial">Model Trial</option>
            <option value="settings" id="topbar-tab-option-settings">Settings</option>
            <option value="feedback2" id="topbar-tab-option-feedback2">Feedback 2</option>
          </select>
        </label>
        <label class="lang-switch">
          <span id="lang-label">Language</span>
          <select id="lang-select">
            <option value="zh">中文</option>
            <option value="en">English</option>
          </select>
        </label>
      </div>
    </header>
    <section class="workspace">
      <aside class="sidebar panel">
        <div class="tabs" id="tabs">
          <button class="tab-button" type="button" data-tab="recent-updates" id="tab-recent-updates">
            <span class="tab-button-title" id="tab-recent-updates-label">Recent Updates</span>
          </button>
          <button class="tab-button tab-button-plain" type="button" data-tab="paper-qa" id="tab-paper-qa">
            <span class="tab-button-title" id="tab-paper-qa-label">Paper QA</span>
          </button>
          <button class="tab-button" type="button" data-tab="chat-qa" id="tab-chat-qa">
            <span class="tab-button-title" id="tab-chat-qa-label">Chat QA</span>
          </button>
          <button class="tab-button" type="button" data-tab="topic" id="tab-topic">
            <span class="tab-button-title" id="tab-topic-label">Topic</span>
          </button>
          <button class="tab-button" type="button" data-tab="browse" id="tab-browse">
            <span class="tab-button-title" id="tab-browse-label">Browse QA</span>
          </button>
          <button class="tab-button" type="button" data-tab="qa-evaluate" id="tab-qa-evaluate">
            <span class="tab-button-title" id="tab-qa-evaluate-label">QA Evaluate</span>

          </button>
          <button class="tab-button" type="button" data-tab="model-trial" id="tab-model-trial">
            <span class="tab-button-title" id="tab-model-trial-label">Model Trial</span>

          </button>
          <button class="tab-button" type="button" data-tab="settings" id="tab-settings">
            <span class="tab-button-title" id="tab-settings-label">Settings</span>
          </button>
          <button class="tab-button tab-button-plain" type="button" data-tab="feedback2" id="tab-feedback2">
            <span class="tab-button-title" id="tab-feedback2-label">Feedback 2</span>
          </button>
        </div>
      </aside>
      <section class="stage panel">
        <div class="run-lock-banner" id="run-lock-banner" hidden>Run parameters are locked while the pipeline is active. Stop the run before changing them.</div>
        <section class="tab-panel" data-tab-panel="chat-qa" hidden>
          <div class="tab-copy-block">
            <p class="panel-title" id="chat-qa-tab-title">Chat QA</p>
            <p class="panel-copy" id="chat-qa-tab-copy">Send messages to the configured LLM model and get responses.</p>
          </div>
          <section class="chat-qa-panel" id="chat-qa-panel">
            <div class="chat-qa-sessions-bar" id="chat-qa-sessions-bar"></div>
            <div class="chat-qa-model-info" id="chat-qa-model-info"></div>
            <div class="chat-qa-messages" id="chat-qa-messages">
              <div class="chat-qa-empty" id="chat-qa-empty">Send a message to start a conversation.</div>
            </div>
            <div class="chat-qa-input-area">
              <textarea id="chat-qa-input" rows="2" placeholder="Type your message..."></textarea>
              <button class="chat-qa-send-button" type="button" id="chat-qa-send">Send</button>
            </div>
            <div class="chat-qa-error" id="chat-qa-error" hidden></div>
          </section>
        </section>
        <section class="tab-panel" data-tab-panel="topic">
        <div class="tab-copy-block">
          <p class="panel-title" id="topic-tab-title">Research Topic</p>
        </div>
        <label for="prompt" id="topic-prompt-label">Topic prompt</label>
        <textarea id="prompt" rows="7">大豆籽粒油分与蛋白协同改良、种植密度响应、育种策略优化</textarea>
        <div class="mode-panel">
          <div>
            <p class="tag-title" id="qa-mode-label">QA Mode</p>
            <p class="panel-copy" id="qa-mode-hint">
              Normal QA generates standard question-answer pairs. CoT QA generates compact research-planning and decision-oriented answers.
            </p>
          </div>
          <div class="radio-group" id="qa-mode-group">
            <label class="radio-card">
              <input id="qa-mode-normal" type="radio" name="qa-mode" value="normal" checked />
              <span id="qa-mode-normal-label">Normal QA</span>
            </label>
            <label class="radio-card">
              <input id="qa-mode-cot" type="radio" name="qa-mode" value="cot" />
              <span id="qa-mode-cot-label">CoT QA</span>
            </label>
          </div>
        </div>
        <div class="tag-panel">
          <div class="tag-panel-header">
            <div>
              <p class="tag-title" id="topic-tags-label">Domains and Directions</p>
              <p class="panel-copy" id="topic-tags-hint">Select multiple tags or add your own. Selected tags are appended to the effective prompt sent to the model.</p>
            </div>
          </div>
          <div class="selected-tags-block">
            <p class="tag-subtitle" id="selected-tags-label">Selected Tags</p>
            <div class="tag-list selected" id="selected-topic-tags"></div>
          </div>
          <div class="quick-tag-block">
            <div class="tag-subtitle-row">
              <p class="tag-subtitle" id="quick-tags-label">Agriculture and Breeding Quick Tags</p>
              <button id="open-topic-field-selector" type="button">Choose Research Field</button>
            </div>
            <p class="field-hint" id="topic-field-selector-hint">
              Pick level-2 or level-3 fields similar to grant applications or reviewer forms.
            </p>
            <div class="tag-list suggestions" id="topic-tag-suggestions"></div>
          </div>
          <div class="inline-field">
            <input id="topic-tag-input" placeholder="For example: crop breeding, metabolic regulation, disease resistance" />
            <button id="add-topic-tag" type="button">Custom Tag</button>
          </div>
        </div>
        <div class="modal-shell" id="topic-field-modal" hidden>
          <div class="modal-backdrop" data-modal-close="true"></div>
          <div class="modal-panel" role="dialog" aria-modal="true" aria-labelledby="topic-field-modal-title">
            <div class="modal-header">
              <div>
                <p class="panel-title" id="topic-field-modal-title">Choose Research Field</p>
                <p class="panel-copy" id="topic-field-modal-copy">
                  Start with a primary domain, then select level-2 or level-3 directions on the right. You can add multiple tags at once.
                </p>
              </div>
              <button id="close-topic-field-modal" type="button">Close</button>
            </div>
            <div class="field-selector-layout">
              <section class="field-selector-primary">
                <p class="field-selector-label" id="topic-field-primary-title">Primary Domain</p>
                <div class="field-selector-primary-list" id="topic-field-primary-list"></div>
              </section>
              <section class="field-selector-detail">
                <div class="field-selector-section">
                  <div class="field-selector-heading">
                    <p class="field-selector-label" id="topic-field-detail-title">Level-2 / Level-3 Directions</p>
                    <p class="field-selector-meta" id="topic-field-selected-count">0 selected</p>
                  </div>
                  <div class="field-selector-detail-list" id="topic-field-detail-list"></div>
                </div>
                <div class="field-selector-section">
                  <p class="field-selector-label" id="topic-field-pending-title">Pending Tags</p>
                  <div class="tag-list selected" id="topic-field-pending-list"></div>
                </div>
              </section>
            </div>
            <div class="modal-actions">
              <button id="cancel-topic-field-selection" type="button">Cancel</button>
              <button id="confirm-topic-field-selection" class="secondary" type="button">Add Selected Tags</button>
            </div>
          </div>
        </div>
        <section class="topic-run-panel">
          <div class="topic-run-actions">
            <button id="run" class="secondary run-primary" type="button">Run pipeline</button>
            <button id="open-run-output-dir" type="button" disabled>Open Output Folder</button>
          </div>
          <div class="run-mode-block">
            <p class="field-label-inline" id="managed-run-mode-label">Run Mode</p>
            <div class="radio-group">
              <label class="radio-card">
                <input id="managed-run-mode-new" type="radio" name="managed-run-mode" value="new" checked />
                <span id="managed-run-mode-new-label">New Run</span>
              </label>
              <label class="radio-card">
                <input id="managed-run-mode-resume-latest" type="radio" name="managed-run-mode" value="resume-latest" />
                <span id="managed-run-mode-resume-latest-label">Continue Current Run</span>
              </label>
            </div>
            <p class="field-hint" id="managed-run-mode-hint"></p>
            <label class="managed-run-picker">
              <span id="managed-run-pick-label">Pick History Run</span>
              <select id="managed-run-pick"></select>
              <small class="field-hint" id="managed-run-pick-hint"></small>
            </label>
            <div class="managed-run-banner" id="managed-run-banner" hidden>
              <p class="field-hint managed-run-banner-copy" id="managed-run-mode-current"></p>
              <button id="clear-managed-resume-batch" type="button">Start as New Run</button>
            </div>
          </div>
          <section class="run-stats-panel">
            <div class="panel-header">
              <p class="panel-title run-stats-title" id="run-stats-title">Run Stats</p>
            </div>
            <div class="run-stats-grid" id="run-stats-grid"></div>
          </section>
          <section class="topic-log-panel">
            <div class="panel-header">
              <p class="panel-title run-status-title" id="run-logs-title">Run Logs</p>
              <div class="panel-header-actions">
                <button id="export-logs" class="secondary" type="button">Export Logs</button>
                <div class="progress-summary">
                  <div class="progress-meta" id="progress-meta">0 / 5</div>
                  <div class="progress-detail" id="progress-detail"></div>
                </div>
              </div>
            </div>
            <div class="progress-track">
              <div class="progress-fill" id="progress-fill"></div>
            </div>
            <pre id="logs">No run yet.</pre>
          </section>
        </section>
      </section>
      <section class="tab-panel" data-tab-panel="recent-updates" hidden>
        <div class="tab-copy-block">
          <p class="panel-title" id="recent-updates-title">Recent Updates</p>
        </div>
        <section class="recent-updates-panel" id="recent-updates-panel"></section>
      </section>
      <section class="tab-panel" data-tab-panel="settings" hidden>
        <div class="tab-copy-block">
          <div class="title-with-meta">
            <p class="panel-title" id="settings-tab-title">Settings</p>
            <span class="panel-meta-badge" id="settings-version">Current version: v0.1.6</span>
          </div>
          <p class="panel-copy" id="settings-basic-copy">Most users only need to choose a provider, model, and API key.</p>
        </div>

        <!-- Platform -->
        <div class="section-block">
          <p class="section-title" id="integration-section-title">Platform</p>
        </div>
        <div class="platform-settings-card">
          <div class="platform-env-row">
            <span class="platform-env-label" id="qa-platform-env-label">QA Platform</span>
            <div class="platform-env-options">
              <label class="radio-card platform-env-radio">
                <input id="qa-platform-dev" type="radio" name="qa-platform-env" value="dev" />
                <span id="qa-platform-dev-label">127.0.0.1 (Dev)</span>
              </label>
              <label class="radio-card platform-env-radio">
                <input id="qa-platform-prod" type="radio" name="qa-platform-env" value="prod" checked />
                <span id="qa-platform-prod-label">182.92.166.143 (Prod)</span>
              </label>
            </div>
          </div>
          <div class="platform-credentials-row">
            <label class="platform-cred-field">
              <span id="qa-platform-username-label">Username</span>
              <input id="qa-platform-username" placeholder="your-account" />
            </label>
            <label class="platform-cred-field">
              <span id="qa-platform-password-label">Password</span>
              <input id="qa-platform-password" type="password" />
            </label>
          </div>
          <div class="platform-actions-row">
            <button type="button" class="platform-login-button" id="platform-login-button">Login</button>
            <div class="platform-login-status" id="platform-login-status">○ Not logged in</div>
          </div>
          <div id="platform-account-card"></div>
          <div id="password-change-form-container" hidden></div>
        </div>

        <!-- Model Configuration -->
        <div class="section-block">
          <p class="section-title" id="model-section-title">Model Configuration</p>
        </div>
        <div class="grid three">
          <label>
            <div class="field-label-row">
              <span id="provider-preset-label">Model Provider</span>
              <button class="field-help-button" data-help-key="provider_preset" type="button">?</button>
            </div>
            <select id="provider-preset">
              <option id="provider-preset-option-custom" value="custom">Custom</option>
              <option id="provider-preset-option-qwen" value="qwen_dashscope">Qwen / DashScope</option>
              <option id="provider-preset-option-deepseek" value="deepseek">DeepSeek</option>
              <option id="provider-preset-option-moonshot" value="moonshot_kimi">Kimi / Moonshot</option>
              <option id="provider-preset-option-zhipu" value="zhipu_glm">Zhipu GLM</option>
              <option id="provider-preset-option-minimax" value="minimax">MiniMax</option>
              <option id="provider-preset-option-hunyuan" value="tencent_hunyuan">Tencent Hunyuan</option>
              <option id="provider-preset-option-qianfan" value="baidu_qianfan">Baidu Qianfan</option>
              <option id="provider-preset-option-stub" value="stub_local" hidden>Stub Local Test</option>
              <option id="provider-preset-option-platform" value="platform" hidden>Platform Model</option>
            </select>
          </label>
          <label id="provider-field" hidden>
            <div class="field-label-row">
              <span id="provider-label">Adapter Type</span>
            </div>
            <select id="provider">
              <option value="openai-compatible" selected>openai-compatible</option>
              <option value="stub" hidden>stub</option>
            </select>
          </label>
          <label>
            <div class="field-label-row">
              <span id="model-label">Model</span>
              <button class="field-help-button" data-help-key="model" type="button">?</button>
            </div>
            <select id="model"></select>
          </label>
          <label id="custom-model-field" hidden>
            <div class="field-label-row">
              <span id="custom-model-label">Custom Model</span>
            </div>
            <input id="custom-model" placeholder="例如 glm-5.1" />
          </label>
        </div>
        <div class="grid two">
          <label>
            <div class="field-label-row">
              <span id="base-url-label">Base URL</span>
              <button class="field-help-button" data-help-key="base_url" type="button">?</button>
            </div>
            <input id="base-url" placeholder="https://api.openai.com/v1" />
          </label>
          <label>
            <div class="field-label-row">
              <span id="api-key-label">API key</span>
              <button class="field-help-button" data-help-key="api_key" type="button">?</button>
            </div>
            <div class="inline-field">
              <input id="api-key" type="password" />
              <button id="toggle-api-key-visibility" type="button">Show</button>
            </div>
          </label>
        </div>

        <!-- Advanced Settings (collapsed) -->
        <details class="advanced-settings" id="advanced-settings">
          <summary id="advanced-settings-summary">Advanced Settings</summary>
          <p class="panel-copy advanced-settings-copy" id="advanced-settings-copy">
            Ordinary users can usually keep the defaults here.
          </p>

          <!-- Output Directory -->
          <div class="section-block">
            <p class="section-title" id="output-section-title">Output Directory</p>
          </div>
          <div class="grid two">
            <label class="output-root-field">
              <div class="field-label-row">
                <span id="output-root-label">Output Directory</span>
              </div>
              <input id="output-root" />
              <small class="field-hint" id="output-root-hint">
                Choose the root folder used for generated runs and history. The app still creates one subfolder per run inside it.
              </small>
            </label>
            <div class="output-root-actions">
              <button id="select-output-root" type="button">Choose Folder</button>
              <button id="open-output-root" class="secondary" type="button">Open Output Directory</button>
              <button id="reset-output-root" class="secondary" type="button">Restore Default</button>
            </div>
          </div>

          <!-- Runtime Parameters -->
          <div class="section-block">
            <p class="section-title" id="runtime-section-title">Runtime Parameters</p>
            <p class="field-hint runtime-constraint-hint" id="runtime-constraint-hint"></p>
          </div>
          <div class="grid four">
            <label>
              <div class="field-label-row">
                <span id="target-count-label">Target count</span>
                <button class="field-help-button" data-help-key="target_count" type="button">?</button>
              </div>
              <input id="target-count" type="number" value="10000" />
            </label>
            <label>
              <div class="field-label-row">
                <span id="plan-limit-label">Plan limit</span>
                <button class="field-help-button" data-help-key="plan_limit" type="button">?</button>
              </div>
              <input id="plan-limit" type="number" value="1200" />
            </label>
            <label>
              <div class="field-label-row">
                <span id="shard-size-label">Shard size</span>
                <button class="field-help-button" data-help-key="shard_size" type="button">?</button>
              </div>
              <input id="shard-size" type="number" value="1000" />
            </label>
            <label>
              <div class="field-label-row">
                <span id="batch-size-label">Batch size</span>
                <button class="field-help-button" data-help-key="batch_size" type="button">?</button>
              </div>
              <input id="batch-size" type="number" value="8" />
            </label>
          </div>
          <div class="grid four">
            <label>
              <div class="field-label-row">
                <span id="max-in-flight-label">Max in flight</span>
                <button class="field-help-button" data-help-key="max_in_flight" type="button">?</button>
              </div>
              <input id="max-in-flight" type="number" value="4" />
            </label>
            <label>
              <div class="field-label-row">
                <span id="max-retries-label">Max retries</span>
                <button class="field-help-button" data-help-key="max_retries" type="button">?</button>
              </div>
              <input id="max-retries" type="number" value="3" />
            </label>
            <label>
              <div class="field-label-row">
                <span id="request-timeout-secs-label">Timeout secs</span>
                <button class="field-help-button" data-help-key="timeout_secs" type="button">?</button>
              </div>
              <input id="request-timeout-secs" type="number" value="120" />
            </label>
            <label>
              <div class="field-label-row">
                <span id="resume-label">Resume existing shards</span>
                <button class="field-help-button" data-help-key="resume_existing" type="button">?</button>
              </div>
              <input id="resume" type="checkbox" checked />
            </label>
          </div>

          <!-- CoT Structure -->
          <div class="section-block">
            <p class="section-title" id="cot-structure-section-title">CoT Structure</p>
          </div>
          <div class="grid one">
            <label>
              <div class="field-label-row">
                <span id="cot-section-headers-label">CoT Section Headers</span>
              </div>
              <textarea id="cot-section-headers" rows="8"></textarea>
              <small class="field-hint" id="cot-section-headers-hint">
                One section header per line. The runtime will use these lines to build the CoT answer format.
              </small>
            </label>
          </div>

          <!-- Literature API -->
          <div class="section-block">
            <p class="section-title" id="literature-section-title">Literature API</p>
          </div>
          <div class="grid two">
            <label>
              <div class="field-label-row">
                <span id="literature-api-url-label">Literature API URL</span>
                <button class="field-help-button" data-help-key="literature_api_url" type="button">?</button>
              </div>
              <input id="literature-api-url" placeholder="https://example.com/literature/api" />
            </label>
            <label>
              <div class="field-label-row">
                <span id="literature-api-auth-label">Literature API Auth Token</span>
                <button class="field-help-button" data-help-key="literature_api_auth" type="button">?</button>
              </div>
              <input id="literature-api-auth" type="password" />
              <small class="field-hint" id="literature-api-auth-hint">
                Authentication token for the literature API, stored in local settings.
              </small>
            </label>
          </div>
        </details>
      </section>
      <section class="tab-panel" data-tab-panel="qa-evaluate" hidden>
        <div class="tab-copy-block">
          <p class="panel-title" id="qa-evaluate-tab-title">QA Evaluate</p>
          <p class="panel-copy" id="qa-evaluate-tab-copy">Check platform reachability, verify sign-in, and open the QA evaluation workspace.</p>
        </div>
        <section class="platform-panel" id="qa-evaluate-panel"></section>
      </section>
      <section class="tab-panel" data-tab-panel="model-trial" hidden>
        <div class="tab-copy-block">
          <p class="panel-title" id="model-trial-tab-title">Model Trial</p>
          <p class="panel-copy" id="model-trial-tab-copy">This version keeps model trial as a platform entry: check connectivity, confirm sign-in, then open the platform side.</p>
        </div>
        <section class="platform-panel" id="model-trial-panel"></section>
      </section>
      <section class="tab-panel" data-tab-panel="browse" hidden>
        <div class="tab-copy-block">
          <p class="panel-title" id="browse-tab-title">Browse QA</p>
        </div>
        <section class="browse-shell browse-panel">
          <div class="browse-header">
            <button class="browse-back-button" id="browse-back" type="button" hidden>Back</button>
            <div class="browse-header-copy">
              <p class="panel-title browse-panel-title" id="browse-view-title">Batch Runs</p>
              <p class="panel-copy browse-view-meta" id="browse-view-meta"></p>
            </div>
          </div>
          <div id="browse-content"></div>
        </section>
      </section>
      <section class="tab-panel" data-tab-panel="feedback2" hidden>
        <div class="tab-copy-block">
          <p class="panel-title" id="feedback2-panel-title">Feedback 2</p>
        </div>
        <div class="feedback2-panel" id="feedback2-panel">
          <div class="feedback2-section">
            <h3 id="feedback2-email-title">Email</h3>
            <p class="feedback2-hint" id="feedback2-email-hint">Send email directly to describe your suggestions or issues.</p>
            <a href="mailto:zhengyi@yzwlab.cn" class="feedback2-button" target="_blank" id="feedback2-email-link">Send Email</a>
          </div>
          <div class="feedback2-section">
            <h3 id="feedback2-github-title">GitHub Issue</h3>
            <p class="feedback2-hint" id="feedback2-github-hint">Create an issue in the project GitHub repository.</p>
            <button class="feedback2-button" data-feedback2-action="github" id="feedback2-github-button">Submit GitHub Issue</button>
          </div>
          <div class="feedback2-section">
            <h3 id="feedback2-form-title">Feedback Form</h3>
            <p class="feedback2-hint" id="feedback2-form-hint">Login to submit feedback to the platform.</p>
            <p class="feedback2-login-required" id="feedback2-login-required">Login to QA platform first to submit feedback via form.</p>
            <form class="feedback2-form" id="feedback2-form" hidden>
              <label>
                <span id="feedback2-title-label">Title</span>
                <input id="feedback2-title" placeholder="Brief description" required />
              </label>
              <label>
                <span id="feedback2-content-label">Details</span>
                <textarea id="feedback2-content" rows="4" placeholder="Describe in detail..." required></textarea>
              </label>
              <label>
                <span id="feedback2-category-label">Category</span>
                <select id="feedback2-category">
                  <option value="feature" id="feedback2-cat-feature">Feature Request</option>
                  <option value="bug" id="feedback2-cat-bug">Bug Report</option>
                  <option value="other" id="feedback2-cat-other">Other</option>
                </select>
              </label>
              <button type="submit" class="feedback2-submit-button" id="feedback2-submit-button">Submit</button>
              <p class="feedback2-success" id="feedback2-success" hidden>Feedback submitted successfully!</p>
              <p class="feedback2-error" id="feedback2-form-error" hidden></p>
            </form>
          </div>
        </div>
      </section>
      <section class="tab-panel" data-tab-panel="paper-qa" hidden>
        <div class="tab-copy-block">
          <p class="panel-title" id="paper-qa-tab-title">Paper QA</p>
          <p class="panel-copy" id="paper-qa-tab-copy">Convert PDF papers to markdown, chunk them, and generate QA pairs.</p>
        </div>
        <div class="paper-qa-panel" id="paper-qa-panel">
          <div class="platform-inline-banner error" id="paper-qa-error-banner" hidden></div>
          <div class="platform-inline-banner success" id="paper-qa-success-banner" hidden></div>
          <div class="paper-qa-toolbar">
            <button class="paper-qa-toolbar-button" type="button" id="paper-qa-add-btn">${t("paper_qa_add")}</button>
            <button class="paper-qa-toolbar-button paper-qa-toolbar-button-primary" type="button" id="paper-qa-convert-btn">${t("paper_qa_convert")}</button>
            <button class="paper-qa-toolbar-button paper-qa-toolbar-button-primary" type="button" id="paper-qa-generate-btn">${t("paper_qa_generate")}</button>
            <div class="paper-qa-cot-ratio">
              <span>${t("paper_qa_cot_ratio")}</span>
              <input type="range" id="paper-qa-cot-ratio" min="0" max="1" step="0.05" value="0.4">
              <span class="paper-qa-cot-ratio-value" id="paper-qa-cot-ratio-value">0.4</span>
            </div>
            <button class="paper-qa-toolbar-button paper-qa-toolbar-button-secondary" type="button" id="paper-qa-save-batch-btn">${t("paper_qa_save_batch")}</button>
            <span class="paper-qa-generate-status" id="paper-qa-generate-status"></span>
          </div>
          <div class="paper-qa-body">
            <div class="paper-qa-left" id="paper-qa-left">
              <h3>Files</h3>
              <div id="paper-qa-file-list">
                <div class="paper-qa-hint">${t("paper_qa_empty")}</div>
              </div>
            </div>
            <div class="paper-qa-right" id="paper-qa-right">
              <h3>Results</h3>
              <div id="paper-qa-progress" class="paper-qa-progress" hidden>
                <div class="paper-qa-progress-bar" id="paper-qa-progress-bar"></div>
                <div class="paper-qa-progress-text" id="paper-qa-progress-text"></div>
              </div>
              <div id="paper-qa-results">
                <div class="paper-qa-empty">${t("paper_qa_empty")}</div>
              </div>
              <div class="paper-qa-log" id="paper-qa-log" hidden></div>
              <div class="paper-qa-stats" id="paper-qa-stats" hidden></div>
            </div>
          </div>
        </div>
      </section>
      </section>
      <aside class="inspector" hidden>
        <section class="panel result-panel">
          <div class="result-header">
            <div>
              <p class="panel-title" id="result-title">Current Result</p>
            </div>
            <div class="result-mode" id="result-mode">Idle</div>
          </div>
          <div class="result-cards" id="result-cards"></div>
          <div class="result-actions" id="result-actions"></div>
          <details class="raw-output" id="output-details">
            <summary id="raw-output-summary">Raw JSON</summary>
            <pre id="output">No preview yet.</pre>
          </details>
        </section>
      </aside>
    </section>
    <div class="modal-shell" id="first-launch-modal" hidden>
      <div class="modal-backdrop" data-first-launch-close="true"></div>
      <div class="modal-panel first-launch-panel" role="dialog" aria-modal="true" aria-labelledby="first-launch-title">
        <div class="modal-header">
          <div>
            <p class="panel-title" id="first-launch-title">Welcome to QA小灶</p>
            <p class="panel-copy" id="first-launch-copy"></p>
          </div>
        </div>
        <div class="first-launch-grid" id="first-launch-grid"></div>
        <section class="first-launch-note">
          <p class="section-title" id="first-launch-note-title">Note</p>
          <p class="panel-copy first-launch-note-copy" id="first-launch-note-copy"></p>
        </section>
        <div class="modal-actions">
          <button id="first-launch-open-settings" class="secondary" type="button">Open Settings</button>
          <button id="first-launch-confirm" type="button">Got It</button>
        </div>
      </div>
    </div>
  </main>
`;

const promptInput = document.querySelector<HTMLTextAreaElement>("#prompt");
const appShell = document.querySelector<HTMLElement>(".app-shell");
const topbar = document.querySelector<HTMLElement>(".topbar");
const tabsContainer = document.querySelector<HTMLElement>("#tabs");
const topbarTabSelect = document.querySelector<HTMLSelectElement>("#topbar-tab-select");
const langSelect = document.querySelector<HTMLSelectElement>("#lang-select");
const tabs = Array.from(document.querySelectorAll<HTMLButtonElement>("[data-tab]"));
const tabPanels = Array.from(document.querySelectorAll<HTMLElement>("[data-tab-panel]"));
const runLockBanner = document.querySelector<HTMLElement>("#run-lock-banner");
const checkUpdateButton = document.querySelector<HTMLButtonElement>("#check-update");
const runButton = document.querySelector<HTMLButtonElement>("#run");
const openRunOutputDirButton = document.querySelector<HTMLButtonElement>("#open-run-output-dir");
const runModeBlock = document.querySelector<HTMLElement>(".run-mode-block");
const managedRunModeNewInput = document.querySelector<HTMLInputElement>("#managed-run-mode-new");
const managedRunModeResumeLatestInput = document.querySelector<HTMLInputElement>(
  "#managed-run-mode-resume-latest"
);
const managedRunBanner = document.querySelector<HTMLElement>("#managed-run-banner");
const managedRunModeCurrent = document.querySelector<HTMLElement>("#managed-run-mode-current");
const clearManagedResumeBatchButton = document.querySelector<HTMLButtonElement>(
  "#clear-managed-resume-batch"
);
const managedRunPickInput = document.querySelector<HTMLSelectElement>("#managed-run-pick");
const output = document.querySelector<HTMLElement>("#output");
const resultMode = document.querySelector<HTMLElement>("#result-mode");
const resultCards = document.querySelector<HTMLElement>("#result-cards");
const resultActions = document.querySelector<HTMLElement>("#result-actions");
const outputDetails = document.querySelector<HTMLDetailsElement>("#output-details");
const appVersionBadge = document.querySelector<HTMLElement>("#app-version-badge");
const settingsVersion = document.querySelector<HTMLElement>("#settings-version");
const status = document.querySelector<HTMLElement>("#status");
const platformStatusBadge = document.querySelector<HTMLElement>("#platform-status-badge");
const selectedTopicTags = document.querySelector<HTMLElement>("#selected-topic-tags");
const qaModeNormalInput = document.querySelector<HTMLInputElement>("#qa-mode-normal");
const qaModeCotInput = document.querySelector<HTMLInputElement>("#qa-mode-cot");
const topicTagSuggestions = document.querySelector<HTMLElement>("#topic-tag-suggestions");
const topicTagInput = document.querySelector<HTMLInputElement>("#topic-tag-input");
const addTopicTagButton = document.querySelector<HTMLButtonElement>("#add-topic-tag");
const openTopicFieldSelectorButton = document.querySelector<HTMLButtonElement>("#open-topic-field-selector");
const topicFieldModal = document.querySelector<HTMLElement>("#topic-field-modal");
const closeTopicFieldModalButton = document.querySelector<HTMLButtonElement>("#close-topic-field-modal");
const cancelTopicFieldSelectionButton = document.querySelector<HTMLButtonElement>("#cancel-topic-field-selection");
const confirmTopicFieldSelectionButton = document.querySelector<HTMLButtonElement>("#confirm-topic-field-selection");
const topicFieldPrimaryList = document.querySelector<HTMLElement>("#topic-field-primary-list");
const topicFieldDetailList = document.querySelector<HTMLElement>("#topic-field-detail-list");
const topicFieldPendingList = document.querySelector<HTMLElement>("#topic-field-pending-list");
const topicFieldSelectedCount = document.querySelector<HTMLElement>("#topic-field-selected-count");
const browseContent = document.querySelector<HTMLElement>("#browse-content");
const browseBackButton = document.querySelector<HTMLButtonElement>("#browse-back");
const browseViewTitle = document.querySelector<HTMLElement>("#browse-view-title");
const browseViewMeta = document.querySelector<HTMLElement>("#browse-view-meta");
const providerPresetInput = document.querySelector<HTMLSelectElement>("#provider-preset");
const providerField = document.querySelector<HTMLLabelElement>("#provider-field");
const providerInput = document.querySelector<HTMLSelectElement>("#provider");
const modelInput = document.querySelector<HTMLSelectElement>("#model");
const customModelField = document.querySelector<HTMLLabelElement>("#custom-model-field");
const customModelInput = document.querySelector<HTMLInputElement>("#custom-model");
const outputRootInput = document.querySelector<HTMLInputElement>("#output-root");
const selectOutputRootButton = document.querySelector<HTMLButtonElement>("#select-output-root");
const openOutputRootButton = document.querySelector<HTMLButtonElement>("#open-output-root");
const resetOutputRootButton = document.querySelector<HTMLButtonElement>("#reset-output-root");
const cotSectionHeadersInput = document.querySelector<HTMLTextAreaElement>("#cot-section-headers");
const baseUrlInput = document.querySelector<HTMLInputElement>("#base-url");
const apiKeyInput = document.querySelector<HTMLInputElement>("#api-key");
const qaPlatformDevInput = document.querySelector<HTMLInputElement>("#qa-platform-dev");
const qaPlatformProdInput = document.querySelector<HTMLInputElement>("#qa-platform-prod");
const qaPlatformUsernameInput = document.querySelector<HTMLInputElement>("#qa-platform-username");
const qaPlatformPasswordInput = document.querySelector<HTMLInputElement>("#qa-platform-password");
const platformLoginButton = document.querySelector<HTMLButtonElement>("#platform-login-button");
const platformLoginStatus = document.querySelector<HTMLElement>("#platform-login-status");
const literatureApiUrlInput = document.querySelector<HTMLInputElement>("#literature-api-url");
const literatureApiAuthInput = document.querySelector<HTMLInputElement>("#literature-api-auth");
const qaEvaluatePanel = document.querySelector<HTMLElement>("#qa-evaluate-panel");
const modelTrialPanel = document.querySelector<HTMLElement>("#model-trial-panel");
const recentUpdatesPanel = document.querySelector<HTMLElement>("#recent-updates-panel");
const feedback2Panel = document.querySelector<HTMLElement>("#feedback2-panel");
const chatQaPanel = document.querySelector<HTMLElement>("#chat-qa-panel");
const chatQaSessionsBar = document.querySelector<HTMLElement>("#chat-qa-sessions-bar");
const chatQaModelInfo = document.querySelector<HTMLElement>("#chat-qa-model-info");
const chatQaMessages = document.querySelector<HTMLElement>("#chat-qa-messages");
const chatQaEmpty = document.querySelector<HTMLElement>("#chat-qa-empty");
const chatQaInput = document.querySelector<HTMLTextAreaElement>("#chat-qa-input");
const chatQaSendButton = document.querySelector<HTMLButtonElement>("#chat-qa-send");
const chatQaError = document.querySelector<HTMLElement>("#chat-qa-error");
const toggleApiKeyVisibilityButton = document.querySelector<HTMLButtonElement>("#toggle-api-key-visibility");
const runtimeConstraintHint = document.querySelector<HTMLElement>("#runtime-constraint-hint");
const targetCountInput = document.querySelector<HTMLInputElement>("#target-count");
const planLimitInput = document.querySelector<HTMLInputElement>("#plan-limit");
const shardSizeInput = document.querySelector<HTMLInputElement>("#shard-size");
const batchSizeInput = document.querySelector<HTMLInputElement>("#batch-size");
const maxInFlightInput = document.querySelector<HTMLInputElement>("#max-in-flight");
const maxRetriesInput = document.querySelector<HTMLInputElement>("#max-retries");
const timeoutInput = document.querySelector<HTMLInputElement>("#request-timeout-secs");
const resumeInput = document.querySelector<HTMLInputElement>("#resume");
const progressFill = document.querySelector<HTMLElement>("#progress-fill");
const progressMeta = document.querySelector<HTMLElement>("#progress-meta");
const progressDetail = document.querySelector<HTMLElement>("#progress-detail");
const runStatsGrid = document.querySelector<HTMLElement>("#run-stats-grid");
const exportLogsButton = document.querySelector<HTMLButtonElement>("#export-logs");
const logs = document.querySelector<HTMLElement>("#logs");
const fieldHelpButtons = Array.from(
  document.querySelectorAll<HTMLButtonElement>(".field-help-button[data-help-key]")
);

if (
  !promptInput ||
  !langSelect ||
  !tabsContainer ||
  !topbarTabSelect ||
  !runLockBanner ||
  !checkUpdateButton ||
  !runButton ||
  !openRunOutputDirButton ||
  !managedRunModeNewInput ||
  !managedRunModeResumeLatestInput ||
  !managedRunBanner ||
  !managedRunModeCurrent ||
  !clearManagedResumeBatchButton ||
  !managedRunPickInput ||
  !output ||
  !resultMode ||
  !resultCards ||
  !resultActions ||
  !outputDetails ||
  !appVersionBadge ||
  !settingsVersion ||
  !status ||
  !selectedTopicTags ||
  !qaModeNormalInput ||
  !qaModeCotInput ||
  !topicTagSuggestions ||
  !topicTagInput ||
  !addTopicTagButton ||
  !openTopicFieldSelectorButton ||
  !topicFieldModal ||
  !closeTopicFieldModalButton ||
  !cancelTopicFieldSelectionButton ||
  !confirmTopicFieldSelectionButton ||
  !topicFieldPrimaryList ||
  !topicFieldDetailList ||
  !topicFieldPendingList ||
  !topicFieldSelectedCount ||
  !browseContent ||
  !browseBackButton ||
  !browseViewTitle ||
  !browseViewMeta ||
  !providerPresetInput ||
  !providerField ||
  !providerInput ||
  !modelInput ||
  !customModelField ||
  !customModelInput ||
  !outputRootInput ||
  !selectOutputRootButton ||
  !openOutputRootButton ||
  !resetOutputRootButton ||
  !cotSectionHeadersInput ||
  !baseUrlInput ||
  !apiKeyInput ||
  !qaPlatformDevInput ||
  !qaPlatformProdInput ||
  !qaPlatformUsernameInput ||
  !qaPlatformPasswordInput ||
  !literatureApiUrlInput ||
  !literatureApiAuthInput ||
  !qaEvaluatePanel ||
  !modelTrialPanel ||
  !toggleApiKeyVisibilityButton ||
  !runtimeConstraintHint ||
  !targetCountInput ||
  !planLimitInput ||
  !shardSizeInput ||
  !batchSizeInput ||
  !maxInFlightInput ||
  !maxRetriesInput ||
  !timeoutInput ||
  !resumeInput ||
  !progressFill ||
  !progressMeta ||
  !progressDetail ||
  !runStatsGrid ||
  !exportLogsButton ||
  !logs
) {
  throw new Error("Missing UI elements");
}

cotSectionHeadersInput.value = formatCotSectionHeaders(defaultCotSectionHeadersForLang(currentLang));

const lockableControls: Array<
  HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement | HTMLButtonElement
> = [
  promptInput,
  qaModeNormalInput,
  qaModeCotInput,
  topicTagInput,
  addTopicTagButton,
  openTopicFieldSelectorButton,
  managedRunModeNewInput,
  managedRunModeResumeLatestInput,
  clearManagedResumeBatchButton,
  closeTopicFieldModalButton,
  cancelTopicFieldSelectionButton,
  confirmTopicFieldSelectionButton,
  providerPresetInput,
  providerInput,
  modelInput,
  customModelInput,
  outputRootInput,
  selectOutputRootButton,
  openOutputRootButton,
  resetOutputRootButton,
  cotSectionHeadersInput,
  baseUrlInput,
  apiKeyInput,
  qaPlatformDevInput,
  qaPlatformProdInput,
  qaPlatformUsernameInput,
  qaPlatformPasswordInput,
  literatureApiUrlInput,
  literatureApiAuthInput,
  toggleApiKeyVisibilityButton,
  targetCountInput,
  planLimitInput,
  shardSizeInput,
  batchSizeInput,
  maxInFlightInput,
  maxRetriesInput,
  timeoutInput,
  resumeInput
];

function t(key: string): string {
  return translations[currentLang][key] ?? key;
}

function translationValues(key: string): string[] {
  return (Object.keys(translations) as Lang[])
    .map((lang) => translations[lang][key])
    .filter((value): value is string => Boolean(value));
}

function matchesAnyTranslation(text: string | null, keys: string[]): boolean {
  if (!text) {
    return false;
  }

  return keys.some((key) => translationValues(key).includes(text));
}

function findMatchingTranslationKey(text: string | null, keys: string[]): string | null {
  if (!text) {
    return null;
  }

  return keys.find((key) => translationValues(key).includes(text)) ?? null;
}

function formatMessage(key: string, value?: string): string {
  const template = t(key);
  if (value && template.includes("{value}")) {
    return template.replace("{value}", value);
  }

  return value ? `${template} ${value}` : template;
}

function createResearchFieldLabels(
  nodes: readonly ResearchFieldNode[],
  parentsZh: string[] = [],
  parentsEn: string[] = [],
  labels: Record<string, ResearchFieldLabelMeta> = {}
): Record<string, ResearchFieldLabelMeta> {
  for (const node of nodes) {
    const currentZh = [...parentsZh, node.zh];
    const currentEn = [...parentsEn, node.en];
    labels[node.id] = {
      fullZh: currentZh.join(" / "),
      fullEn: currentEn.join(" / "),
      shortZh: node.zh,
      shortEn: node.en
    };

    if (node.children?.length) {
      createResearchFieldLabels(node.children, currentZh, currentEn, labels);
    }
  }

  return labels;
}

function lookupResearchFieldLabel(tag: string, mode: "full" | "short" = "full"): string | null {
  const meta = RESEARCH_FIELD_LABELS[tag];
  if (!meta) {
    return null;
  }

  if (currentLang === "zh") {
    return mode === "short" ? meta.shortZh : meta.fullZh;
  }

  return mode === "short" ? meta.shortEn : meta.fullEn;
}

function topicTagLabel(tag: string, mode: "full" | "short" = "full"): string {
  const researchFieldLabel = lookupResearchFieldLabel(tag, mode);
  if (researchFieldLabel) {
    return researchFieldLabel;
  }

  const translationKey = `tag_${tag}`;
  const translated = translations[currentLang][translationKey];
  return translated ?? tag;
}

function currentTopicFieldNode(): ResearchFieldNode | null {
  if (!topicFieldModalPrimaryId) {
    return RESEARCH_FIELD_TAXONOMY[0] ?? null;
  }

  return RESEARCH_FIELD_TAXONOMY.find((node) => node.id === topicFieldModalPrimaryId) ?? RESEARCH_FIELD_TAXONOMY[0] ?? null;
}

function formatCountTemplate(key: string, count: number): string {
  return t(key).replace("{count}", String(count));
}

function currentQaMode(): "normal" | "cot" {
  return qaModeCotInput.checked ? "cot" : "normal";
}

function currentManagedRunMode(): "new" | "resume-latest" {
  if (managedResumeBatchId) {
    return "resume-batch";
  }

  return "new";
}

function shouldShowContinueRunButton(): boolean {
  return managedResumeBatchId !== null;
}

function batchMatchesRequest(batch: QaBatchSummary, request: PipelineFormRequest): boolean {
  return (
    batch.status !== "completed" &&
    batch.prompt.trim() === composeEffectivePrompt(request.prompt, request.topicTags).trim() &&
    (batch.qaMode ?? "normal") === request.qaMode &&
    (batch.provider ?? "") === request.provider &&
    (batch.model ?? "") === request.model
  );
}

function findLatestResumableBatchForRequest(request: PipelineFormRequest): QaBatchSummary | null {
  return (
    browseBatches.find((batch) => batchMatchesRequest(batch, request)) ??
    null
  );
}

async function armResumeBatchForRequest(request: PipelineFormRequest) {
  await loadBrowseBatches();
  const batch = findLatestResumableBatchForRequest(request);
  managedResumeBatchId = batch?.id ?? null;
  managedResumeBatchLabel = batch ? batch.topicName || batch.name || batch.id : null;
  syncManagedRunModeUi();
  updateRunButtonUi();
}

function clearManagedResumeBatchOnUserEdit() {
  if (!managedResumeBatchId || isPipelineBusyStatus(currentStatus)) {
    return;
  }
  clearManagedResumeBatch(false);
  updateRunButtonUi();
}

function applyQaModeDefaults(qaMode: "normal" | "cot") {
  if (qaMode !== "cot") {
    return;
  }

  cotSectionHeadersInput.value = formatCotSectionHeaders(defaultCotSectionHeadersForLang(currentLang));
  targetCountInput.value = String(DEFAULT_COT_TARGET_COUNT);
  shardSizeInput.value = String(DEFAULT_COT_SHARD_SIZE);
  batchSizeInput.value = String(DEFAULT_COT_BATCH_SIZE);
  maxInFlightInput.value = String(DEFAULT_COT_MAX_IN_FLIGHT);
  normalizeRuntimeParameterInputs(true);
  renderSetupSummary();
}

function updateApiKeyVisibilityUi() {
  apiKeyInput.type = apiKeyVisible ? "text" : "password";
  toggleApiKeyVisibilityButton.textContent = t(apiKeyVisible ? "hide_secret" : "show_secret");
}

function syncStickyOffsets() {
  if (!topbar) {
    return;
  }
  const rootStyle = getComputedStyle(document.documentElement);
  const stickyTop = Number.parseFloat(rootStyle.getPropertyValue("--sticky-top")) || 14;
  const shellGap = appShell ? Number.parseFloat(getComputedStyle(appShell).gap) || 16 : 16;
  const topbarOffset = Math.ceil(stickyTop + topbar.getBoundingClientRect().height + shellGap);
  document.documentElement.style.setProperty("--topbar-offset", `${topbarOffset}px`);
}

function normalizeTopicTag(tag: string): string {
  return tag.trim().replace(/\s+/g, " ");
}

function renderPaperQaPanel() {
  // Error/success banners
  const errBanner = document.querySelector("#paper-qa-error-banner");
  const okBanner = document.querySelector("#paper-qa-success-banner");
  if (errBanner) {
    errBanner.hidden = !paperQaErrorMessage;
    if (paperQaErrorMessage) errBanner.textContent = paperQaErrorMessage;
  }
  if (okBanner) {
    okBanner.hidden = !paperQaUploadMessage;
    if (paperQaUploadMessage) okBanner.textContent = paperQaUploadMessage;
  }

  // File list
  const fileList = document.querySelector("#paper-qa-file-list");
  if (fileList) {
    if (paperFiles.length === 0) {
      fileList.innerHTML = `<div class="paper-qa-hint">${t("paper_qa_empty")}</div>`;
    } else {
      fileList.innerHTML = paperFiles.map((f) => {
        const isSelected = paperQaSelectedFileId === f.id;
        const statusCls = f.status === "converting" ? "paper-file-status-converting"
          : f.status === "error" ? "paper-file-status-error"
          : f.status === "converted" || f.status === "chunked" ? "paper-file-status-converted"
          : "";
        const statusLabel = f.status === "chunked" ? t("paper_qa_chunked").replace("{n}", String(f.chunks?.length ?? 0))
          : t(`paper_qa_${f.status}`);
        const errorInfo = f.status === "error" && f.error
          ? `<div class="paper-file-error-msg">${escapeHtml(f.error)}</div>`
          : "";
        // Chunk preview when selected
        let chunkPreview = "";
        if (isSelected && f.chunks && f.chunks.length > 0) {
          chunkPreview = `<div class="paper-qa-chunk-list">` +
            f.chunks.map((c, i) => `
              <div class="paper-chunk-item">
                <span class="paper-chunk-section">${escapeHtml(c.sectionType)} #${i + 1}</span>
                <span class="paper-chunk-chars">${c.charCount} chars</span>
                <p class="paper-chunk-preview">${escapeHtml(c.text.slice(0, 200))}${c.text.length > 200 ? "…" : ""}</p>
              </div>
            `).join("") +
            `</div>`;
        }
        return `
          <div class="paper-file-card${isSelected ? " paper-file-card-selected" : ""}" data-file-id="${escapeHtml(f.id)}">
            <span class="paper-file-name" title="${escapeHtml(f.name)}">${escapeHtml(f.name)}</span>
            <span class="paper-file-status ${statusCls}">${statusLabel}</span>
            <button class="paper-file-remove" type="button" data-remove-file="${escapeHtml(f.id)}">&times;</button>
            ${errorInfo}
            ${chunkPreview}
          </div>`;
      }).join("");
    }
  }

  // Results
  const results = document.querySelector("#paper-qa-results");
  if (results) {
    if (!paperQaResult || paperQaResult.items.length === 0) {
      results.innerHTML = `<div class="paper-qa-empty">${t("paper_qa_empty")}</div>`;
    } else {
      results.innerHTML = paperQaResult.items.map((item) => `
        <div class="paper-qa-result-item">
          <div class="paper-qa-result-header">
            <span class="paper-qa-result-type ${item.qaType === "cot" ? "paper-qa-type-cot" : "paper-qa-type-qa"}">${item.qaType === "cot" ? "CoT" : "QA"}</span>
            <span class="paper-qa-result-section">${escapeHtml(item.sectionType)}</span>
          </div>
          <div class="paper-qa-result-instruction"><strong>Q:</strong> ${escapeHtml(item.instruction)}</div>
          ${item.reasoning ? `<div class="paper-qa-result-reasoning"><strong>Reasoning:</strong> ${escapeHtml(item.reasoning)}</div>` : ""}
          <div class="paper-qa-result-output"><strong>A:</strong> ${escapeHtml(item.output)}</div>
        </div>
      `).join("");
    }
  }

  // Stats
  const stats = document.querySelector("#paper-qa-stats");
  if (stats) {
    if (paperQaResult && paperQaResult.stats.total > 0) {
      stats.hidden = false;
      stats.textContent = t("paper_qa_stats")
        .replace("{total}", String(paperQaResult.stats.total))
        .replace("{cot}", String(paperQaResult.stats.cotCount))
        .replace("{qa}", String(paperQaResult.stats.qaCount));
    } else {
      stats.hidden = true;
    }
  }

  // Progress bar
  const progressEl = document.querySelector("#paper-qa-progress");
  const progressBar = document.querySelector<HTMLElement>("#paper-qa-progress-bar");
  const progressText = document.querySelector("#paper-qa-progress-text");
  if (progressEl && progressBar && progressText) {
    if (paperQaGenerating) {
      progressEl.hidden = false;
      progressBar.style.width = paperQaProgressPercent + "%";
      progressText.textContent = paperQaProgressMessage || t("paper_qa_generating");
    } else {
      progressEl.hidden = true;
    }
  }

  // Log area
  const logEl = document.querySelector("#paper-qa-log");
  if (logEl) {
    if (paperQaLogLines.length > 0) {
      logEl.hidden = false;
      logEl.innerHTML = paperQaLogLines.map(l => `<div class="paper-qa-log-line">${escapeHtml(l)}</div>`).join("");
      logEl.scrollTop = logEl.scrollHeight;
    } else {
      logEl.hidden = true;
    }
  }

  // Button states
  const convertBtn = document.querySelector<HTMLButtonElement>("#paper-qa-convert-btn");
  const generateBtn = document.querySelector<HTMLButtonElement>("#paper-qa-generate-btn");
  const saveBatchBtn = document.querySelector<HTMLButtonElement>("#paper-qa-save-batch-btn");
  const statusEl = document.querySelector("#paper-qa-generate-status");

  if (convertBtn) {
    convertBtn.disabled = paperQaConverting || paperQaGenerating || paperFiles.length === 0;
  }
  if (generateBtn) {
    const hasChunked = paperFiles.some(f => f.status === "chunked");
    const hasProvider = resolveLLMProvider().mode !== "none";
    generateBtn.disabled = paperQaConverting || paperQaGenerating || !hasChunked || !hasProvider;
    generateBtn.title = (!hasProvider && hasChunked) ? t("paper_qa_no_provider") : "";
  }
  if (saveBatchBtn) {
    saveBatchBtn.disabled = paperQaUploading || !paperQaResult || paperQaResult.items.length === 0;
  }
  if (statusEl) {
    const hasChunked2 = paperFiles.some(f => f.status === "chunked");
    const hasProvider2 = resolveLLMProvider().mode !== "none";
    if (paperQaConverting) statusEl.textContent = t("paper_qa_converting");
    else if (paperQaGenerating) statusEl.textContent = t("paper_qa_generating");
    else if (paperQaUploading) statusEl.textContent = t("paper_qa_uploading");
    else if (!hasProvider2 && hasChunked2) statusEl.textContent = t("paper_qa_no_provider");
    else statusEl.textContent = "";
  }

  // CoT ratio slider
  const ratioSlider = document.querySelector<HTMLInputElement>("#paper-qa-cot-ratio");
  const ratioValue = document.querySelector("#paper-qa-cot-ratio-value");
  if (ratioSlider) ratioSlider.value = String(paperQaCotRatio);
  if (ratioValue) ratioValue.textContent = String(paperQaCotRatio);

  // Tab labels
  const tabLabel = document.querySelector("#tab-paper-qa-label");
  const tabTitle = document.querySelector("#paper-qa-tab-title");
  const tabCopy = document.querySelector("#paper-qa-tab-copy");
  if (tabLabel) tabLabel.textContent = t("paper_qa_tab");
  if (tabTitle) tabTitle.textContent = t("paper_qa_tab");
  if (tabCopy) tabCopy.textContent = t("paper_qa_empty");
}

function addPaperFiles(filesOrPaths: FileList | File[] | string[]) {
  let paths: string[];
  if (typeof filesOrPaths[0] === "string") {
    // Tauri open() dialog returns string paths
    paths = filesOrPaths as string[];
  } else {
    // HTML5 drag-drop / file input
    const fileObjs = Array.from(filesOrPaths as FileList | File[]);
    paths = fileObjs
      .filter(f => f.name.toLowerCase().endsWith(".pdf"))
      .map(f => (f as any).path as string)
      .filter(Boolean);
  }

  if (paths.length === 0) return;

  const remaining = 20 - paperFiles.length;
  if (remaining <= 0) {
    paperQaErrorMessage = t("paper_qa_max_files");
    renderPaperQaPanel();
    return;
  }

  const toAdd = paths.slice(0, remaining);
  if (paths.length > remaining) {
    paperQaErrorMessage = t("paper_qa_max_files");
  } else {
    paperQaErrorMessage = null;
  }

  for (const p of toAdd) {
    const name = p.split(/[/\\]/).pop() ?? p;
    const paperFile: PaperFile = {
      id: crypto.randomUUID(),
      name,
      path: p,
      status: "pending",
      mdText: null,
      chunks: null,
      error: null,
    };
    paperFiles.push(paperFile);
  }

  renderPaperQaPanel();
}

function removePaperFile(id: string) {
  paperFiles = paperFiles.filter(f => f.id !== id);
  if (paperFiles.length === 0) {
    paperQaResult = null;
  }
  paperQaErrorMessage = null;
  paperQaSelectedFileId = null;
  renderPaperQaPanel();
}

async function handlePaperQaConvert() {
  if (paperQaConverting || paperQaGenerating) return;
  const pending = paperFiles.filter(f => f.status === "pending");
  if (pending.length === 0) return;

  paperQaConverting = true;
  paperQaErrorMessage = null;
  renderPaperQaPanel();

  for (const file of pending) {
    file.status = "converting";
    renderPaperQaPanel();

    try {
      const mdText = await invoke<string>("convert_pdf_via_mineru", { pdfPath: file.path });
      file.mdText = mdText;
      file.status = "converted";
      renderPaperQaPanel();

      const chunks = await invoke<PaperChunk[]>("chunk_paper_md", {
        mdText,
        paperTitle: file.name.replace(/\.pdf$/i, ""),
      });
      file.chunks = chunks;
      file.status = "chunked";
    } catch (err) {
      file.status = "error";
      file.error = String(err);
    }
    renderPaperQaPanel();
  }

  paperQaConverting = false;
  renderPaperQaPanel();
}

type ResolvedLLMProvider =
  | { mode: "settings"; provider: string; baseUrl: string; apiKey: string; model: string }
  | { mode: "platform"; platformUrl: string; username: string; password: string; model: string }
  | { mode: "none"; model: string };

function resolveLLMProvider(): ResolvedLLMProvider {
  const settingsBaseUrl = baseUrlInput.value.trim();
  const settingsApiKey = apiKeyInput.value.trim();
  if (settingsBaseUrl && settingsApiKey) {
    return {
      mode: "settings",
      provider: providerInput.value.trim() || "openai-compatible",
      baseUrl: settingsBaseUrl,
      apiKey: settingsApiKey,
      model: currentModelValue(),
    };
  }

  const platformAuth = currentPlatformAuthPayload();
  if (platformLoginState.kind === "success" && platformAuth !== null) {
    const platformModel = currentPlatformGenerateModel();
    const model = platformModel?.model
      ?? (platformGenerateModels.length > 0 ? platformGenerateModels[0].model : "");
    if (model) {
      return {
        mode: "platform",
        platformUrl: platformAuth.platformUrl,
        username: platformAuth.username,
        password: platformAuth.password,
        model,
      };
    }
  }

  return { mode: "none", model: "" };
}

async function handlePaperQaGenerate() {
  if (paperQaConverting || paperQaGenerating) return;
  const chunkedFiles = paperFiles.filter(f => f.status === "chunked" && f.chunks);
  appendLog(`Paper QA Generate: chunkedFiles=${chunkedFiles.length}, files=${paperFiles.map(f => `${f.name}(${f.status})`).join(", ")}`);
  if (chunkedFiles.length === 0) return;

  const resolved = resolveLLMProvider();
  let platformUrl: string | null = null;
  let username: string | null = null;
  let password: string | null = null;
  let baseUrl = "";
  let apiKey = "";
  let model = "";
  let provider = "openai-compatible";

  if (resolved.mode === "platform") {
    provider = "platform";
    platformUrl = resolved.platformUrl;
    username = resolved.username;
    password = resolved.password;
    model = resolved.model;
  } else if (resolved.mode === "settings") {
    baseUrl = resolved.baseUrl;
    apiKey = resolved.apiKey;
    model = resolved.model;
    provider = resolved.provider;
  }

  appendLog(`Paper QA Generate: mode=${resolved.mode}, model=${model}, platformUrl=${platformUrl || "(none)"}`);

  if (!model || resolved.mode === "none") {
    paperQaErrorMessage = t("paper_qa_no_provider");
    appendLog(`Paper QA Generate: ABORT no provider`);
    renderPaperQaPanel();
    return;
  }

  const allChunks = chunkedFiles.flatMap(f => f.chunks!);
  const paperTitle = chunkedFiles.map(f => f.name).join(", ");
  const request: Record<string, unknown> = {
    chunks: allChunks,
    paperTitle,
    provider,
    baseUrl,
    apiKey,
    model,
    cotRatio: paperQaCotRatio,
  };
  if (platformUrl) {
    request.platformUrl = platformUrl;
    request.username = username;
    request.password = password;
  }

  appendLog(`Paper QA Generate: sending ${allChunks.length} chunks, title="${paperTitle}", cotRatio=${paperQaCotRatio}`);

  paperQaGenerating = true;
  paperQaErrorMessage = null;
  paperQaUploadMessage = null;
  renderPaperQaPanel();

  try {
    const result = await invoke<PaperQaGenerateResponse>("generate_paper_qa", { request });
    appendLog(`Paper QA Generate: OK items=${result.items.length}, total=${result.stats.total}, warnings=${result.warnings?.length ?? 0}`);
    if (result.warnings && result.warnings.length > 0) {
      for (const w of result.warnings) {
        appendLog(`Paper QA Warning: ${w}`);
      }
    }
    paperQaResult = result;
  } catch (err) {
    appendLog(`Paper QA Generate: ERROR ${String(err)}`);
    paperQaErrorMessage = t("paper_qa_generate_error") + ": " + String(err);
  }

  paperQaGenerating = false;
  renderPaperQaPanel();
}

async function handlePaperQaSaveBatch() {
  if (paperQaUploading || !paperQaResult?.items.length) return;

  paperQaUploading = true;
  paperQaErrorMessage = null;
  paperQaUploadMessage = null;
  renderPaperQaPanel();

  try {
    const chunkedFiles = paperFiles.filter(f => f.status === "chunked" && f.chunks);
    const paperTitle = chunkedFiles.map(f => f.name).join(", ");
    const provider = providerInput.value.trim() || "openai-compatible";
    const model = isUsingPlatformModel()
      ? (currentPlatformGenerateModel()?.model ?? "unknown")
      : currentModelValue();

    const batch = await invoke<QaBatchSummary>("save_paper_qa_batch", {
      items: paperQaResult.items,
      paperTitle,
      provider,
      model,
    });

    appendLog(`Paper QA: saved batch ${batch.id} (${batch.totalCount} items) to Browse QA`);
    paperQaUploadMessage = t("paper_qa_save_batch_done");
  } catch (err) {
    appendLog(`Paper QA Save Batch: ERROR ${String(err)}`);
    paperQaErrorMessage = t("paper_qa_save_batch_error") + ": " + String(err);
  }

  paperQaUploading = false;
  renderPaperQaPanel();
}

function setCurrentTab(tab: UiTab) {
  currentTab = tab;
  topbarTabSelect.value = tab;
  for (const button of tabs) {
    button.dataset.active = button.dataset.tab === tab ? "true" : "false";
  }
  for (const panel of tabPanels) {
    const isActive = panel.dataset.tabPanel === tab;
    panel.hidden = !isActive;
    panel.style.display = isActive ? "grid" : "none";
    panel.setAttribute("aria-hidden", isActive ? "false" : "true");
  }
  const activePanel = tabPanels.find((panel) => panel.dataset.tabPanel === tab) ?? null;

  if (activePanel) {
    window.requestAnimationFrame(() => {
      activePanel.scrollIntoView({ block: "start", inline: "nearest" });
    });
  }

  if (tab === "browse" && !browseLoading) {
    void loadBrowseBatches();
  }
  if (tab === "qa-evaluate") {
    try { renderQaEvaluatePanel(); } catch (e) { appendLog(`renderQaEvaluatePanel: ${String(e)}`); }
  }
  if (
    tab === "model-trial" &&
    !modelTrialLocalBatches.length
  ) {
    void loadModelTrialLocalBatches();
  }
  if (
    tab === "model-trial" &&
    !modelTrialWorkspaceLoading &&
    hasQaPlatformCredentials() &&
    currentQaPlatformUrl() &&
    !modelTrialConfigs.length &&
    !modelTrialSessions.length
  ) {
    void loadModelTrialWorkspace();
  }
  if (tab === "chat-qa") {
    try { renderChatQaPanel(); } catch (e) { appendLog(`renderChatQaPanel: ${String(e)}`); }
  }
  if (tab === "recent-updates") {
    try { renderRecentUpdatesPanel(); } catch (e) { appendLog(`renderRecentUpdatesPanel: ${String(e)}`); }
    void loadRecentUpdatesData();
  }
  if (tab === "feedback2") {
    try { renderFeedback2Panel(); } catch (e) { appendLog(`renderFeedback2Panel: ${String(e)}`); }
  }
  if (tab === "paper-qa") {
    try { renderPaperQaPanel(); } catch (e) { appendLog(`renderPaperQaPanel: ${String(e)}`); }
  }
}

function renderTopicFieldModal() {
  const primaryNode = currentTopicFieldNode();

  topicFieldPrimaryList.innerHTML = RESEARCH_FIELD_TAXONOMY.map((node) => {
    const active = node.id === primaryNode?.id;
    return `<button class="field-primary-button${active ? " active" : ""}" type="button" data-field-primary="${escapeHtml(node.id)}">${escapeHtml(topicTagLabel(node.id, "short"))}</button>`;
  }).join("");

  if (!primaryNode?.children?.length) {
    topicFieldDetailList.innerHTML = `<div class="empty-state compact">${escapeHtml(t("topic_field_empty"))}</div>`;
  } else {
    topicFieldDetailList.innerHTML = primaryNode.children
      .map((secondary) => {
        const secondarySelected = pendingTopicFieldTags.includes(secondary.id);
        const tertiaryHtml = secondary.children?.length
          ? `<div class="field-chip-grid">${secondary.children
              .map((tertiary) => {
                const tertiarySelected = pendingTopicFieldTags.includes(tertiary.id);
                return `<button class="field-option${tertiarySelected ? " active" : ""}" type="button" data-field-tag="${escapeHtml(tertiary.id)}">${escapeHtml(topicTagLabel(tertiary.id, "short"))}</button>`;
              })
              .join("")}</div>`
          : "";

        return `
          <section class="field-group">
            <div class="field-group-header">
              <button class="field-option field-option-group${secondarySelected ? " active" : ""}" type="button" data-field-tag="${escapeHtml(secondary.id)}">
                ${escapeHtml(topicTagLabel(secondary.id, "short"))}
              </button>
            </div>
            ${tertiaryHtml}
          </section>
        `;
      })
      .join("");
  }

  if (pendingTopicFieldTags.length === 0) {
    topicFieldPendingList.innerHTML = `<p class="empty-inline">${escapeHtml(t("no_tags"))}</p>`;
  } else {
    topicFieldPendingList.innerHTML = pendingTopicFieldTags
      .map(
        (tag) => `
          <button class="tag-chip active removable" type="button" data-pending-tag="${escapeHtml(tag)}">
            <span>${escapeHtml(topicTagLabel(tag))}</span>
            <span class="tag-chip-close">×</span>
          </button>
        `
      )
      .join("");
  }

  topicFieldSelectedCount.textContent = formatCountTemplate("topic_field_selected_count", pendingTopicFieldTags.length);
  confirmTopicFieldSelectionButton.disabled = pendingTopicFieldTags.length === 0;
}

function renderTopicTags() {
  if (topicTags.length === 0) {
    selectedTopicTags.innerHTML = `<p class="empty-inline">${escapeHtml(t("no_tags"))}</p>`;
  } else {
    selectedTopicTags.innerHTML = topicTags
      .map(
        (tag) => `
          <button class="tag-chip active removable" type="button" data-selected-tag="${escapeHtml(tag)}">
            <span>${escapeHtml(topicTagLabel(tag))}</span>
            <span class="tag-chip-close">×</span>
          </button>
        `
      )
      .join("");
  }

  topicTagSuggestions.innerHTML = QUICK_TOPIC_TAG_IDS.map((tag) => {
    const active = topicTags.includes(tag);
    return `<button class="tag-chip${active ? " active" : ""}" type="button" data-suggested-tag="${tag}">${escapeHtml(topicTagLabel(tag, "short"))}</button>`;
  }).join("");

  if (!topicFieldModal.hidden) {
    renderTopicFieldModal();
  }
}

function togglePendingTopicFieldTag(tag: string) {
  if (pendingTopicFieldTags.includes(tag)) {
    pendingTopicFieldTags = pendingTopicFieldTags.filter((item) => item !== tag);
  } else {
    pendingTopicFieldTags = [...pendingTopicFieldTags, tag];
  }

  renderTopicFieldModal();
}

function openTopicFieldModal() {
  if (!topicFieldModalPrimaryId) {
    topicFieldModalPrimaryId = RESEARCH_FIELD_TAXONOMY[0]?.id ?? null;
  }

  pendingTopicFieldTags = [];
  topicFieldModal.hidden = false;
  renderTopicFieldModal();
}

function closeTopicFieldModal() {
  topicFieldModal.hidden = true;
  pendingTopicFieldTags = [];
}

function addTopicTag(tag: string) {
  const normalized = normalizeTopicTag(tag);
  if (!normalized) {
    return;
  }
  if (!topicTags.includes(normalized)) {
    clearManagedResumeBatchOnUserEdit();
    topicTags = [...topicTags, normalized];
    renderTopicTags();
    renderSetupSummary();
    scheduleAutoSave();
  }
}

function removeTopicTag(tag: string) {
  clearManagedResumeBatchOnUserEdit();
  topicTags = topicTags.filter((item) => item !== tag);
  renderTopicTags();
  renderSetupSummary();
  scheduleAutoSave();
}

function composeEffectivePrompt(prompt: string, tags: string[]): string {
  if (!tags.length) {
    return prompt;
  }

  return [
    prompt,
    "",
    "Relevant research fields / directions:",
    ...tags.map((tag) => `- ${topicTagLabel(tag)}`)
  ].join("\n");
}

function currentPresetLabel(presetId: ProviderPresetId): string {
  return t(`preset_${presetId}`);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function currentModelValue(): string {
  return modelInput.value === CUSTOM_MODEL_VALUE ? customModelInput.value.trim() : modelInput.value.trim();
}

function qaModeLabel(qaMode: string | null | undefined): string {
  return qaMode === "cot" ? t("qa_mode_cot") : t("qa_mode_normal");
}

function batchStatusLabel(status: string | null | undefined): string {
  switch (status) {
    case "completed":
      return t("browse_status_completed");
    case "running":
      return t("browse_status_running");
    case "generated":
      return t("browse_status_generated");
    default:
      return t("browse_status_prepared");
  }
}

function isRemoteVirtualBrowseBatch(batchId: string | null | undefined): boolean {
  return batchId === PLATFORM_REMOTE_VIRTUAL_BATCH_SYNTHETIC_ID;
}

function localBrowseBatches(): QaBatchSummary[] {
  return browseBatches.filter((batch) => !isRemoteVirtualBrowseBatch(batch.id));
}

function platformBatchQaMode(
  technicalTypeCode: string | null | undefined,
  fallback: string | null = null
): string | null {
  if (technicalTypeCode === "cot_qa") {
    return "cot";
  }
  if (technicalTypeCode === "direct_qa") {
    return "normal";
  }
  return fallback;
}

function parseTimestampMs(value: string | null | undefined): number | null {
  if (!value) {
    return null;
  }
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : null;
}

function parsePlatformMetadataJson(value: string | null | undefined): Record<string, unknown> {
  if (!value) {
    return {};
  }

  try {
    const parsed = JSON.parse(value) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

function metadataString(metadata: Record<string, unknown>, ...keys: string[]): string {
  for (const key of keys) {
    const value = metadata[key];
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
    if (typeof value === "number" || typeof value === "boolean") {
      return String(value);
    }
  }
  return "";
}

function remoteVirtualBatchPrompt(summary: PlatformImportBatchSummary): string {
  const scope = [summary.applicationName, summary.technicalTypeName].filter(Boolean).join(" · ");
  if (currentLang === "zh") {
    return scope
      ? `远程服务器中未归批次 QA 聚合 · ${scope}`
      : "远程服务器中未归批次 QA 聚合";
  }
  return scope
    ? `Remote server unbatched QA aggregation · ${scope}`
    : "Remote server unbatched QA aggregation";
}

function remoteVirtualBatchToBrowseSummary(summary: PlatformImportBatchSummary): QaBatchSummary {
  const qaMode = platformBatchQaMode(summary.technicalTypeCode);
  return {
    id: PLATFORM_REMOTE_VIRTUAL_BATCH_SYNTHETIC_ID,
    name: summary.name,
    topicName: summary.name,
    prompt: remoteVirtualBatchPrompt(summary),
    qaMode,
    cotSectionHeaders: defaultCotSectionHeadersForLang(currentLang),
    targetCount: summary.totalCount,
    generatedCount: summary.successCount || summary.totalCount,
    keptCount: summary.successCount || summary.totalCount,
    totalCount: summary.totalCount,
    shardCount: null,
    completedShards: 0,
    skippedShards: 0,
    requestCount: null,
    status: "completed",
    provider: null,
    model: null,
    outputDir: "",
    updatedAtMs: parseTimestampMs(summary.createdAt),
    reviewedCount: 0,
    reviewKeptCount: 0,
    discardedCount: 0
  };
}

function mergeBrowseBatches(localBatches: QaBatchSummary[], remoteBatch: QaBatchSummary | null): QaBatchSummary[] {
  const merged = remoteBatch ? [...localBatches, remoteBatch] : [...localBatches];
  return merged.sort((left, right) => {
    const leftTime = left.updatedAtMs ?? 0;
    const rightTime = right.updatedAtMs ?? 0;
    if (leftTime !== rightTime) {
      return rightTime - leftTime;
    }
    return left.id.localeCompare(right.id);
  });
}

function platformImportItemToQaRecordSummary(item: PlatformImportBatchItem): QaRecordSummary {
  const metadata = parsePlatformMetadataJson(item.metadataJson);
  return {
    id: String(item.id),
    question: item.questionText,
    subtopic: metadataString(metadata, "subtopic", "group", "theme"),
    axis: metadataString(metadata, "axis"),
    questionType: metadataString(metadata, "question_type", "questionType"),
    difficulty: metadataString(metadata, "difficulty"),
    audience: metadataString(metadata, "audience"),
    reviewStatus: "unreviewed",
    editedQuestion: null,
    effectiveQuestion: item.questionText
  };
}

function platformImportItemToQaRecordDetail(
  item: PlatformImportBatchItem,
  batch: QaBatchSummary
): QaRecordDetail {
  const metadata = parsePlatformMetadataJson(item.metadataJson);
  const qaMode = platformBatchQaMode(
    metadataString(metadata, "technical_type_code"),
    metadataString(metadata, "qa_mode", "qaMode") || batch.qaMode || "normal"
  );
  return {
    batch,
    item: {
      id: String(item.id),
      shard_id: 0,
      topic_name: metadataString(metadata, "topic_name", "topicName") || batch.topicName || batch.name,
      subtopic: metadataString(metadata, "subtopic", "group", "theme"),
      axis: metadataString(metadata, "axis"),
      question_type: metadataString(metadata, "question_type", "questionType"),
      difficulty: metadataString(metadata, "difficulty"),
      audience: metadataString(metadata, "audience"),
      question: item.questionText,
      answer: item.currentAnswerText?.trim() || "",
      source_type:
        metadataString(metadata, "source_type", "sourceType") || item.source || "remote-server",
      grounding: metadataString(metadata, "grounding", "context", "context_text"),
      provider: metadataString(metadata, "provider") || item.source || "",
      model: metadataString(metadata, "model", "model_name") || item.sourceModel || "",
      qa_mode: qaMode === "cot" ? "cot" : "normal"
    },
    review: {
      status: "unreviewed",
      editedQuestion: null,
      effectiveQuestion: item.questionText,
      updatedAtMs: null
    }
  };
}

function remoteVirtualBrowsePageFromDetail(
  detail: PlatformImportBatchDetail,
  page: number,
  pageSize = 10
): QaRecordPage {
  const batch = remoteVirtualBatchToBrowseSummary(detail.batch);
  const items = detail.items.map((item) => platformImportItemToQaRecordSummary(item));
  const totalItems = items.length;
  const totalPages = totalItems === 0 ? 1 : Math.ceil(totalItems / pageSize);
  const safePage = Math.min(Math.max(page, 1), totalPages);
  const start = (safePage - 1) * pageSize;
  const end = Math.min(start + pageSize, totalItems);
  return {
    batch,
    items: items.slice(start, end),
    page: safePage,
    pageSize,
    totalItems,
    totalPages
  };
}

function canResumeBrowseBatch(batch: QaBatchSummary): boolean {
  return !isRemoteVirtualBrowseBatch(batch.id) && batch.status !== "completed";
}

function browseResumeActionLabel(batch: QaBatchSummary): string {
  return batch.status === "prepared"
    ? t("browse_action_load_generate")
    : t("browse_action_continue_run");
}

function batchPlatformStatusLabel(status: PlatformBatchStatusKind | null | undefined): string {
  switch (status) {
    case "uploaded":
      return t("browse_platform_status_uploaded");
    case "processing":
      return t("browse_platform_status_processing");
    case "parsed":
      return t("browse_platform_status_parsed");
    case "failed":
      return t("browse_platform_status_failed");
    default:
      return "";
  }
}

function currentBrowseBatchPlatformStatus(batchId: string): PlatformImportBatchStatus | null {
  return browsePlatformStatusMap.get(batchId) ?? null;
}

function browseBatchPlatformBadgeHtml(batchId: string): string {
  const status = currentBrowseBatchPlatformStatus(batchId);
  if (!status || status.batchStatus === "missing") {
    return "";
  }
  const label =
    status.batchStatus === "uploaded" ? t("browse_uploaded_badge") : batchPlatformStatusLabel(status.batchStatus);
  return ` <span class="browse-inline-badge">${escapeHtml(label)}</span>`;
}

function reviewStatusLabel(status: ReviewStatus): string {
  switch (status) {
    case "kept":
      return t("browse_review_status_kept");
    case "discarded":
      return t("browse_review_status_discarded");
    default:
      return t("browse_review_status_unreviewed");
  }
}

function reviewStatusBadgeClass(status: ReviewStatus): string {
  switch (status) {
    case "kept":
      return "kept";
    case "discarded":
      return "discarded";
    default:
      return "unreviewed";
  }
}

function browseReviewSummaryLabel(batch: QaBatchSummary): string {
  const total = batch.generatedCount || batch.totalCount;
  return `${t("browse_review_progress")} ${formatCount(batch.reviewedCount)} / ${formatCount(total)} · ${t("browse_review_kept")} ${formatCount(batch.reviewKeptCount)} · ${t("browse_review_discarded")} ${formatCount(batch.discardedCount)}`;
}

function syncProviderFieldVisibility(presetId: ProviderPresetId) {
  providerField.hidden = presetId !== "custom";
}

function syncModelOptions(presetId: ProviderPresetId, preferredModel?: string | null) {
  const resolvedModel = preferredModel?.trim() ?? currentModelValue();
  const preset = presetId === "custom" ? null : PROVIDER_PRESETS[presetId];
  const models = preset?.models ?? [];

  modelInput.replaceChildren();

  // Platform preset: populate from fetched platform models
  const resolved = resolveLLMProvider();
  if (presetId === "platform" || (resolved.mode === "platform" && platformGenerateModels.length > 0)) {
    for (const pm of platformGenerateModels) {
      const option = document.createElement("option");
      option.value = String(pm.id);
      option.textContent = `${pm.name} (${pm.model})`;
      option.dataset.platformModelId = String(pm.id);
      modelInput.append(option);
    }
    if (platformGenerateModels.length > 0) {
      const firstId = String(platformGenerateModels[0].id);
      modelInput.value = resolvedModel && platformGenerateModels.some(m => String(m.id) === resolvedModel) ? resolvedModel : firstId;
      modelInput.dispatchEvent(new Event("change"));
    }
    customModelField.hidden = true;
    return;
  }

  for (const model of models) {
    const option = document.createElement("option");
    option.value = model;
    option.textContent = model;
    modelInput.append(option);
  }

  const customOption = document.createElement("option");
  customOption.value = CUSTOM_MODEL_VALUE;
  customOption.textContent = t("model_custom_option");
  modelInput.append(customOption);

  const shouldUseCustomModel =
    presetId === "custom" || Boolean(resolvedModel && !models.includes(resolvedModel));

  if (shouldUseCustomModel) {
    modelInput.value = CUSTOM_MODEL_VALUE;
    customModelField.hidden = false;
    customModelInput.value = resolvedModel;
    return;
  }

  customModelField.hidden = true;
  customModelInput.value = "";
  modelInput.value = resolvedModel && models.includes(resolvedModel) ? resolvedModel : preset?.defaultModel ?? "";
}

function detectProviderPreset(fields: {
  provider: string;
  baseUrl: string | null;
}): ProviderPresetId {
  const provider = fields.provider.trim();
  const baseUrl = (fields.baseUrl ?? "").trim();

  for (const [presetId, preset] of Object.entries(PROVIDER_PRESETS) as Array<
    [ProviderPresetConfigKey, ProviderPresetConfig]
  >) {
    if (provider === preset.provider && baseUrl === preset.baseUrl) {
      return presetId;
    }
  }

  return "custom";
}

function migrateLegacyStubRequest(request: PipelineFormRequest): PipelineFormRequest {
  const presetId = detectProviderPreset({
    provider: request.provider,
    baseUrl: request.baseUrl
  });
  if (request.provider !== "stub" && presetId !== "stub_local") {
    return request;
  }

  const preset = PROVIDER_PRESETS[FALLBACK_REAL_PROVIDER_PRESET];
  return {
    ...request,
    provider: preset.provider,
    model: preset.defaultModel,
    baseUrl: preset.baseUrl,
    apiKey: null,
    batchSize: preset.batchSize,
    maxInFlight: preset.maxInFlight,
    requestTimeoutSecs: preset.requestTimeoutSecs
  };
}

function normalizeLoadedCotRequest(request: PipelineFormRequest): PipelineFormRequest {
  const normalizedHeaders = (() => {
    const normalized = (request.cotSectionHeaders ?? [])
      .map((value) => value.trim().replace(/:+$/, "").trim())
      .filter(Boolean);
    return normalized.length
      ? normalized
      : defaultCotSectionHeadersForLang(request.outputLanguage ?? currentLang);
  })();
  if (request.qaMode !== "cot") {
    const currentHeaders = request.cotSectionHeaders ?? [];
    return currentHeaders.length === normalizedHeaders.length &&
      currentHeaders.every((value, index) => value === normalizedHeaders[index])
      ? request
      : { ...request, cotSectionHeaders: normalizedHeaders };
  }

  const nextTargetCount = Math.min(request.targetCount || DEFAULT_COT_TARGET_COUNT, COT_TARGET_COUNT_CAP);
  const nextShardSize = Math.min(
    Math.max(request.shardSize || DEFAULT_COT_SHARD_SIZE, 1),
    Math.min(nextTargetCount, COT_SAFE_SHARD_SIZE_CAP)
  );
  const nextBatchSize = DEFAULT_COT_BATCH_SIZE;
  const nextMaxInFlight = DEFAULT_COT_MAX_IN_FLIGHT;

  if (
    nextTargetCount === request.targetCount &&
    nextShardSize === request.shardSize &&
    nextBatchSize === request.batchSize &&
    nextMaxInFlight === request.maxInFlight
  ) {
    return request;
  }

  return {
    ...request,
    cotSectionHeaders: normalizedHeaders,
    targetCount: nextTargetCount,
    shardSize: nextShardSize,
    batchSize: nextBatchSize,
    maxInFlight: nextMaxInFlight
  };
}

async function loadPlatformGenerateModels() {
  const auth = currentPlatformAuthPayload();
  if (!auth) {
    platformGenerateModels = [];
    selectedPlatformModelId = null;
    return;
  }
  try {
    platformGenerateModels = await invoke<PlatformGenerateModel[]>("get_generate_models", auth);
  } catch {
    platformGenerateModels = [];
  }
}

function updatePlatformPresetOption() {
  const opt = document.querySelector<HTMLOptionElement>("#provider-preset-option-platform");
  if (!opt) return;
  // Always keep "platform" hidden as a manual option — it is auto-detected.
  opt.hidden = true;
  // If current preset is "platform" but no longer valid, reset to first available
  const resolved = resolveLLMProvider();
  if (providerPresetInput.value === "platform" && resolved.mode !== "platform") {
    const firstPreset = providerPresetInput.querySelector<HTMLOptionElement>("option:not([hidden]):not([value=platform])");
    if (firstPreset) {
      providerPresetInput.value = firstPreset.value;
      applyProviderPreset(firstPreset.value as ProviderPresetId);
    }
  }
}

function isUsingPlatformModel(): boolean {
  return selectedPlatformModelId !== null && platformLoginState.kind === "success";
}

function currentPlatformGenerateModel(): PlatformGenerateModel | null {
  if (!isUsingPlatformModel()) return null;
  return platformGenerateModels.find(m => m.id === selectedPlatformModelId) ?? null;
}

function syncProviderPresetInput() {
  updatePlatformPresetOption();
  const resolved = resolveLLMProvider();
  let presetId: ProviderPresetId;
  if (resolved.mode === "platform") {
    presetId = "platform";
  } else {
    presetId = detectProviderPreset({
      provider: providerInput.value,
      baseUrl: baseUrlInput.value
    });
  }
  providerPresetInput.value = presetId;
  syncProviderFieldVisibility(presetId);
  syncModelOptions(presetId);
}

function applyProviderPreset(presetId: ProviderPresetId, logChange = false) {
  if (presetId === "custom") {
    providerPresetInput.value = "custom";
    syncProviderFieldVisibility("custom");
    syncModelOptions("custom");
    normalizeRuntimeParameterInputs(true);
    renderSetupSummary();
    return;
  }

  if (presetId === "platform") {
    providerPresetInput.value = "platform";
    syncProviderFieldVisibility("platform");
    syncModelOptions("platform");
    normalizeRuntimeParameterInputs(true);
    renderSetupSummary();
    return;
  }

  const preset = PROVIDER_PRESETS[presetId];
  providerInput.value = preset.provider;
  baseUrlInput.value = preset.baseUrl;
  batchSizeInput.value = String(preset.batchSize);
  maxInFlightInput.value = String(preset.maxInFlight);
  timeoutInput.value = String(preset.requestTimeoutSecs);
  providerPresetInput.value = presetId;
  syncProviderFieldVisibility(presetId);
  syncModelOptions(presetId, preset.defaultModel);
  normalizeRuntimeParameterInputs(true);
  renderSetupSummary();

  if (logChange) {
    appendLog(formatMessage("log_applied_preset", currentPresetLabel(presetId)));
  }
}

function formatCount(value: number): string {
  return new Intl.NumberFormat(currentLang === "zh" ? "zh-CN" : "en-US").format(value);
}

function formatDuration(ms: number | null): string {
  if (ms === null || ms < 0) {
    return t("stats_not_available");
  }

  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  }

  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

function formatRate(itemsPerMinute: number | null): string {
  if (itemsPerMinute === null || !Number.isFinite(itemsPerMinute) || itemsPerMinute <= 0) {
    return t("stats_not_available");
  }

  return currentLang === "zh"
    ? `${formatCount(Math.round(itemsPerMinute))} 条/分钟`
    : `${formatCount(Math.round(itemsPerMinute))} items/min`;
}

function escapeHtml(value: string): string {
  if (value == null || typeof value !== "string") return "";
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;")
    .replaceAll("'", "&#39;");
}

function displayValue(value: string): string {
  return value.trim() ? value : t("empty_value");
}

function renderEmptyCard(message: string) {
  resultCards.innerHTML = `<div class="empty-state">${escapeHtml(message)}</div>`;
}

function renderValidationIssues(issues: ValidationIssueKey[]) {
  resultCards.innerHTML = `
    <article class="result-card wide">
      <p class="result-card-label">${escapeHtml(t("validation_issues"))}</p>
      <ul class="validation-list">
        ${issues.map((issue) => `<li class="validation-item">${escapeHtml(t(issue))}</li>`).join("")}
      </ul>
    </article>
  `;
}

function renderCards(cards: Array<{ labelKey: string; value: string; wide?: boolean }>) {
  resultCards.innerHTML = cards
    .map(
      ({ labelKey, value, wide }) => `
        <article class="result-card${wide ? " wide" : ""}">
          <p class="result-card-label">${escapeHtml(t(labelKey))}</p>
          <p class="result-card-value">${escapeHtml(displayValue(value))}</p>
        </article>
      `
    )
    .join("");
}

function renderActionButtons(actions: Array<{ key: string; action: string }>) {
  if (!actions.length) {
    resultActions.innerHTML = "";
    return;
  }

  resultActions.innerHTML = `
    <p class="result-actions-title">${escapeHtml(t("result_actions"))}</p>
    <div class="result-action-list">
      ${actions
        .map(
          ({ key, action }) =>
            `<button class="action-button" type="button" data-result-action="${escapeHtml(action)}">${escapeHtml(t(key))}</button>`
        )
        .join("")}
    </div>
  `;
}

function renderSetupSummary() {
  const resolved = resolveLLMProvider();
  const providerReady = resolved.mode !== "none";
  const modelReady = resolved.model.length > 0;
  const requiresEndpointAuth = resolved.mode === "settings";
  const baseUrlReady = !requiresEndpointAuth || resolved.baseUrl.length > 0;
  const apiKeyReady = !requiresEndpointAuth || resolved.apiKey.length > 0;
  const connectionReady = !requiresEndpointAuth || (baseUrlReady && apiKeyReady);
  const providerLabel = providerReady
    ? (resolved.mode === "platform"
        ? t("preset_platform")
        : providerPresetInput.value === "custom"
          ? providerInput.value.trim() || t("empty_value")
          : currentPresetLabel(providerPresetInput.value as ProviderPresetId))
    : "";
  const missingKeys: string[] = [];

  if (!providerReady) {
    missingKeys.push("settings_checklist_missing_provider");
  }
  if (!modelReady) {
    missingKeys.push("settings_checklist_missing_model");
  }
  if (requiresEndpointAuth && !baseUrlReady) {
    missingKeys.push("settings_checklist_missing_base_url");
  }
  if (requiresEndpointAuth && !apiKeyReady) {
    missingKeys.push("settings_checklist_missing_api_key");
  }

  const missingLabels = missingKeys.map((key) => t(key)).join(currentLang === "zh" ? "、" : ", ");
  const connectionMissingKeys = missingKeys.filter((key) =>
    ["settings_checklist_missing_base_url", "settings_checklist_missing_api_key"].includes(key)
  );
  const connectionMissingLabels = connectionMissingKeys
    .map((key) => t(key))
    .join(currentLang === "zh" ? "、" : ", ");
  const items = [
    {
      label: t("settings_checklist_provider"),
      status: providerReady,
      detail: providerReady
        ? formatMessage("settings_checklist_provider_ready", providerLabel)
        : t("settings_checklist_provider_pending")
    },
    {
      label: t("settings_checklist_model"),
      status: modelReady,
      detail: modelReady
        ? formatMessage("settings_checklist_model_ready", currentModelValue())
        : t("settings_checklist_model_pending")
    },
    {
      label: t("settings_checklist_connection"),
      status: connectionReady,
      detail: !requiresEndpointAuth
        ? t("settings_checklist_connection_not_required")
        : connectionReady
          ? t("settings_checklist_connection_ready")
          : formatMessage("settings_checklist_connection_pending", connectionMissingLabels)
    },
    {
      label: t("settings_checklist_ready"),
      status: missingKeys.length === 0,
      detail:
        missingKeys.length === 0
          ? t("settings_checklist_ready_done")
          : formatMessage("settings_checklist_ready_pending", missingLabels)
    }
  ];

  updateRunButtonUi();
}

function resetRunStats() {
  runStats = {
    startedAtMs: null,
    lastUpdatedAtMs: null,
    generatedCount: 0,
    targetCount: null,
    shardIndex: null,
    shardCount: null,
    completedBatchCount: 0,
    estimatedBatchCount: null,
    completedShardCount: 0,
    skippedShardCount: 0,
    retryCount: 0,
    failedBatchCount: 0,
    samples: []
  };
}

function beginRunStats(request: PipelineFormRequest) {
  const startedAtMs = Date.now();
  runStats = {
    startedAtMs,
    lastUpdatedAtMs: startedAtMs,
    generatedCount: 0,
    targetCount: request.targetCount,
    shardIndex: null,
    shardCount: request.shardSize > 0 ? Math.ceil(request.targetCount / request.shardSize) : null,
    completedBatchCount: 0,
    estimatedBatchCount:
      request.batchSize > 0 ? Math.ceil(request.targetCount / request.batchSize) : null,
    completedShardCount: 0,
    skippedShardCount: 0,
    retryCount: 0,
    failedBatchCount: 0,
    samples: [{ atMs: startedAtMs, generatedCount: 0 }]
  };
}

function stopRunStatsTicker() {
  if (runStatsTimer !== null) {
    window.clearInterval(runStatsTimer);
    runStatsTimer = null;
  }
}

function startRunStatsTicker() {
  stopRunStatsTicker();
  runStatsTimer = window.setInterval(() => {
    renderRunStats();
  }, 1000);
}

function updateRunStatsFromEvent(payload: PipelineProgressEvent) {
  const now = Date.now();
  if (runStats.startedAtMs === null) {
    runStats.startedAtMs = now;
  }

  runStats.lastUpdatedAtMs = now;
  if (payload.targetCount !== null && payload.targetCount !== undefined) {
    runStats.targetCount = payload.targetCount;
  }
  if (payload.totalGenerated !== null && payload.totalGenerated !== undefined) {
    runStats.generatedCount = payload.totalGenerated;
  }
  if (payload.shardIndex !== null && payload.shardIndex !== undefined) {
    runStats.shardIndex = payload.shardIndex;
  }
  if (payload.shardCount !== null && payload.shardCount !== undefined) {
    runStats.shardCount = payload.shardCount;
  }

  if (payload.runtimeKind === "batch_completed") {
    runStats.completedBatchCount += 1;
  } else if (payload.runtimeKind === "shard_completed") {
    runStats.completedShardCount += 1;
  } else if (payload.runtimeKind === "shard_skipped") {
    runStats.skippedShardCount += 1;
  } else if (payload.runtimeKind === "batch_retry") {
    runStats.retryCount += 1;
  } else if (payload.runtimeKind === "batch_failed") {
    runStats.failedBatchCount += 1;
  }

  if (
    runStats.samples.length === 0 ||
    runStats.samples[runStats.samples.length - 1]?.generatedCount !== runStats.generatedCount
  ) {
    runStats.samples.push({ atMs: now, generatedCount: runStats.generatedCount });
  }

  runStats.samples = runStats.samples.filter((sample) => now - sample.atMs <= 5 * 60 * 1000);
}

function renderRunStats() {
  const now = Date.now();
  const startedAtMs = runStats.startedAtMs;
  const elapsedMs = startedAtMs === null ? null : now - startedAtMs;
  const totalGenerated = runStats.generatedCount;
  const totalTarget = runStats.targetCount;
  const avgRatePerMinute =
    startedAtMs !== null && elapsedMs !== null && elapsedMs > 0
      ? (totalGenerated / elapsedMs) * 60_000
      : null;

  const recentWindowStart = now - 60_000;
  const recentSample = [...runStats.samples]
    .reverse()
    .find((sample) => sample.atMs <= recentWindowStart) ?? runStats.samples[0] ?? null;
  const currentRatePerMinute =
    recentSample && recentSample.atMs < now
      ? ((totalGenerated - recentSample.generatedCount) / (now - recentSample.atMs)) * 60_000
      : avgRatePerMinute;
  const remainingCount =
    totalTarget !== null && totalTarget >= totalGenerated ? totalTarget - totalGenerated : null;
  const etaMs =
    remainingCount !== null &&
    currentRatePerMinute !== null &&
    currentRatePerMinute > 0 &&
    remainingCount > 0
      ? (remainingCount / currentRatePerMinute) * 60_000
      : remainingCount === 0
        ? 0
        : null;

  const generatedProgress =
    totalTarget !== null
      ? `${formatCount(totalGenerated)} / ${formatCount(totalTarget)}`
      : totalGenerated > 0
        ? formatCount(totalGenerated)
        : t("stats_idle");
  const shardCompleted = runStats.completedShardCount + runStats.skippedShardCount;
  const shardProgress =
    runStats.shardCount !== null
      ? `${formatCount(shardCompleted)} / ${formatCount(runStats.shardCount)}`
      : runStats.shardIndex !== null
        ? formatCount(runStats.shardIndex)
        : t("stats_idle");

  const cards = [
    { label: t("stats_elapsed"), value: startedAtMs === null ? t("stats_idle") : formatDuration(elapsedMs) },
    { label: t("stats_current_speed"), value: formatRate(currentRatePerMinute) },
    { label: t("stats_eta"), value: formatDuration(etaMs) },
    { label: t("stats_generated_progress"), value: generatedProgress },
    { label: t("stats_shard_progress"), value: shardProgress },
    ...(runStats.retryCount > 0
      ? [{ label: t("stats_retry_count"), value: formatCount(runStats.retryCount) }]
      : []),
    ...(runStats.failedBatchCount > 0
      ? [{ label: t("stats_failed_requests"), value: formatCount(runStats.failedBatchCount) }]
      : [])
  ];

  runStatsGrid.innerHTML = cards
    .map(
      (card) => `
        <article class="run-stat-card">
          <p class="run-stat-label">${escapeHtml(card.label)}</p>
          <p class="run-stat-value">${escapeHtml(card.value)}</p>
        </article>
      `
    )
    .join("");
}

function currentBrowseBatch(): QaBatchSummary | null {
  return (
    browseBatches.find((batch) => batch.id === browseSelectedBatchId) ??
    browsePageData?.batch ??
    browseDetailData?.batch ??
    null
  );
}

function currentBrowseReviewItem(): QaRecordSummary | null {
  return browseReviewItems[browseReviewIndex] ?? null;
}

function currentBrowseReviewDraft(): string {
  const item = currentBrowseReviewItem();
  if (!item) {
    return "";
  }
  return browseReviewDrafts.get(item.id) ?? item.effectiveQuestion;
}

function moveToNextBrowseReviewItem() {
  if (browseReviewIndex < browseReviewItems.length - 1) {
    browseReviewIndex += 1;
  }
}

function updateBrowseBatchReviewSummary(
  batchId: string,
  summary: { reviewedCount: number; keptCount: number; discardedCount: number }
) {
  browseBatches = browseBatches.map((batch) =>
    batch.id === batchId
      ? {
          ...batch,
          reviewedCount: summary.reviewedCount,
          reviewKeptCount: summary.keptCount,
          discardedCount: summary.discardedCount
        }
      : batch
  );
  if (browsePageData?.batch.id === batchId) {
    browsePageData = {
      ...browsePageData,
      batch: {
        ...browsePageData.batch,
        reviewedCount: summary.reviewedCount,
        reviewKeptCount: summary.keptCount,
        discardedCount: summary.discardedCount
      }
    };
  }
  if (browseDetailData?.batch.id === batchId) {
    browseDetailData = {
      ...browseDetailData,
      batch: {
        ...browseDetailData.batch,
        reviewedCount: summary.reviewedCount,
        reviewKeptCount: summary.keptCount,
        discardedCount: summary.discardedCount
      }
    };
  }
}

function applyBrowseReviewUpdate(
  batchId: string,
  qaId: string,
  response: SaveBatchReviewItemResponse
) {
  updateBrowseBatchReviewSummary(batchId, response.summary);
  browseReviewItems = browseReviewItems.map((item) =>
    item.id === qaId
      ? {
          ...item,
          reviewStatus: response.review.status,
          editedQuestion: response.review.editedQuestion,
          effectiveQuestion: response.review.effectiveQuestion
        }
      : item
  );
  browsePageData =
    browsePageData && browsePageData.batch.id === batchId
      ? {
          ...browsePageData,
          items: browsePageData.items.map((item) =>
            item.id === qaId
              ? {
                  ...item,
                  reviewStatus: response.review.status,
                  editedQuestion: response.review.editedQuestion,
                  effectiveQuestion: response.review.effectiveQuestion
                }
              : item
          )
        }
      : browsePageData;
  browseDetailData =
    browseDetailData && browseDetailData.batch.id === batchId && browseDetailData.item.id === qaId
      ? {
          ...browseDetailData,
          review: response.review
        }
      : browseDetailData;
  browseReviewDrafts.set(qaId, response.review.effectiveQuestion);
}

function clearBrowseRemoteVirtualBatch() {
  browseRemoteVirtualBatch = null;
  browseRemoteVirtualBatchDetail = null;
}

function currentQaPlatformUrl(): string {
  const host = qaPlatformDevInput?.checked ? "127.0.0.1" : "182.92.166.143";
  return `http://${host}:8100`;
}

function currentManagedOutputRoot(): string {
  return outputRootInput.value.trim();
}

function hasQaPlatformCredentials(): boolean {
  return Boolean(qaPlatformUsernameInput.value.trim() && qaPlatformPasswordInput.value.trim());
}

function currentPlatformEndpoints(): PlatformEndpoints | null {
  if (platformLoginState.kind === "success") {
    return platformLoginState.response.endpoints;
  }
  if (platformHealthState.kind === "success") {
    return platformHealthState.response.endpoints;
  }
  return null;
}

function currentPlatformOpenUrl(kind: "qa-evaluate" | "model-trial"): string | null {
  const endpoints = currentPlatformEndpoints();
  if (!endpoints) {
    return null;
  }
  if (kind === "model-trial") {
    return `${endpoints.platformWebBaseUrl}/expert/model-trial`;
  }
  return `${endpoints.platformWebBaseUrl}/expert`;
}

function resetModelTrialState() {
  modelTrialWorkspaceLoading = false;
  modelTrialDetailLoading = false;
  modelTrialCreating = false;
  modelTrialSending = false;
  modelTrialDeletingSessionId = null;
  modelTrialConfigs = [];
  modelTrialSessions = [];
  modelTrialDetail = null;
  modelTrialSelectedConfigId = null;
  modelTrialSelectedSessionId = null;
  modelTrialComposer = "";
  modelTrialErrorMessage = null;
  modelTrialNoticeMessage = null;
  modelTrialLocalBatches = [];
  modelTrialSelectedBatchId = null;
  modelTrialLocalQuestions = [];
  modelTrialSelectedQuestionId = null;
  modelTrialLocalQuestionDetail = null;
  modelTrialLocalQuestionsLoading = false;
}

function resetPlatformIntegrationState() {
  platformHealthState = { kind: "idle" };
  platformLoginState = { kind: "idle" };
  clearBrowsePlatformStatuses();
  clearBrowseRemoteVirtualBatch();
  resetModelTrialState();
}

function currentModelTrialSelectedQuestion(): QaRecordSummary | null {
  if (!modelTrialSelectedQuestionId) {
    return null;
  }
  return modelTrialLocalQuestions.find((item) => item.id === modelTrialSelectedQuestionId) ?? null;
}

function currentModelTrialSelectedConfig(): TrialLlmConfigOption | null {
  return modelTrialConfigs.find((item) => item.id === modelTrialSelectedConfigId) ?? null;
}

function formatPlatformTime(value: string | null | undefined): string {
  if (!value) {
    return t("empty_value");
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return new Intl.DateTimeFormat(currentLang === "zh" ? "zh-CN" : "en-US", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  }).format(date);
}

function renderPlatformStateBlock(state: typeof platformHealthState | typeof platformLoginState, kind: "health" | "login"): string {
  if (state.kind === "loading") {
    return `<div class="platform-state-card"><p class="platform-state-value">${escapeHtml(
      kind === "health" ? t("platform_health_checking") : t("platform_login_checking")
    )}</p></div>`;
  }
  if (state.kind === "error") {
    return `<div class="platform-state-card error"><p class="platform-state-value">${escapeHtml(state.message)}</p></div>`;
  }
  if (state.kind === "success") {
    if (kind === "health") {
      return `
        <div class="platform-state-card success">
          <p class="platform-state-label">${escapeHtml(t("platform_web_base"))}</p>
          <p class="platform-state-value">${escapeHtml(state.response.endpoints.platformWebBaseUrl)}</p>
          <p class="platform-state-label">${escapeHtml(t("platform_api_base"))}</p>
          <p class="platform-state-value">${escapeHtml(state.response.endpoints.platformApiBaseUrl)}</p>
        </div>
      `;
    }
    const loginResponse = state.response as PlatformLoginResponse;
    const apps = loginResponse.user.applications.length
      ? loginResponse.user.applications.map((item) => item.name).join(" / ")
      : t("platform_no_application");
    return `
      <div class="platform-state-card success">
        <p class="platform-state-label">${escapeHtml(t("platform_current_user"))}</p>
        <p class="platform-state-value">${escapeHtml(loginResponse.user.username)}</p>
        <p class="platform-state-label">${escapeHtml(t("platform_application"))}</p>
        <p class="platform-state-value">${escapeHtml(apps)}</p>
      </div>
    `;
  }
  return `<div class="platform-state-card"><p class="platform-state-value">${escapeHtml(
    kind === "health" ? t("platform_health_idle") : t("platform_login_idle")
  )}</p></div>`;
}

function renderQaEvaluatePanel() {
  const platformUrl = currentQaPlatformUrl() || DEFAULT_QA_PLATFORM_URL;
  const qaOpenUrl = currentPlatformOpenUrl("qa-evaluate");
  const bannerHtml =
    platformLoginState.kind === "error"
      ? `<div class="platform-inline-banner error">${escapeHtml(platformLoginState.message)}</div>`
      : platformLoginState.kind === "success"
        ? `<div class="platform-inline-banner success">${escapeHtml(
            `${t("platform_login_ok")} ${platformLoginState.response.user.username}`
          )}</div>`
        : "";

  qaEvaluatePanel.innerHTML = `
    <div class="model-trial-topbar">
      <div class="model-trial-topbar-item">
        <span class="platform-card-label">${escapeHtml(t("qa_platform_url"))}</span>
        <span class="platform-card-value">${escapeHtml(platformUrl)}</span>
      </div>
      <div class="model-trial-topbar-item">
        <span class="platform-card-label">${escapeHtml(t("platform_current_user"))}</span>
        <span class="platform-card-value">${escapeHtml(
          platformLoginState.kind === "success"
            ? platformLoginState.response.user.username
            : qaPlatformUsernameInput.value.trim() || t("empty_value")
        )}</span>
      </div>
      <div class="model-trial-topbar-item">
        <span class="platform-card-label">${escapeHtml(t("platform_action_check"))}</span>
        <div class="model-trial-topbar-check">
          <span class="platform-card-value">${escapeHtml(
            platformHealthState.kind === "success"
              ? t("platform_health_ok")
              : platformHealthState.kind === "error"
                ? t("platform_health_failed")
                : platformHealthState.kind === "loading"
                  ? t("platform_health_checking")
                  : t("platform_health_idle")
          )}</span>
          <button type="button" class="secondary" data-platform-action="health">${escapeHtml(t("platform_action_check"))}</button>
        </div>
      </div>
    </div>
    ${bannerHtml}
    <section class="platform-workbench-panel">
      <div class="title-with-meta">
        <p class="section-title">${escapeHtml(t("tab_qa_evaluate"))}</p>
        <p class="model-trial-source-meta">${escapeHtml(t("qa_evaluate_tab_copy"))}</p>
      </div>
      <div class="platform-actions">
        <button type="button" class="secondary" data-platform-action="login">${escapeHtml(t("platform_action_login"))}</button>
        <button type="button" data-platform-action="open-qa" ${qaOpenUrl ? "" : "disabled"}>${escapeHtml(t("platform_action_open_qa"))}</button>
      </div>
    </section>
  `;
}

function renderModelTrialPanel() {
  const platformUrl = currentQaPlatformUrl() || DEFAULT_QA_PLATFORM_URL;
  const hasSettings = Boolean(currentQaPlatformUrl() && hasQaPlatformCredentials());
  const selectedConfig = currentModelTrialSelectedConfig();
  const selectedQuestion = currentModelTrialSelectedQuestion();
  const selectedBatch =
    modelTrialLocalBatches.find((item) => item.id === modelTrialSelectedBatchId) ?? null;
  const sourceMeta = selectedBatch
    ? `${t("model_trial_source_local")}: ${selectedBatch.topicName || selectedBatch.name}`
    : "";

  const sessionListHtml = modelTrialSessions.length
    ? modelTrialSessions
        .map((session) => {
          const selected = session.id === modelTrialSelectedSessionId;
          const sessionMeta = [session.llmConfigName || session.llmModelName, formatPlatformTime(session.updatedAt)]
            .filter(Boolean)
            .join(" / ");
          return `
            <article class="model-trial-session${selected ? " active" : ""}">
              <button
                type="button"
                class="model-trial-session-main"
                data-model-trial-action="select-session"
                data-session-id="${session.id}"
              >
                <span class="model-trial-session-title">${escapeHtml(session.title)}</span>
                <span class="model-trial-session-meta">${escapeHtml(sessionMeta)}</span>
              </button>
              <div class="model-trial-session-actions">
                <span class="model-trial-status-pill">${escapeHtml(session.status)}</span>
                <button
                  type="button"
                  class="browse-mini-button browse-mini-button-danger"
                  data-model-trial-action="delete-session"
                  data-session-id="${session.id}"
                  ${modelTrialDeletingSessionId === session.id ? "disabled" : ""}
                >${escapeHtml(
                  modelTrialDeletingSessionId === session.id
                    ? t("model_trial_delete_busy")
                    : t("model_trial_delete")
                )}</button>
              </div>
            </article>
          `;
        })
        .join("")
    : `<div class="empty-state compact">${escapeHtml(
        modelTrialWorkspaceLoading ? t("model_trial_loading") : t("model_trial_empty_sessions")
      )}</div>`;

  const messagesHtml = modelTrialDetail?.messages.length
    ? modelTrialDetail.messages
        .map(
          (item) => `
            <article class="model-trial-message ${item.role === "assistant" ? "assistant" : "user"}">
              <div class="model-trial-message-meta">
                <span>${escapeHtml(
                  item.role === "assistant" ? t("model_trial_message_assistant") : t("model_trial_message_user")
                )}</span>
                <span>${escapeHtml(formatPlatformTime(item.createdAt))}</span>
              </div>
              <pre class="model-trial-message-body">${escapeHtml(item.content)}</pre>
            </article>
          `
        )
        .join("")
    : `<div class="empty-state compact">${escapeHtml(
        modelTrialDetailLoading ? t("model_trial_loading") : t("model_trial_message_empty")
      )}</div>`;

  const bannerHtml = modelTrialErrorMessage
    ? `<div class="platform-inline-banner error">${escapeHtml(modelTrialErrorMessage)}</div>`
    : modelTrialNoticeMessage
      ? `<div class="platform-inline-banner success">${escapeHtml(modelTrialNoticeMessage)}</div>`
      : "";

  modelTrialPanel.innerHTML = `
    <div class="model-trial-topbar">
      <div class="model-trial-topbar-item">
        <span class="platform-card-label">${escapeHtml(t("qa_platform_url"))}</span>
        <span class="platform-card-value">${escapeHtml(platformUrl)}</span>
      </div>
      <div class="model-trial-topbar-item">
        <span class="platform-card-label">${escapeHtml(t("platform_current_user"))}</span>
        <span class="platform-card-value">${escapeHtml(
          platformLoginState.kind === "success"
            ? platformLoginState.response.user.username
            : qaPlatformUsernameInput.value.trim() || t("empty_value")
        )}</span>
      </div>
      <div class="model-trial-topbar-item">
        <span class="platform-card-label">${escapeHtml(t("platform_action_check"))}</span>
        <div class="model-trial-topbar-check">
          <span class="platform-card-value">${escapeHtml(
            platformHealthState.kind === "success"
              ? t("platform_health_ok")
              : platformHealthState.kind === "error"
                ? t("platform_health_failed")
                : platformHealthState.kind === "loading"
                  ? t("platform_health_checking")
                  : t("platform_health_idle")
          )}</span>
          <button type="button" class="secondary" data-platform-action="health">${escapeHtml(t("platform_action_check"))}</button>
        </div>
      </div>
    </div>
    ${bannerHtml}
    ${
      hasSettings
        ? `
          <div class="model-trial-layout">
            <aside class="model-trial-sidebar">
              <div class="model-trial-sidebar-header">
                <p class="section-title">${escapeHtml(t("model_trial_session_list"))}</p>
                <button
                  type="button"
                  class="secondary"
                  data-model-trial-action="create-session"
                  ${modelTrialCreating || !selectedConfig ? "disabled" : ""}
                >${escapeHtml(t("platform_action_create_trial"))}</button>
              </div>
              <div class="model-trial-session-list">${sessionListHtml}</div>
            </aside>
            <section class="model-trial-main">
              <div class="model-trial-controls">
                <label class="model-trial-field">
                  <span>${escapeHtml(t("model_trial_select_model"))}</span>
                  <select id="model-trial-config-select">
                    <option value="">${escapeHtml(t("model_trial_need_model"))}</option>
                    ${modelTrialConfigs
                      .map(
                        (config) => `
                          <option value="${config.id}" ${config.id === modelTrialSelectedConfigId ? "selected" : ""}>
                            ${escapeHtml(`${config.name} / ${config.modelName}`)}
                          </option>
                        `
                      )
                      .join("")}
                  </select>
                </label>
                <label class="model-trial-field">
                  <span>${escapeHtml(t("model_trial_select_batch"))}</span>
                  <select id="model-trial-batch-select">
                    <option value="">${escapeHtml(t("model_trial_select_batch_empty"))}</option>
                    ${modelTrialLocalBatches
                      .map(
                        (batch) => `
                          <option value="${escapeHtml(batch.id)}" ${batch.id === modelTrialSelectedBatchId ? "selected" : ""}>
                            ${escapeHtml(batch.topicName || batch.name)}
                          </option>
                        `
                      )
                      .join("")}
                  </select>
                </label>
                <label class="model-trial-field">
                  <span>${escapeHtml(t("model_trial_select_question"))}</span>
                  <select id="model-trial-question-select" ${modelTrialSelectedBatchId ? "" : "disabled"}>
                    <option value="">${escapeHtml(
                      modelTrialSelectedBatchId
                        ? modelTrialLocalQuestionsLoading
                          ? t("model_trial_loading")
                          : t("model_trial_select_question_empty")
                        : t("model_trial_select_question_empty")
                    )}</option>
                    ${modelTrialLocalQuestions
                      .map(
                        (question) => `
                          <option value="${escapeHtml(question.id)}" ${question.id === modelTrialSelectedQuestionId ? "selected" : ""}>
                            ${escapeHtml(truncateText(question.question, 90))}
                          </option>
                        `
                      )
                      .join("")}
                  </select>
                </label>
                <div class="model-trial-meta-cards">
                  <div class="version-badge">${escapeHtml(
                    `${t("model_trial_user_badge")} ${platformLoginState.kind === "success" ? platformLoginState.response.user.username : t("empty_value")}`
                  )}</div>
                  <div class="version-badge">${escapeHtml(
                    `${t("model_trial_model_badge")} ${selectedConfig?.modelName || modelTrialDetail?.session.llmModelName || t("empty_value")}`
                  )}</div>
                </div>
              </div>
              <section class="model-trial-source-panel">
                <div class="title-with-meta">
                  <p class="section-title">${escapeHtml(t("model_trial_source_card"))}</p>
                  ${sourceMeta ? `<p class="model-trial-source-meta">${escapeHtml(sourceMeta)}</p>` : ""}
                </div>
                ${
                  modelTrialLocalQuestionDetail
                    ? `
                      <p class="model-trial-source-question">${escapeHtml(modelTrialLocalQuestionDetail.item.question)}</p>
                      ${
                        modelTrialLocalQuestionDetail.item.answer
                          ? `<p class="model-trial-source-answer">${escapeHtml(modelTrialLocalQuestionDetail.item.answer)}</p>`
                          : ""
                      }
                    `
                    : modelTrialDetail?.source
                      ? `
                          <p class="model-trial-source-question">${escapeHtml(modelTrialDetail.source.questionText)}</p>
                          ${
                            modelTrialDetail.source.answerText
                              ? `<p class="model-trial-source-answer">${escapeHtml(modelTrialDetail.source.answerText)}</p>`
                              : ""
                          }
                        `
                      : `<div class="empty-state compact">${escapeHtml(t("model_trial_source_none"))}</div>`
                }
              </section>
              <section class="model-trial-chat-panel">
                <div class="title-with-meta">
                  <p class="section-title">${escapeHtml(t("model_trial_conversation"))}</p>
                  ${
                    modelTrialDetail?.session
                      ? `<p class="model-trial-chat-meta">${escapeHtml(
                          `${modelTrialDetail.session.title} · ${formatPlatformTime(modelTrialDetail.session.updatedAt)}`
                        )}</p>`
                      : ""
                  }
                </div>
                <div class="model-trial-message-list">${messagesHtml}</div>
                <div class="model-trial-composer">
                  <textarea id="model-trial-composer" placeholder="${escapeHtml(
                    t("model_trial_input_placeholder")
                  )}">${escapeHtml(modelTrialComposer)}</textarea>
                  <div class="model-trial-composer-actions">
                    <button
                      type="button"
                      data-model-trial-action="send-message"
                      ${modelTrialSending || modelTrialCreating || !selectedConfig ? "disabled" : ""}
                    >${escapeHtml(t("platform_action_send_trial"))}</button>
                  </div>
                </div>
              </section>
            </section>
          </div>
        `
        : `<div class="empty-state">${escapeHtml(t("model_trial_settings_required"))}</div>`
    }
  `;
}

function renderPlatformPanels() {
  try { renderQaEvaluatePanel(); } catch (e) { appendLog(`renderQaEvaluatePanel: ${String(e)}`); }
  try { renderModelTrialPanel(); } catch (e) { appendLog(`renderModelTrialPanel: ${String(e)}`); }
  try { renderPlatformAccountCard(); } catch (e) { appendLog(`renderPlatformAccountCard: ${String(e)}`); }
  try { updatePlatformStatusBadge(); } catch (e) { appendLog(`updatePlatformStatusBadge: ${String(e)}`); }
  // Load platform models after login state change
  void loadPlatformGenerateModels().then(() => {
    try {
      updatePlatformPresetOption();
      syncProviderPresetInput();
      renderSetupSummary();
    } catch (e) { appendLog(`loadPlatformGenerateModels.then: ${String(e)}`); }
  });
}

function updatePlatformStatusBadge() {
  if (!platformStatusBadge) return;
  if (platformLoginState.kind === "success") {
    platformStatusBadge.className = "platform-status-badge connected";
    platformStatusBadge.textContent = platformLoginState.response.user.username;
  } else if (platformLoginState.kind === "loading") {
    platformStatusBadge.className = "platform-status-badge checking";
    platformStatusBadge.textContent = "...";
  } else if (platformLoginState.kind === "error") {
    platformStatusBadge.className = "platform-status-badge error";
    platformStatusBadge.textContent = "✕";
  } else {
    platformStatusBadge.className = "platform-status-badge";
    platformStatusBadge.textContent = "○";
  }
  // Also sync the in-settings login status
  if (platformLoginStatus) {
    if (platformLoginState.kind === "success") {
      platformLoginStatus.className = "platform-login-status connected";
      platformLoginStatus.textContent = `${t("platform_login_ok")} ${platformLoginState.response.user.username}`;
    } else if (platformLoginState.kind === "loading") {
      platformLoginStatus.className = "platform-login-status checking";
      platformLoginStatus.textContent = t("platform_login_checking");
    } else if (platformLoginState.kind === "error") {
      platformLoginStatus.className = "platform-login-status error";
      platformLoginStatus.textContent = `${t("platform_login_failed")}: ${platformLoginState.message}`;
    } else {
      platformLoginStatus.className = "platform-login-status";
      platformLoginStatus.textContent = t("platform_login_idle");
    }
  }
}

function renderPlatformAccountCard() {
  const card = document.querySelector<HTMLElement>("#platform-account-card");
  if (!card) return;

  if (platformLoginState.kind !== "success") {
    card.innerHTML = `
      <div class="platform-account-card disconnected">
        <p class="platform-account-status">${escapeHtml(t("platform_login_idle"))}</p>
      </div>`;
    return;
  }

  const user = platformLoginState.response.user;
  card.innerHTML = `
    <div class="platform-account-card connected">
      <div class="platform-account-row">
        <span class="platform-account-label">${escapeHtml(t("platform_current_user"))}</span>
        <span class="platform-account-value">${escapeHtml(user.username)}</span>
      </div>
      <div class="platform-account-actions">
        <button type="button" class="secondary" id="password-change-toggle">${escapeHtml(t("platform_action_change_password"))}</button>
        <button type="button" class="secondary" id="platform-logout-button">${escapeHtml(t("platform_action_logout"))}</button>
      </div>
    </div>`;

  card.querySelector("#password-change-toggle")?.addEventListener("click", () => {
    const container = document.querySelector<HTMLElement>("#password-change-form-container");
    if (container) {
      container.hidden = !container.hidden;
      if (!container.hidden) {
        passwordChangeState = { kind: "idle" };
        renderPasswordChangeForm();
      }
    }
  });

  card.querySelector("#platform-logout-button")?.addEventListener("click", async () => {
    const auth = currentPlatformAuthPayload();
    if (!auth) return;
    try {
      await invoke("logout_platform", auth);
    } catch { /* ignore */ }
    platformLoginState = { kind: "idle" };
    renderPlatformPanels();
  });
}

// ---- v0.1.8: Recent updates & feedback ----

function renderRecentUpdatesPanel() {
  if (!recentUpdatesPanel) return;

  const isConnected = platformLoginState.kind === "success";

  if (!isConnected) {
    recentUpdatesPanel.innerHTML = `
      <div class="recent-updates-disconnected">
        <p>${escapeHtml(t("recent_updates_disconnected"))}</p>
      </div>`;
    return;
  }

  const overview = dashboardOverviewState;
  const exportsStats = exportsStatsState;
  const changelog = modelChangelogState;
  const news = platformNewsState;

  const overviewHtml = overview.kind === "loading" ? `
    <div class="recent-updates-card">
      <div class="recent-updates-loading">${currentLang === "zh" ? "加载中" : "Loading"}...</div>
    </div>` : overview.kind === "error" ? `
    <div class="recent-updates-card error">
      <p>${escapeHtml(overview.message)}</p>
    </div>` : overview.kind === "success" ? `
    <div class="recent-updates-card">
      <div class="recent-updates-stats">
        <div class="stat-item">
          <span class="stat-value">${overview.data.todayQas}</span>
          <span class="stat-label">${escapeHtml(t("recent_updates_today_qa"))}</span>
        </div>
        <div class="stat-item">
          <span class="stat-value">${overview.data.weekQas}</span>
          <span class="stat-label">${escapeHtml(t("recent_updates_week_qa"))}</span>
        </div>
      </div>
      <div class="recent-updates-refresh">
        <span class="stat-label">${escapeHtml(t("recent_updates_last_refresh"))}: ${escapeHtml(formatTimestamp(recentUpdatesLastRefreshTime))}</span>
      </div>
    </div>` : "";

  const weeklyHtml = exportsStats.kind === "loading" ? `
    <div class="recent-updates-card">
      <h3>${currentLang === "zh" ? "周 QA 趋势" : "Weekly QA Trend"}</h3>
      <div class="recent-updates-loading">${currentLang === "zh" ? "加载中" : "Loading"}...</div>
    </div>` : exportsStats.kind === "error" ? `
    <div class="recent-updates-card error">
      <h3>${currentLang === "zh" ? "周 QA 趋势" : "Weekly QA Trend"}</h3>
      <p>${escapeHtml(exportsStats.message)}</p>
    </div>` : exportsStats.kind === "success" ? renderWeeklyStats(exportsStats.data) : "";

  const changelogHtml = changelog.kind === "loading" ? `
    <div class="recent-updates-card">
      <h3>${escapeHtml(t("recent_updates_model_changes"))}</h3>
      <div class="recent-updates-loading">${currentLang === "zh" ? "加载中" : "Loading"}...</div>
    </div>` : changelog.kind === "error" ? `
    <div class="recent-updates-card error">
      <h3>${escapeHtml(t("recent_updates_model_changes"))}</h3>
      <p>${escapeHtml(changelog.message)}</p>
    </div>` : changelog.kind === "success" && changelog.items.length === 0 ? `
    <div class="recent-updates-card">
      <h3>${escapeHtml(t("recent_updates_model_changes"))}</h3>
      <p class="recent-updates-empty">${escapeHtml(t("recent_updates_no_model_changes"))}</p>
    </div>` : changelog.kind === "success" ? `
    <div class="recent-updates-card">
      <h3>${escapeHtml(t("recent_updates_model_changes"))}</h3>
      <div class="recent-updates-changelog-list">
        ${changelog.items.map(item => `
          <div class="changelog-item">
            <span class="changelog-type-badge type-${escapeHtml(item.changeType)}">${escapeHtml(changeTypeLabel(item.changeType))}</span>
            <span class="changelog-description">${escapeHtml(item.description)}</span>
            <span class="changelog-date">${escapeHtml(formatDateString(item.createdAt))}</span>
          </div>
        `).join("")}
      </div>
    </div>` : "";

  const newsHtml = news.kind === "loading" ? `
    <div class="recent-updates-card">
      <h3>${escapeHtml(t("recent_updates_messages"))}</h3>
      <div class="recent-updates-loading">${currentLang === "zh" ? "加载中" : "Loading"}...</div>
    </div>` : news.kind === "error" ? `
    <div class="recent-updates-card error">
      <h3>${escapeHtml(t("recent_updates_messages"))}</h3>
      <p>${escapeHtml(news.message)}</p>
    </div>` : news.kind === "success" && news.items.length === 0 ? `
    <div class="recent-updates-card">
      <h3>${escapeHtml(t("recent_updates_messages"))}</h3>
      <p class="recent-updates-empty">${escapeHtml(t("recent_updates_no_messages"))}</p>
    </div>` : news.kind === "success" ? `
    <div class="recent-updates-card">
      <h3>${escapeHtml(t("recent_updates_messages"))}</h3>
      <div class="recent-updates-news-list">
        ${news.items.map(item => `
          <div class="news-item">
            <div class="news-item-header">
              <span class="news-item-title">${escapeHtml(item.title)}</span>
              <span class="news-item-date">${escapeHtml(formatDateString(item.createdAt))}</span>
            </div>
            <div class="news-item-content">${escapeHtml(item.content)}</div>
          </div>
        `).join("")}
      </div>
    </div>` : "";

  recentUpdatesPanel.innerHTML = `
    <div class="recent-updates-layout">
      ${overviewHtml}
      ${weeklyHtml}
      ${changelogHtml}
      ${newsHtml}
    </div>`;
}

function renderWeeklyStats(data: ExportsStatsData): string {
  const weeks = data.weekly;
  const daily = data.daily;

  const thisWeek = weeks.length > 0 ? weeks[weeks.length - 1] : null;
  const lastWeek = weeks.length > 1 ? weeks[weeks.length - 2] : null;

  // Build a lookup map: "2026-04-25" -> importCount
  const dailyMap = new Map<string, number>();
  for (const d of daily) {
    dailyMap.set(d.period, d.importCount);
  }

  // Generate last 14 calendar days, fill missing with 0
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const recentDays: Array<{ date: string; count: number; isToday: boolean }> = [];
  for (let i = 13; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const dateStr = d.toISOString().slice(0, 10);
    recentDays.push({
      date: dateStr,
      count: dailyMap.get(dateStr) ?? 0,
      isToday: i === 0
    });
  }

  const maxVal = Math.max(...recentDays.map(d => d.count), 1);

  function barHeight(count: number): number {
    return Math.max(3, Math.round((count / maxVal) * 60));
  }

  function dayLabel(dateStr: string): string {
    try {
      const d = new Date(dateStr + "T00:00:00");
      return currentLang === "zh"
        ? ["日", "一", "二", "三", "四", "五", "六"][d.getDay()]
        : ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][d.getDay()];
    } catch { return dateStr.slice(-5); }
  }

  return `
    <div class="recent-updates-card">
      <h3>${currentLang === "zh" ? "周 QA 趋势" : "Weekly QA Trend"}</h3>
      ${thisWeek || lastWeek ? `
      <div class="weekly-summary">
        ${lastWeek ? `
        <div class="weekly-summary-item">
          <span class="weekly-summary-period">${currentLang === "zh" ? "上周" : "Last Week"}</span>
          <span class="weekly-summary-count">${lastWeek.importCount.toLocaleString()}</span>
        </div>` : ""}
        ${thisWeek ? `
        <div class="weekly-summary-item">
          <span class="weekly-summary-period">${currentLang === "zh" ? "本周" : "This Week"}</span>
          <span class="weekly-summary-count">${thisWeek.importCount.toLocaleString()}</span>
        </div>` : ""}
      </div>` : ""}
      <div class="daily-trend">
        <div class="daily-trend-bars">
          ${recentDays.map(d => `
            <div class="daily-bar-item" title="${d.date}: ${d.count.toLocaleString()}">
              <span class="daily-bar-count">${d.count > 0 ? d.count.toLocaleString() : ""}</span>
              <div class="daily-bar" style="height: ${barHeight(d.count)}px"></div>
              ${d.isToday ? '<span class="daily-bar-today">' + (currentLang === "zh" ? "今天" : "Today") + '</span>' : `<span class="daily-bar-label">${dayLabel(d.date)}</span>`}
            </div>
          `).join("")}
        </div>
      </div>
    </div>`;
}

function changeTypeLabel(type: string): string {
  if (type === "added") return currentLang === "zh" ? "新增" : "Added";
  if (type === "updated") return currentLang === "zh" ? "更新" : "Updated";
  if (type === "deprecated") return currentLang === "zh" ? "弃用" : "Deprecated";
  if (type === "status_changed") return currentLang === "zh" ? "状态变更" : "Changed";
  return type;
}

function getCurrentSession(): ChatSession | undefined {
  return chatSessions.find(s => s.id === currentChatSessionId);
}

function createChatSession() {
  sessionCounter++;
  const session: ChatSession = {
    id: crypto.randomUUID(),
    name: `${t("chat_qa_session_untitled")} ${sessionCounter}`,
    messages: [],
    createdAt: Date.now()
  };
  chatSessions.push(session);
  currentChatSessionId = session.id;
  renderChatQaPanel();
}

function switchChatSession(id: string) {
  if (chatSessions.some(s => s.id === id)) {
    currentChatSessionId = id;
    renderChatQaPanel();
  }
}

function deleteChatSession(id: string) {
  const idx = chatSessions.findIndex(s => s.id === id);
  if (idx === -1) return;
  chatSessions.splice(idx, 1);
  if (currentChatSessionId === id) {
    if (chatSessions.length > 0) {
      currentChatSessionId = chatSessions[chatSessions.length - 1].id;
    } else {
      currentChatSessionId = null;
    }
  }
  if (chatSessions.length === 0) {
    createChatSession();
  } else {
    renderChatQaPanel();
  }
}

function renderChatSessionsBar() {
  if (!chatQaSessionsBar) return;

  const auth = currentPlatformAuthPayload();
  const currentSession = getCurrentSession();
  const hasMessages = (currentSession?.messages.length ?? 0) > 0;
  const canUpload = Boolean(auth) && hasMessages;

  const tabs = chatSessions.map(s => {
    const activeClass = s.id === currentChatSessionId ? " active" : "";
    const uploadState = sessionUploadStates[s.id];
    let statusIcon = "";
    if (uploadState) {
      if (uploadState.kind === "uploading") {
        statusIcon = `<span class="chat-qa-session-upload-status uploading" title="${escapeHtml(t("chat_qa_uploading"))}">&#8987;</span>`;
      } else if (uploadState.kind === "success") {
        statusIcon = `<span class="chat-qa-session-upload-status success" title="${escapeHtml(t("chat_qa_upload_success"))}">&#10003;</span>`;
      } else if (uploadState.kind === "error") {
        statusIcon = `<span class="chat-qa-session-upload-status error" title="${escapeHtml(uploadState.message)}">&#10007;</span>`;
      }
    }
    return `<span class="chat-qa-session-tab${activeClass}" data-session-id="${s.id}">
      <span class="chat-qa-session-tab-name">${escapeHtml(s.name)}</span>${statusIcon}
      <button type="button" class="chat-qa-session-tab-close" data-delete-session="${s.id}" title="Close session">&times;</button>
    </span>`;
  }).join("");

  const uploadTitle = canUpload ? escapeHtml(t("chat_qa_upload")) : (auth ? escapeHtml(t("chat_qa_upload_empty")) : escapeHtml(t("chat_qa_upload_no_auth")));
  const uploadDisabled = !canUpload ? " disabled" : "";

  chatQaSessionsBar.innerHTML = tabs
    + `<button type="button" class="chat-qa-new-session-button" id="chat-qa-new-session-button" title="${escapeHtml(t("chat_qa_new_session"))}">+</button>`
    + `<button type="button" class="chat-qa-upload-button${uploadDisabled}" id="chat-qa-upload-button" title="${uploadTitle}"${uploadDisabled} data-upload-session="${currentChatSessionId ?? ""}">${escapeHtml(t("chat_qa_upload"))}</button>`;
}

function renderChatQaPanel() {
  if (!chatQaPanel) return;

  renderChatSessionsBar();

  const session = getCurrentSession();
  const messages = session?.messages ?? [];

  const resolved = resolveLLMProvider();
  const hasConfig = resolved.mode !== "none" && resolved.model.length > 0;
  const modelLabel = hasConfig
    ? (resolved.mode === "platform"
        ? t("preset_platform") + " / " + resolved.model
        : (currentPresetLabel(providerPresetInput.value as ProviderPresetId) || resolved.provider) + " / " + resolved.model)
    : "";

  chatQaModelInfo.innerHTML = hasConfig
    ? `<span class="chat-qa-model-label">${escapeHtml(t("chat_qa_model"))}</span><span class="chat-qa-model-value">${escapeHtml(modelLabel)}</span>`
    : `<span class="chat-qa-model-warning">${escapeHtml(t("chat_qa_no_model"))}</span>`;

  if (messages.length === 0) {
    chatQaMessages.innerHTML = `<div class="chat-qa-empty" id="chat-qa-empty">${escapeHtml(t("chat_qa_empty"))}</div>`;
  } else {
    chatQaMessages.innerHTML = messages
      .map(
        (msg, i) => `
          <div class="chat-qa-message ${msg.role}">
            <span class="chat-qa-message-role">${escapeHtml(msg.role === "user" ? t("chat_qa_user") : t("chat_qa_assistant"))}</span>
            <div class="chat-qa-message-content">${escapeHtml(msg.content)}</div>
          </div>`
      )
      .join("");
    chatQaMessages.scrollTop = chatQaMessages.scrollHeight;
  }

  chatQaSendButton.disabled = !hasConfig || chatSending;
  chatQaInput.disabled = !hasConfig || chatSending;

  if (chatError) {
    chatQaError.hidden = false;
    chatQaError.textContent = chatError;
  } else {
    chatQaError.hidden = true;
  }
}

async function handleChatSend() {
  if (chatSending) return;

  const session = getCurrentSession();
  if (!session) return;

  const text = chatQaInput.value.trim();
  if (!text) return;

  const resolved = resolveLLMProvider();
  const modelReady = resolved.model.length > 0;
  if (resolved.mode === "none" || !modelReady) {
    chatError = t("chat_qa_no_model");
    renderChatQaPanel();
    return;
  }

  session.messages.push({ role: "user", content: text });
  chatQaInput.value = "";
  chatSending = true;
  chatError = null;
  // Add empty assistant placeholder for streaming
  session.messages.push({ role: "assistant", content: "" });
  renderChatQaPanel();

  try {
    await invoke<{ message: { role: string; content: string } }>(
      "send_chat_message_stream",
      {
        request: {
          platformUrl: resolved.mode === "platform" ? resolved.platformUrl : null,
          username: resolved.mode === "platform" ? resolved.username : null,
          password: resolved.mode === "platform" ? resolved.password : null,
          provider: resolved.mode === "settings" ? resolved.provider : "openai-compatible",
          baseUrl: resolved.mode === "settings" ? resolved.baseUrl : "",
          apiKey: resolved.mode === "settings" ? resolved.apiKey : "",
          model: resolved.model,
          messages: session.messages.filter(m => m.role !== "assistant" || m.content !== "").map((m) => ({ role: m.role, content: m.content }))
        }
      }
    );
  } catch (error) {
    chatError = `${t("chat_qa_send_failed")}: ${String(error)}`;
  } finally {
    chatSending = false;
    renderChatQaPanel();
  }
}

async function uploadChatSession(sessionId: string) {
  const session = chatSessions.find(s => s.id === sessionId);
  if (!session || session.messages.length === 0) return;

  const auth = currentPlatformAuthPayload();
  if (!auth) {
    sessionUploadStates[sessionId] = { kind: "error", message: t("chat_qa_upload_no_auth") };
    renderChatQaPanel();
    return;
  }

  sessionUploadStates[sessionId] = { kind: "uploading" };
  renderChatQaPanel();

  try {
    const response = await invoke<ChatUploadResponse>("push_chat_conversations", {
      platformUrl: auth.platformUrl,
      username: auth.username,
      password: auth.password,
      sessionName: session.name,
      externalBatchId: session.id,
      messages: session.messages.map(m => ({ role: m.role, content: m.content }))
    });
    sessionUploadStates[sessionId] = { kind: "success", batchId: response.batch_id ?? 0 };
  } catch (error) {
    sessionUploadStates[sessionId] = { kind: "error", message: String(error) };
  }
  renderChatQaPanel();
}

function renderFeedback2Panel() {
  const isLoggedIn = platformLoginState.kind === "success";
  const formState = feedback2FormState;

  const loginRequired = document.querySelector<HTMLElement>("#feedback2-login-required");
  const form = document.querySelector<HTMLFormElement>("#feedback2-form");
  const submitBtn = document.querySelector<HTMLButtonElement>("#feedback2-submit-button");
  const successMsg = document.querySelector<HTMLElement>("#feedback2-success");
  const errorMsg = document.querySelector<HTMLElement>("#feedback2-form-error");

  if (loginRequired) loginRequired.hidden = isLoggedIn;
  if (form) form.hidden = !isLoggedIn;

  if (submitBtn) {
    submitBtn.disabled = formState.kind === "submitting";
    submitBtn.textContent = formState.kind === "submitting" ? t("feedback_submitting") : t("feedback_submit");
  }

  if (successMsg) successMsg.hidden = formState.kind !== "success";
  if (errorMsg) {
    errorMsg.hidden = formState.kind !== "error";
    if (formState.kind === "error") errorMsg.textContent = formState.message;
  }
}

async function loadRecentUpdatesData() {
  const auth = currentPlatformAuthPayload();
  if (!auth) {
    dashboardOverviewState = { kind: "idle" };
    platformNewsState = { kind: "idle" };
    modelChangelogState = { kind: "idle" };
    exportsStatsState = { kind: "idle" };
    renderRecentUpdatesPanel();
    return;
  }

  dashboardOverviewState = { kind: "loading" };
  platformNewsState = { kind: "loading" };
  modelChangelogState = { kind: "loading" };
  exportsStatsState = { kind: "loading" };
  renderRecentUpdatesPanel();

  try {
    const [overview, news, changelog, exportsStats] = await Promise.all([
      invoke<DashboardOverview>("get_platform_stats", auth),
      invoke<PlatformNews[]>("get_platform_news", auth),
      invoke<ModelChangelogEntry[]>("get_model_changelog", { ...auth, days: 7 }),
      invoke<ExportsStatsData>("get_exports_stats", auth)
    ]);
    dashboardOverviewState = { kind: "success", data: overview };
    platformNewsState = { kind: "success", items: news };
    modelChangelogState = { kind: "success", items: changelog };
    exportsStatsState = { kind: "success", data: exportsStats };
    recentUpdatesLastRefreshTime = Date.now();
  } catch (error) {
    dashboardOverviewState = { kind: "error", message: String(error) };
    platformNewsState = { kind: "error", message: String(error) };
    modelChangelogState = { kind: "error", message: String(error) };
    exportsStatsState = { kind: "error", message: String(error) };
  }
  renderRecentUpdatesPanel();
}

function formatDateString(dateStr: string): string {
  try {
    const d = new Date(dateStr);
    return new Intl.DateTimeFormat(currentLang === "zh" ? "zh-CN" : "en-US", {
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit"
    }).format(d);
  } catch { return dateStr; }
}

function formatTimestamp(ts: number | null): string {
  if (!ts) return t("empty_value");
  return new Intl.DateTimeFormat(currentLang === "zh" ? "zh-CN" : "en-US", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit"
  }).format(new Date(ts));
}

async function handleFeedback2FormSubmit(event: SubmitEvent) {
  event.preventDefault();
  const form = event.currentTarget as HTMLFormElement;
  const titleInput = form.querySelector<HTMLInputElement>("#feedback2-title");
  const contentInput = form.querySelector<HTMLTextAreaElement>("#feedback2-content");
  const categorySelect = form.querySelector<HTMLSelectElement>("#feedback2-category");
  if (!titleInput || !contentInput || !categorySelect) return;

  const title = titleInput.value.trim();
  const content = contentInput.value.trim();
  if (!title || !content) return;

  const auth = currentPlatformAuthPayload();
  if (!auth) return;

  feedback2FormState = { kind: "submitting" };
  renderFeedback2Panel();
  try {
    await invoke("submit_feedback", {
      ...auth,
      title,
      content,
      category: categorySelect.value
    });
    feedback2FormState = { kind: "success" };
    titleInput.value = "";
    contentInput.value = "";
  } catch (error) {
    feedback2FormState = { kind: "error", message: String(error) };
  }
  renderFeedback2Panel();
}

async function handlePasswordChange(event: SubmitEvent) {
  event.preventDefault();
  const form = event.currentTarget as HTMLFormElement;
  const currentInput = form.querySelector<HTMLInputElement>("#password-change-current");
  const newInput = form.querySelector<HTMLInputElement>("#password-change-new");
  const confirmInput = form.querySelector<HTMLInputElement>("#password-change-confirm");
  if (!currentInput || !newInput || !confirmInput) return;

  const currentPassword = currentInput.value;
  const newPassword = newInput.value;
  const confirmPassword = confirmInput.value;

  if (newPassword !== confirmPassword) {
    passwordChangeState = { kind: "error", message: t("platform_password_mismatch") };
    renderPasswordChangeForm();
    return;
  }

  const auth = currentPlatformAuthPayload();
  if (!auth) return;

  passwordChangeState = { kind: "submitting" };
  renderPasswordChangeForm();
  try {
    await invoke<ChangePasswordResponse>("change_platform_password", {
      ...auth,
      currentPassword,
      newPassword
    });
    passwordChangeState = { kind: "success" };
    currentInput.value = "";
    newInput.value = "";
    confirmInput.value = "";
  } catch (error) {
    passwordChangeState = { kind: "error", message: String(error) };
  }
  renderPasswordChangeForm();
}

function renderPasswordChangeForm() {
  const container = document.querySelector<HTMLElement>("#password-change-form-container");
  if (!container) return;

  const state = passwordChangeState;
  container.innerHTML = `
    <form class="password-change-form" id="password-change-form">
      <p class="password-change-title">${escapeHtml(t("platform_change_password_title"))}</p>
      <label>
        <span>${escapeHtml(t("platform_current_password"))}</span>
        <input id="password-change-current" type="password" required />
      </label>
      <label>
        <span>${escapeHtml(t("platform_new_password"))}</span>
        <input id="password-change-new" type="password" minlength="6" required />
      </label>
      <label>
        <span>${escapeHtml(t("platform_confirm_password"))}</span>
        <input id="password-change-confirm" type="password" minlength="6" required />
      </label>
      <button type="submit" class="feedback-submit-button" ${state.kind === "submitting" ? "disabled" : ""}>
        ${state.kind === "submitting" ? escapeHtml(t("platform_password_submitting")) : escapeHtml(t("platform_password_submit"))}
      </button>
      ${state.kind === "success" ? `<p class="feedback-success">${escapeHtml(t("platform_password_success"))}</p>` : ""}
      ${state.kind === "error" ? `<p class="feedback-error">${escapeHtml(state.message)}</p>` : ""}
    </form>
  `;

  const form = container.querySelector<HTMLFormElement>("#password-change-form");
  if (form) {
    form.addEventListener("submit", handlePasswordChange);
  }
}

function formatBrowsePageLabel(page: number, totalPages: number): string {
  return currentLang === "zh"
    ? `第 ${page} / ${totalPages} 页`
    : `Page ${page} / ${totalPages}`;
}

function formatUpdatedAt(updatedAtMs: number | null): string {
  if (!updatedAtMs) {
    return t("empty_value");
  }

  return new Intl.DateTimeFormat(currentLang === "zh" ? "zh-CN" : "en-US", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(updatedAtMs));
}

function truncateText(value: string, maxLength: number): string {
  return value.length > maxLength ? `${value.slice(0, maxLength)}...` : value;
}

function normalizeCotSectionHeaders(headers: string[] | null | undefined): string[] {
  const normalized = (headers ?? [])
    .map((value) => value.trim().replace(/:+$/, "").trim())
    .filter(Boolean);
  return normalized.length ? normalized : defaultCotSectionHeadersForLang(currentLang);
}

function parseCotAnswerSections(
  answer: string,
  headers: string[] | null | undefined
): Array<{ label: string; value: string }> {
  const normalizedHeaders = normalizeCotSectionHeaders(headers);
  const headingPattern = normalizedHeaders.map((heading) => escapeRegExp(heading)).join("|");
  const matcher = new RegExp(`^(${headingPattern})\\s*:\\s*`, "gm");
  const matches = Array.from(answer.matchAll(matcher));
  if (!matches.length) {
    return [];
  }

  return matches
    .map((match, index) => {
      const heading = match[1];
      const start = (match.index ?? 0) + match[0].length;
      const end = index + 1 < matches.length ? (matches[index + 1].index ?? answer.length) : answer.length;
      const value = answer.slice(start, end).trim();
      const translationKey = DEFAULT_COT_SECTION_TRANSLATION_KEYS[heading];
      return value
        ? {
            label: translationKey ? t(translationKey) : heading,
            value
          }
        : null;
    })
    .filter((section): section is { label: string; value: string } => Boolean(section));
}

function renderBrowseView() {
  if (browseView === "batches") {
    browseBackButton.hidden = true;
    browseBackButton.textContent = "";
    browseViewTitle.textContent = t("browse_batches_title");
    browseViewMeta.textContent = browseBatches.length
      ? `${t("browse_history_count")} ${formatCount(browseBatches.length)}`
      : t("browse_batches_empty");
    browseContent.innerHTML = renderBrowseBatches();
    return;
  }

  const batch = currentBrowseBatch();

  if (browseView === "questions") {
    browseBackButton.hidden = false;
    browseBackButton.textContent = t("browse_back_batches");
    browseViewTitle.textContent = batch ? batch.topicName || batch.name : t("browse_questions_title");
    browseViewMeta.textContent = browsePageData
      ? `${t("browse_total_items")} ${formatCount(browsePageData.totalItems)} · ${formatBrowsePageLabel(browsePageData.page, browsePageData.totalPages)}`
      : browseQuestionsLoading
        ? t("browse_questions_loading")
        : t("browse_questions_empty");
    browseContent.innerHTML = renderBrowseQaList();
    return;
  }

  if (browseView === "review") {
    browseBackButton.hidden = false;
    browseBackButton.textContent = t("browse_back_batches");
    browseViewTitle.textContent = batch ? `${batch.topicName || batch.name} · ${t("browse_review_title")}` : t("browse_review_title");
    browseViewMeta.textContent = browseReviewLoading
      ? t("browse_review_loading")
      : batch
        ? browseReviewSummaryLabel(batch)
        : t("browse_review_empty");
    browseContent.innerHTML = renderBrowseReview();
    return;
  }

  browseBackButton.hidden = false;
  browseBackButton.textContent = t("browse_back_questions");
  browseViewTitle.textContent = t("browse_detail_title");
  browseViewMeta.textContent = browseDetailData
    ? `${batch ? `${batch.topicName || batch.name} · ` : ""}${truncateText(browseDetailData.review.effectiveQuestion, 88)}`
    : browseDetailLoading
      ? t("browse_detail_loading")
      : t("browse_detail_empty");
  browseContent.innerHTML = renderBrowseDetail();
}

function renderBrowseBatches(): string {
  if (!browseBatches.length) {
    return `<div class="empty-state">${escapeHtml(t("browse_batches_empty"))}</div>`;
  }

  const hasUploadUrl = Boolean(currentQaPlatformUrl());
  return `<div class="browse-list">${browseBatches
    .map((batch) => {
      const remoteVirtual = isRemoteVirtualBrowseBatch(batch.id);
      const selected = batch.id === browseSelectedBatchId;
      const platformStatus = currentBrowseBatchPlatformStatus(batch.id);
      const resumable = canResumeBrowseBatch(batch);
      const uploadDisabled = remoteVirtual || !hasUploadUrl || browseUploadingBatchId !== null;
      const uploadBusy = browseUploadingBatchId === batch.id;
      const stats = [
        batch.targetCount !== null
          ? `${t("browse_target_items")} ${formatCount(batch.targetCount)}`
          : null,
        `${t("browse_generated_items")} ${formatCount(batch.generatedCount)}`,
        `${t("browse_kept_items")} ${formatCount(batch.keptCount)}`,
        !remoteVirtual
          ? `${t("browse_review_progress")} ${formatCount(batch.reviewedCount)} / ${formatCount(batch.generatedCount || batch.totalCount)}`
          : null,
        batch.requestCount !== null
          ? `${t("browse_request_count")} ${formatCount(batch.requestCount)}`
          : null
      ]
        .filter(Boolean)
        .join(" · ");
      const meta = [
        `${t("browse_task_status")} ${batchStatusLabel(batch.status)}`,
        batch.qaMode ? qaModeLabel(batch.qaMode) : null,
        batch.model ? `${t("browse_model")} ${batch.model}` : null,
        `${t("browse_updated_at")} ${formatUpdatedAt(batch.updatedAtMs)}`
      ]
        .filter(Boolean)
        .join(" · ");
      const progress = batch.shardCount
        ? `${t("browse_shard_progress")} ${formatCount(batch.completedShards + batch.skippedShards)} / ${formatCount(batch.shardCount)}`
        : null;

      return `
        <article class="browse-row${selected ? " active" : ""}">
          <button class="browse-row-main" type="button" data-batch-id="${escapeHtml(batch.id)}">
            <span class="browse-row-title">${escapeHtml(batch.topicName || batch.name)}${browseBatchPlatformBadgeHtml(batch.id)}</span>
            <span class="browse-row-meta">${escapeHtml(meta)}</span>
            <span class="browse-row-stats">${escapeHtml(stats)}</span>
            ${progress ? `<span class="browse-row-progress">${escapeHtml(progress)}</span>` : ""}
            ${
              platformStatus && platformStatus.batchStatus !== "missing"
                ? `<span class="browse-row-copy">${escapeHtml(
                    `${t("qa_evaluate_tab_title")} ${batchPlatformStatusLabel(platformStatus.batchStatus)}`
                  )}</span>`
                : ""
            }
            <span class="browse-row-copy">${escapeHtml(truncateText(batch.prompt, 96) || batch.outputDir)}</span>
          </button>
          <div class="browse-row-actions">
            ${
              resumable
                ? `<button type="button" class="browse-mini-button" data-batch-action="continue" data-batch-id="${escapeHtml(batch.id)}">${escapeHtml(browseResumeActionLabel(batch))}</button>`
                : ""
            }
            <button type="button" class="browse-mini-button" data-batch-action="open" data-batch-id="${escapeHtml(batch.id)}">${escapeHtml(t("browse_action_open"))}</button>
            ${
              remoteVirtual
                ? ""
                : `<button type="button" class="browse-mini-button" data-batch-action="review" data-batch-id="${escapeHtml(batch.id)}">${escapeHtml(t("browse_action_review"))}</button>`
            }
            ${
              remoteVirtual
                ? ""
                : `<button type="button" class="browse-mini-button browse-mini-button-danger" data-batch-action="delete" data-batch-id="${escapeHtml(batch.id)}">${escapeHtml(t("browse_action_delete"))}</button>`
            }
            ${
              remoteVirtual
                ? ""
                : `<button type="button" class="browse-mini-button${uploadDisabled ? " browse-mini-button-muted" : ""}" data-batch-action="upload" data-batch-id="${escapeHtml(batch.id)}" data-upload-ready="${hasUploadUrl ? "true" : "false"}" ${uploadDisabled ? "disabled" : ""}>${escapeHtml(t(uploadBusy ? "browse_action_uploading" : "browse_action_upload"))}</button>`
            }
          </div>
        </article>
      `;
    })
    .join("")}</div>`;
}

function renderBrowseQaList(): string {
  if (browseErrorMessage) {
    return `<div class="empty-state">${escapeHtml(browseErrorMessage)}</div>`;
  }

  if (browseQuestionsLoading) {
    return `<div class="empty-state">${escapeHtml(t("browse_questions_loading"))}</div>`;
  }

  if (!browsePageData || !browseSelectedBatchId) {
    return `<div class="empty-state">${escapeHtml(t("browse_questions_empty"))}</div>`;
  }

  const listHtml = !browsePageData.items.length
    ? `<div class="empty-state">${escapeHtml(t("browse_questions_empty"))}</div>`
    : `<div class="browse-list">${browsePageData.items
        .map((item) => {
          const active = browseDetailData?.item.id === item.id;
          const meta = [item.subtopic, item.axis, item.questionType, item.difficulty]
            .filter(Boolean)
            .join(" · ");
          return `
            <button class="browse-row${active ? " active" : ""}" type="button" data-qa-id="${escapeHtml(item.id)}">
              <span class="browse-row-title">${escapeHtml(truncateText(item.effectiveQuestion, 100))}</span>
              <span class="browse-row-meta">${escapeHtml(meta)}</span>
              <span class="browse-row-copy">${escapeHtml(`${reviewStatusLabel(item.reviewStatus)}${item.editedQuestion ? ` · ${t("browse_review_question_edited")}` : ""}`)}</span>
            </button>
          `;
        })
        .join("")}</div>`;

  return `
    ${listHtml}
    <div class="browse-pagination">
      <button type="button" id="browse-prev-page" ${browsePageData.page <= 1 ? "disabled" : ""}>${escapeHtml(t("browse_prev"))}</button>
      <span class="browse-page-label">${escapeHtml(formatBrowsePageLabel(browsePageData.page, browsePageData.totalPages))}</span>
      <button type="button" id="browse-next-page" ${browsePageData.page >= browsePageData.totalPages ? "disabled" : ""}>${escapeHtml(t("browse_next"))}</button>
    </div>
  `;
}

function renderBrowseDetail(): string {
  if (browseErrorMessage) {
    return `<div class="empty-state">${escapeHtml(browseErrorMessage)}</div>`;
  }

  if (browseDetailLoading) {
    return `<div class="empty-state">${escapeHtml(t("browse_detail_loading"))}</div>`;
  }

  if (!browseDetailData) {
    return `<div class="empty-state">${escapeHtml(t("browse_detail_empty"))}</div>`;
  }

  const { batch, item } = browseDetailData;
  const review = browseDetailData.review;
  const cotSections =
    item.qa_mode === "cot" ? parseCotAnswerSections(item.answer, batch.cotSectionHeaders) : [];
  const cards = [
    { label: t("browse_batch_name"), value: batch.topicName || batch.name },
    { label: t("browse_task_status"), value: batchStatusLabel(batch.status) },
    { label: t("browse_review_status"), value: reviewStatusLabel(review.status) },
    { label: t("browse_qa_mode"), value: qaModeLabel(item.qa_mode) },
    {
      label: t("browse_target_items"),
      value: batch.targetCount !== null ? formatCount(batch.targetCount) : t("empty_value")
    },
    { label: t("browse_generated_items"), value: formatCount(batch.generatedCount) },
    { label: t("browse_kept_items"), value: formatCount(batch.keptCount) },
    { label: t("browse_review_kept"), value: formatCount(batch.reviewKeptCount) },
    { label: t("browse_review_discarded"), value: formatCount(batch.discardedCount) },
    {
      label: t("browse_shard_progress"),
      value: batch.shardCount
        ? `${formatCount(batch.completedShards + batch.skippedShards)} / ${formatCount(batch.shardCount)}`
        : t("empty_value")
    },
    { label: t("browse_subtopic"), value: item.subtopic },
    { label: t("browse_axis"), value: item.axis },
    { label: t("browse_question_type"), value: item.question_type },
    { label: t("browse_difficulty"), value: item.difficulty },
    { label: t("browse_audience"), value: item.audience },
    { label: t("browse_provider"), value: item.provider },
    { label: t("browse_model"), value: item.model },
    {
      label: t("browse_request_count"),
      value: batch.requestCount !== null ? formatCount(batch.requestCount) : t("empty_value")
    },
    { label: t("browse_output_dir"), value: batch.outputDir, wide: true },
    { label: t("browse_prompt"), value: batch.prompt || t("empty_value"), wide: true },
    { label: t("browse_question"), value: review.effectiveQuestion, wide: true },
    ...(review.editedQuestion ? [{ label: t("browse_question_original"), value: item.question, wide: true }] : []),
    { label: t("browse_source_type"), value: item.source_type },
    { label: t("browse_grounding"), value: item.grounding }
  ];

  const answerCards =
    cotSections.length > 0
      ? cotSections.map(({ label, value }) => ({ label, value, wide: true, multiline: true }))
      : [{ label: t("browse_answer"), value: item.answer, wide: true, multiline: true }];

  return `<div class="browse-detail">${[...cards, ...answerCards]
    .map(
      ({ label, value, wide, multiline }) => `
        <article class="result-card${wide ? " wide" : ""}">
          <p class="result-card-label">${escapeHtml(label)}</p>
          <p class="result-card-value${multiline ? " multiline" : ""}">${escapeHtml(displayValue(value))}</p>
        </article>
      `
    )
    .join("")}</div>`;
}

function renderBrowseReview(): string {
  if (browseErrorMessage) {
    return `<div class="empty-state">${escapeHtml(browseErrorMessage)}</div>`;
  }

  if (browseReviewLoading) {
    return `<div class="empty-state">${escapeHtml(t("browse_review_loading"))}</div>`;
  }

  const item = currentBrowseReviewItem();
  const batch = currentBrowseBatch();
  if (!item || !batch) {
    return `<div class="empty-state">${escapeHtml(t("browse_review_empty"))}</div>`;
  }

  const draft = currentBrowseReviewDraft();
  const dirty = draft.trim() !== item.effectiveQuestion.trim();
  const total = browseReviewItems.length;
  const meta = [item.subtopic, item.axis, item.questionType, item.difficulty]
    .filter(Boolean)
    .join(" · ");

  return `
    <section class="browse-review-shell">
      <article class="browse-review-card">
        <div class="browse-review-header">
          <div class="browse-review-header-copy">
            <p class="result-card-label">${escapeHtml(t("browse_review_progress"))}</p>
            <p class="browse-review-progress">${escapeHtml(`${formatCount(browseReviewIndex + 1)} / ${formatCount(total)}`)}</p>
            <p class="browse-row-meta">${escapeHtml(meta || t("empty_value"))}</p>
          </div>
          <span class="browse-review-badge ${escapeHtml(reviewStatusBadgeClass(item.reviewStatus))}">${escapeHtml(reviewStatusLabel(item.reviewStatus))}</span>
        </div>
        <label class="field output-root-field browse-review-editor">
          <span>${escapeHtml(t("browse_question"))}</span>
          <textarea id="browse-review-question" rows="8">${escapeHtml(draft)}</textarea>
        </label>
        ${
          item.editedQuestion
            ? `<p class="browse-row-copy">${escapeHtml(`${t("browse_question_original")}: ${item.question}`)}</p>`
            : ""
        }
        <div class="browse-review-actions">
          <button type="button" class="browse-mini-button${!dirty || browseReviewSaving ? " browse-mini-button-muted" : ""}" id="browse-review-save" ${!dirty || browseReviewSaving ? "disabled" : ""}>${escapeHtml(t(browseReviewSaving ? "browse_review_saving" : "browse_review_save"))}</button>
          <button type="button" class="browse-mini-button${item.reviewStatus === "kept" ? " active" : ""}" id="browse-review-keep" ${browseReviewSaving ? "disabled" : ""}>${escapeHtml(t("browse_review_keep"))}</button>
          <button type="button" class="browse-mini-button browse-mini-button-danger${item.reviewStatus === "discarded" ? " active" : ""}" id="browse-review-discard" ${browseReviewSaving ? "disabled" : ""}>${escapeHtml(t("browse_review_discard"))}</button>
        </div>
      </article>
      <div class="browse-review-nav">
        <button type="button" class="browse-review-nav-button" id="browse-review-prev" ${browseReviewIndex <= 0 || browseReviewSaving ? "disabled" : ""}>${escapeHtml(t("browse_review_prev_question"))}</button>
        <span class="browse-page-label">${escapeHtml(browseReviewSummaryLabel(batch))}</span>
        <button type="button" class="browse-review-nav-button" id="browse-review-next" ${browseReviewIndex >= total - 1 || browseReviewSaving ? "disabled" : ""}>${escapeHtml(t("browse_review_next_question"))}</button>
      </div>
    </section>
  `;
}

async function deleteBrowseBatch(batchId: string) {
  if (isRemoteVirtualBrowseBatch(batchId)) {
    return;
  }
  const confirmed = window.confirm(t("browse_delete_confirm"));
  if (!confirmed) {
    return;
  }

  try {
    await invoke("delete_qa_batch", { batchId });
    if (browseSelectedBatchId === batchId) {
      browseView = "batches";
      browseSelectedBatchId = null;
      browsePageData = null;
      browseDetailData = null;
      browseReviewItems = [];
      browseReviewDrafts = new Map();
    }
    await loadBrowseBatches();
    window.alert(t("browse_delete_success"));
  } catch (error) {
    window.alert(`${t("browse_action_delete")}: ${String(error)}`);
  }
}

async function uploadBrowseBatch(batchId: string) {
  if (isRemoteVirtualBrowseBatch(batchId)) {
    return;
  }
  if (browseUploadingBatchId) {
    return;
  }
  if (!hasQaPlatformCredentials()) {
    window.alert(t("browse_platform_credentials_missing"));
    setCurrentTab("settings");
    qaPlatformUsernameInput.focus();
    return;
  }

  browseUploadingBatchId = batchId;
  renderBrowseView();
  try {
    const response = await invoke<QaBatchUploadResponse>("upload_qa_batch", {
      batchId,
      platformUrl: currentQaPlatformUrl(),
      username: qaPlatformUsernameInput.value.trim(),
      password: qaPlatformPasswordInput.value.trim()
    });
    const message = response.existingBatch
      ? t("browse_upload_exists")
      : `${t("browse_upload_success")} (${formatCount(response.uploadedCount)})`;
    appendLog(
      `${message} · batch_id=${response.batchId ?? "n/a"} · app=${response.applicationId} · type=${response.technicalTypeCode}`
    );
    platformHealthState = {
      kind: "success",
      response: {
        reachable: true,
        message: "ok",
        endpoints: {
          normalizedPlatformUrl: currentQaPlatformUrl(),
          platformWebBaseUrl: response.platformWebBaseUrl,
          platformApiBaseUrl: response.platformApiBaseUrl
        }
      }
    };
    await syncBrowseBatchPlatformStatuses([batchId], true);
    renderPlatformPanels();
    window.alert(message);
  } catch (error) {
    const detail = String(error);
    const message = detail.includes("no kept QA items")
      ? t("browse_upload_no_kept_items")
      : `${t("browse_upload_failed")}: ${detail}`;
    window.alert(message);
  } finally {
    browseUploadingBatchId = null;
    renderBrowseView();
  }
}

async function refreshPlatformHealth() {
  platformHealthState = { kind: "loading" };
  renderPlatformPanels();
  try {
    const platformUrl = currentQaPlatformUrl();
    const response = await invoke<PlatformHealthResponse>("check_platform_health", {
      platformUrl
    });
    platformHealthState = { kind: "success", response };
    appendLog(`${t("platform_health_ok")} ${response.endpoints.platformApiBaseUrl}`);
  } catch (error) {
    platformHealthState = { kind: "error", message: String(error) };
    appendLog(`${t("platform_health_failed")}: ${String(error)}`);
  }
  renderPlatformPanels();
}

async function refreshPlatformLogin() {
  if (!hasQaPlatformCredentials()) {
    window.alert(t("browse_platform_credentials_missing"));
    setCurrentTab("settings");
    qaPlatformUsernameInput.focus();
    return;
  }

  platformLoginState = { kind: "loading" };
  renderPlatformPanels();
  try {
    const platformUrl = currentQaPlatformUrl();
    const response = await invoke<PlatformLoginResponse>("login_platform", {
      platformUrl,
      username: qaPlatformUsernameInput.value.trim(),
      password: qaPlatformPasswordInput.value.trim()
    });
    platformLoginState = { kind: "success", response };
    platformHealthState = {
      kind: "success",
      response: {
        reachable: true,
        message: "ok",
        endpoints: response.endpoints
      }
    };
    appendLog(`${t("platform_login_ok")} ${response.user.username}`);
  } catch (error) {
    platformLoginState = { kind: "error", message: String(error) };
    appendLog(`${t("platform_login_failed")}: ${String(error)}`);
  }
  renderPlatformPanels();
}

function currentPlatformAuthPayload():
  | { platformUrl: string; username: string; password: string }
  | null {
  const platformUrl = currentQaPlatformUrl();
  const username = qaPlatformUsernameInput.value.trim();
  const password = qaPlatformPasswordInput.value.trim();
  if (!platformUrl || !username || !password) {
    return null;
  }
  return { platformUrl, username, password };
}

async function loadRemoteVirtualBrowseBatchSummary(): Promise<QaBatchSummary | null> {
  const auth = currentPlatformAuthPayload();
  if (!auth) {
    clearBrowseRemoteVirtualBatch();
    return null;
  }

  const summaries = await invoke<PlatformImportBatchSummary[]>("list_platform_import_batches", auth);
  const remoteSummary =
    summaries.find(
      (item) =>
        item.source === PLATFORM_REMOTE_VIRTUAL_BATCH_SOURCE &&
        item.id === PLATFORM_REMOTE_VIRTUAL_BATCH_ID
    ) ?? null;

  if (!remoteSummary) {
    clearBrowseRemoteVirtualBatch();
    return null;
  }

  browseRemoteVirtualBatch = remoteVirtualBatchToBrowseSummary(remoteSummary);
  browseRemoteVirtualBatchDetail = null;
  return browseRemoteVirtualBatch;
}

async function ensureRemoteVirtualBrowseBatchDetail(): Promise<PlatformImportBatchDetail> {
  const auth = currentPlatformAuthPayload();
  if (!auth) {
    throw new Error(currentLang === "zh" ? "请先填写平台地址、用户名和密码" : "Platform credentials are required");
  }

  if (browseRemoteVirtualBatchDetail) {
    return browseRemoteVirtualBatchDetail;
  }

  const detail = await invoke<PlatformImportBatchDetail>("get_platform_import_batch_detail", {
    ...auth,
    batchId: PLATFORM_REMOTE_VIRTUAL_BATCH_ID
  });
  browseRemoteVirtualBatchDetail = detail;
  browseRemoteVirtualBatch = remoteVirtualBatchToBrowseSummary(detail.batch);
  browseBatches = mergeBrowseBatches(localBrowseBatches(), browseRemoteVirtualBatch);
  return detail;
}

async function loadModelTrialSessionDetail(sessionId: number, silent = false) {
  const auth = currentPlatformAuthPayload();
  if (!auth) {
    return;
  }

  modelTrialDetailLoading = true;
  if (!silent) {
    modelTrialErrorMessage = null;
    modelTrialNoticeMessage = null;
  }
  renderPlatformPanels();
  try {
    const detail = await invoke<TrialSessionDetail>("get_model_trial_session_detail", {
      ...auth,
      sessionId
    });
    modelTrialDetail = detail;
    modelTrialSelectedSessionId = detail.session.id;
    modelTrialSelectedConfigId = detail.session.llmConfigId;
  } catch (error) {
    modelTrialErrorMessage = `${t("model_trial_error_detail")}: ${String(error)}`;
    appendLog(modelTrialErrorMessage);
  } finally {
    modelTrialDetailLoading = false;
    renderPlatformPanels();
  }
}

async function loadModelTrialLocalBatches() {
  try {
    modelTrialLocalBatches = await invoke<QaBatchSummary[]>("list_qa_batches");
    if (
      modelTrialSelectedBatchId &&
      !modelTrialLocalBatches.some((item) => item.id === modelTrialSelectedBatchId)
    ) {
      modelTrialSelectedBatchId = null;
      modelTrialLocalQuestions = [];
      modelTrialSelectedQuestionId = null;
      modelTrialLocalQuestionDetail = null;
    }
  } catch (error) {
    modelTrialErrorMessage = `${t("browse_tab_title")}: ${String(error)}`;
    appendLog(modelTrialErrorMessage);
  }
}

async function loadModelTrialLocalQuestions(batchId: string) {
  modelTrialLocalQuestionsLoading = true;
  modelTrialSelectedBatchId = batchId;
  modelTrialSelectedQuestionId = null;
  modelTrialLocalQuestionDetail = null;
  renderPlatformPanels();
  try {
    modelTrialLocalQuestions = await invoke<QaRecordSummary[]>("list_batch_qa_question_options", {
      batchId
    });
  } catch (error) {
    modelTrialLocalQuestions = [];
    modelTrialErrorMessage = `${t("model_trial_select_question")}: ${String(error)}`;
    appendLog(modelTrialErrorMessage);
  } finally {
    modelTrialLocalQuestionsLoading = false;
    renderPlatformPanels();
  }
}

async function loadModelTrialLocalQuestionDetail(batchId: string, qaId: string) {
  try {
    const detail = await invoke<QaRecordDetail>("get_batch_qa_record", {
      batchId,
      qaId
    });
    modelTrialLocalQuestionDetail = detail;
    modelTrialSelectedQuestionId = qaId;
  } catch (error) {
    modelTrialLocalQuestionDetail = null;
    modelTrialErrorMessage = `${t("model_trial_source_card")}: ${String(error)}`;
    appendLog(modelTrialErrorMessage);
  } finally {
    renderPlatformPanels();
  }
}

async function loadModelTrialWorkspace(showNotice = false) {
  const auth = currentPlatformAuthPayload();
  if (!auth) {
    resetModelTrialState();
    renderPlatformPanels();
    return;
  }

  modelTrialWorkspaceLoading = true;
  platformLoginState = { kind: "loading" };
  modelTrialErrorMessage = null;
  if (!showNotice) {
    modelTrialNoticeMessage = null;
  }
  renderPlatformPanels();
  try {
    const response = await invoke<TrialWorkspaceResponse>("load_model_trial_workspace", auth);
    platformLoginState = {
      kind: "success",
      response: {
        endpoints: response.endpoints,
        user: response.user
      }
    };
    platformHealthState = {
      kind: "success",
      response: {
        reachable: true,
        message: "ok",
        endpoints: response.endpoints
      }
    };

    const nextConfigs = response.configs.filter((item) => item.isTrialEnabled && item.hasApiKey);
    const nextSessions = response.sessions;
    modelTrialConfigs = nextConfigs;
    modelTrialSessions = nextSessions;

    const defaultConfig =
      nextConfigs.find((item) => item.id === modelTrialSelectedConfigId) ??
      nextConfigs.find((item) => item.hasApiKey && item.isTrialEnabled) ??
      nextConfigs[0] ??
      null;
    modelTrialSelectedConfigId = defaultConfig?.id ?? null;

    const selectedSessionStillExists = nextSessions.some((item) => item.id === modelTrialSelectedSessionId);
    modelTrialSelectedSessionId = selectedSessionStillExists
      ? modelTrialSelectedSessionId
      : nextSessions[0]?.id ?? null;
    if (!modelTrialSelectedSessionId) {
      modelTrialDetail = null;
    }

    if (showNotice) {
      modelTrialNoticeMessage = t("model_trial_notice_refreshed");
    }
  } catch (error) {
    platformLoginState = { kind: "error", message: String(error) };
    modelTrialErrorMessage = `${t("model_trial_error_load")}: ${String(error)}`;
    appendLog(modelTrialErrorMessage);
  } finally {
    modelTrialWorkspaceLoading = false;
    renderPlatformPanels();
  }

  if (modelTrialSelectedSessionId !== null) {
    await loadModelTrialSessionDetail(modelTrialSelectedSessionId, true);
  }
}

async function createModelTrialSession() {
  const auth = currentPlatformAuthPayload();
  if (!auth) {
    modelTrialErrorMessage = t("model_trial_settings_required");
    renderPlatformPanels();
    return null;
  }
  if (!modelTrialSelectedConfigId) {
    modelTrialErrorMessage = t("model_trial_need_model");
    renderPlatformPanels();
    return null;
  }

  modelTrialCreating = true;
  modelTrialErrorMessage = null;
  modelTrialNoticeMessage = null;
  renderPlatformPanels();
  try {
    const response = await invoke<TrialSessionCreateResponse>("create_model_trial_session", {
      ...auth,
      llmConfigId: modelTrialSelectedConfigId,
      sourceQaItemId: null,
      sourceAnswerId: null,
      title: modelTrialLocalQuestionDetail?.item.question ?? currentModelTrialSelectedQuestion()?.question ?? null
    });
    modelTrialSelectedSessionId = response.sessionId;
    await loadModelTrialWorkspace(false);
    await loadModelTrialSessionDetail(response.sessionId, true);
    modelTrialNoticeMessage = t("model_trial_notice_created");
    return response.sessionId;
  } catch (error) {
    modelTrialErrorMessage = `${t("model_trial_error_create")}: ${String(error)}`;
    appendLog(modelTrialErrorMessage);
    renderPlatformPanels();
    return null;
  } finally {
    modelTrialCreating = false;
    renderPlatformPanels();
  }
}

async function sendModelTrialMessage() {
  const auth = currentPlatformAuthPayload();
  if (!auth) {
    modelTrialErrorMessage = t("model_trial_settings_required");
    renderPlatformPanels();
    return;
  }
  const content = modelTrialComposer.trim();
  if (!content) {
    modelTrialErrorMessage = t("model_trial_need_message");
    renderPlatformPanels();
    return;
  }
  if (!modelTrialSelectedConfigId) {
    modelTrialErrorMessage = t("model_trial_need_model");
    renderPlatformPanels();
    return;
  }

  modelTrialSending = true;
  modelTrialErrorMessage = null;
  modelTrialNoticeMessage = null;
  renderPlatformPanels();
  try {
    const sessionId = modelTrialSelectedSessionId ?? (await createModelTrialSession());
    if (!sessionId) {
      return;
    }
    await invoke<TrialSendMessageResponse>("send_model_trial_message", {
      ...auth,
      sessionId,
      content
    });
    modelTrialComposer = "";
    await loadModelTrialWorkspace(false);
    await loadModelTrialSessionDetail(sessionId, true);
  } catch (error) {
    modelTrialErrorMessage = `${t("model_trial_error_send")}: ${String(error)}`;
    appendLog(modelTrialErrorMessage);
  } finally {
    modelTrialSending = false;
    renderPlatformPanels();
  }
}

async function deleteModelTrialSession(sessionId: number) {
  const auth = currentPlatformAuthPayload();
  if (!auth) {
    modelTrialErrorMessage = t("model_trial_settings_required");
    renderPlatformPanels();
    return;
  }
  if (!window.confirm(`${t("model_trial_delete")} #${sessionId}?`)) {
    return;
  }

  modelTrialDeletingSessionId = sessionId;
  modelTrialErrorMessage = null;
  modelTrialNoticeMessage = null;
  renderPlatformPanels();
  try {
    await invoke("delete_model_trial_session", {
      ...auth,
      sessionId
    });
    if (modelTrialSelectedSessionId === sessionId) {
      modelTrialSelectedSessionId = null;
      modelTrialDetail = null;
    }
    await loadModelTrialWorkspace(false);
    modelTrialNoticeMessage = t("model_trial_notice_deleted");
  } catch (error) {
    modelTrialErrorMessage = `${t("model_trial_error_delete")}: ${String(error)}`;
    appendLog(modelTrialErrorMessage);
  } finally {
    modelTrialDeletingSessionId = null;
    renderPlatformPanels();
  }
}

async function openPlatformArea(kind: "qa-evaluate" | "model-trial") {
  const targetUrl = currentPlatformOpenUrl(kind);
  if (!targetUrl) {
    await refreshPlatformLogin();
  }
  const nextTargetUrl = currentPlatformOpenUrl(kind);
  if (!nextTargetUrl) {
    return;
  }

  try {
    await invoke("open_external_url", { url: nextTargetUrl });
    appendLog(
      kind === "qa-evaluate" ? t("platform_opened_qa_page") : t("platform_opened_trial_page")
    );
  } catch (error) {
    appendLog(`${t("platform_open_failed")}: ${String(error)}`);
  }
}

async function resumeBrowseBatch(batchId: string) {
  try {
    const batch = browseBatches.find((item) => item.id === batchId) ?? null;
    if (!batch || !canResumeBrowseBatch(batch)) {
      return;
    }
    const currentRequest = collectRequest();
    const loadedRequest = await invoke<PipelineFormRequest>("load_batch_pipeline_request", {
      batchId
    });
    const mergedRequest: PipelineFormRequest = {
      ...loadedRequest,
      apiKey: currentRequest.apiKey,
      qaPlatformUrl: currentRequest.qaPlatformUrl,
      qaPlatformUsername: currentRequest.qaPlatformUsername,
      qaPlatformPassword: currentRequest.qaPlatformPassword,
      literatureApiUrl: currentRequest.literatureApiUrl,
      literatureApiAuthToken: currentRequest.literatureApiAuthToken
    };

    managedResumeBatchId = batchId;
    managedResumeBatchLabel = batch?.topicName || batch?.name || batchId;
    applyRequest(mergedRequest);
    syncManagedRunModeUi();
    setCurrentTab("topic");
    void persistCurrentConfig(true);
    appendLog(t("log_loaded_batch_task"));
  } catch (error) {
    const batch = browseBatches.find((item) => item.id === batchId) ?? null;
    window.alert(`${batch ? browseResumeActionLabel(batch) : t("browse_action_continue")}: ${String(error)}`);
  }
}

async function loadBrowseBatches() {
  if (browseLoading) {
    return;
  }

  browseLoading = true;
  try {
    browseErrorMessage = null;
    const localBatches = await invoke<QaBatchSummary[]>("list_qa_batches");
    const hasPlatformAuth = Boolean(currentPlatformAuthPayload());
    let remoteBatch: QaBatchSummary | null = null;
    if (hasPlatformAuth) {
      try {
        remoteBatch = await loadRemoteVirtualBrowseBatchSummary();
      } catch (error) {
        clearBrowseRemoteVirtualBatch();
        appendLog(
          `${
            currentLang === "zh" ? "远程任务同步失败" : "Remote browse sync failed"
          }: ${String(error)}`
        );
      }
    } else {
      clearBrowseRemoteVirtualBatch();
    }
    browseBatches = mergeBrowseBatches(localBatches, remoteBatch);
    syncBrowsePlatformStatusCacheToCurrentBatches();
    if (!browseBatches.length) {
      browseView = "batches";
      browseSelectedBatchId = null;
      browsePageData = null;
      browseDetailData = null;
      browseReviewItems = [];
      browseReviewDrafts = new Map();
      browseQuestionsLoading = false;
      browseDetailLoading = false;
      browseReviewLoading = false;
      clearBrowsePlatformStatuses();
    } else if (!browseSelectedBatchId || !browseBatches.some((batch) => batch.id === browseSelectedBatchId)) {
      browseView = "batches";
      browseSelectedBatchId = null;
      browsePageData = null;
      browseDetailData = null;
      browseReviewItems = [];
      browseReviewDrafts = new Map();
      browseQuestionsLoading = false;
      browseDetailLoading = false;
      browseReviewLoading = false;
    }
    const localBatchIds = localBrowseBatches().map((batch) => batch.id);
    if (localBatchIds.length && hasPlatformAuth) {
      void syncBrowseBatchPlatformStatuses(
        localBatchIds,
        true
      );
    } else {
      clearBrowsePlatformStatuses();
    }
  } catch (error) {
    browseView = "batches";
    browseBatches = [];
    clearBrowseRemoteVirtualBatch();
    clearBrowsePlatformStatuses();
    browseSelectedBatchId = null;
    browsePageData = null;
    browseDetailData = null;
    browseReviewItems = [];
    browseReviewDrafts = new Map();
    browseQuestionsLoading = false;
    browseDetailLoading = false;
    browseReviewLoading = false;
    browseErrorMessage = `Browse QA failed: ${String(error)}`;
    appendLog(`Browse QA failed: ${String(error)}`);
  } finally {
    browseLoading = false;
    renderManagedRunPicker();
    renderBrowseView();
  }
}

async function loadBrowseQaPage(batchId: string, page: number) {
  browseSelectedBatchId = batchId;
  browseView = "questions";
  browseQuestionsLoading = true;
  browseDetailLoading = false;
  browseReviewLoading = false;
  browsePageData = null;
  browseDetailData = null;
  browseReviewItems = [];
  browseReviewDrafts = new Map();
  browseErrorMessage = null;
  renderBrowseView();

  try {
    if (isRemoteVirtualBrowseBatch(batchId)) {
      const detail = await ensureRemoteVirtualBrowseBatchDetail();
      browsePageData = remoteVirtualBrowsePageFromDetail(detail, page, 10);
    } else {
      browsePageData = await invoke<QaRecordPage>("list_batch_qa_records", {
        batchId,
        page,
        pageSize: 10
      });
    }
  } catch (error) {
    browsePageData = null;
    browseDetailData = null;
    browseErrorMessage = `Load QA list failed: ${String(error)}`;
    appendLog(`Browse QA page failed: ${String(error)}`);
  } finally {
    browseQuestionsLoading = false;
    renderBrowseView();
  }
}

async function loadBrowseDetail(batchId: string, qaId: string) {
  browseDetailLoading = true;
  browseView = "detail";
  browseErrorMessage = null;
  renderBrowseView();

  try {
    if (isRemoteVirtualBrowseBatch(batchId)) {
      const detail = await ensureRemoteVirtualBrowseBatchDetail();
      const item = detail.items.find((entry) => String(entry.id) === qaId);
      if (!item) {
        throw new Error(`QA record not found: ${qaId}`);
      }
      const batch = remoteVirtualBatchToBrowseSummary(detail.batch);
      browseDetailData = platformImportItemToQaRecordDetail(item, batch);
      browsePageData = remoteVirtualBrowsePageFromDetail(detail, browsePageData?.page ?? 1, 10);
    } else {
      browseDetailData = await invoke<QaRecordDetail>("get_batch_qa_record", {
        batchId,
        qaId
      });
    }
  } catch (error) {
    browseDetailData = null;
    browseErrorMessage = `Load QA detail failed: ${String(error)}`;
    appendLog(`Browse QA detail failed: ${String(error)}`);
  } finally {
    browseDetailLoading = false;
    renderBrowseView();
  }
}

async function loadBrowseReview(batchId: string) {
  if (isRemoteVirtualBrowseBatch(batchId)) {
    return;
  }

  browseSelectedBatchId = batchId;
  browseView = "review";
  browseReviewLoading = true;
  browseDetailData = null;
  browseReviewItems = [];
  browseReviewIndex = 0;
  browseReviewDrafts = new Map();
  browseErrorMessage = null;
  renderBrowseView();

  try {
    browseReviewItems = await invoke<QaRecordSummary[]>("list_batch_qa_question_options", {
      batchId
    });
    for (const item of browseReviewItems) {
      browseReviewDrafts.set(item.id, item.effectiveQuestion);
    }
  } catch (error) {
    browseReviewItems = [];
    browseErrorMessage = `Load QA review failed: ${String(error)}`;
    appendLog(`Browse QA review failed: ${String(error)}`);
  } finally {
    browseReviewLoading = false;
    renderBrowseView();
  }
}

async function saveBrowseReview(
  batchId: string,
  qaId: string,
  nextStatus?: ReviewStatus
) {
  if (browseReviewSaving) {
    return;
  }

  const item = browseReviewItems.find((entry) => entry.id === qaId);
  if (!item) {
    return;
  }

  browseReviewSaving = true;
  renderBrowseView();
  try {
    const response = await invoke<SaveBatchReviewItemResponse>("save_batch_review_item", {
      batchId,
      qaId,
      editedQuestion: currentBrowseReviewDraft(),
      status: nextStatus ?? null
    });
    applyBrowseReviewUpdate(batchId, qaId, response);
    if (nextStatus === "kept" || nextStatus === "discarded") {
      moveToNextBrowseReviewItem();
    }
    browseErrorMessage = null;
  } catch (error) {
    const message = `${t("browse_review_save_failed")}: ${String(error)}`;
    appendLog(message);
    window.alert(message);
  } finally {
    browseReviewSaving = false;
    renderBrowseView();
  }
}

function currentRunResponse(): PipelineResponse | null {
  return outputState.kind === "run_success" ? outputState.response : null;
}

function isPipelineCancelledMessage(message: string): boolean {
  return message.toLowerCase().includes("pipeline canceled by user");
}

function failureTitle(phase: "preview" | "run"): string {
  return t(phase === "preview" ? "preview_failed" : "pipeline_failed");
}

function updateRunOutputDirButton() {
  openRunOutputDirButton.hidden = true;
  openRunOutputDirButton.disabled = true;
}

function renderOutput() {
  setText("result-title", t("result_title"));
  setText("result-copy", t("result_copy"));
  setText("raw-output-summary", t("raw_json"));
  updateRunOutputDirButton();

  switch (outputState.kind) {
    case "idle":
      resultMode.textContent = t("output_mode_idle");
      renderEmptyCard(t("no_preview"));
      renderActionButtons([]);
      output.textContent = t("no_preview");
      outputDetails.hidden = true;
      outputDetails.open = false;
      return;
    case "preview_loading":
      resultMode.textContent = t("output_mode_preview");
      renderEmptyCard(t("preview_generating"));
      renderActionButtons([]);
      output.textContent = t("preview_generating");
      outputDetails.hidden = false;
      outputDetails.open = false;
      return;
    case "run_loading":
      resultMode.textContent = t("output_mode_run");
      renderEmptyCard(t("running_pipeline"));
      renderActionButtons([]);
      output.textContent = t("running_pipeline");
      outputDetails.hidden = false;
      outputDetails.open = false;
      return;
    case "preview_success":
      resultMode.textContent = t("output_mode_preview");
      renderCards([
        { labelKey: "summary_topic_name", value: outputState.preview.topic_name },
        { labelKey: "summary_target_count", value: formatCount(outputState.preview.target_count) },
        { labelKey: "summary_keyword_count", value: formatCount(outputState.preview.keywords.length) },
        { labelKey: "summary_subtopic_count", value: formatCount(outputState.preview.subtopics.length) },
        { labelKey: "summary_axis_count", value: formatCount(outputState.preview.question_axes.length) },
        { labelKey: "summary_goal", value: outputState.preview.goal, wide: true },
        { labelKey: "summary_keywords", value: outputState.preview.keywords.join(", "), wide: true }
      ]);
      renderActionButtons([]);
      output.textContent = JSON.stringify(outputState.preview, null, 2);
      outputDetails.hidden = false;
      outputDetails.open = false;
      return;
    case "run_success":
      resultMode.textContent = t("output_mode_run");
      renderCards([
        { labelKey: "summary_provider", value: outputState.response.generatedSummary.provider },
        { labelKey: "summary_model", value: outputState.response.generatedSummary.model },
        {
          labelKey: "summary_generated_count",
          value: formatCount(outputState.response.generatedSummary.generatedCount)
        },
        { labelKey: "summary_kept_count", value: formatCount(outputState.response.keptCount) },
        {
          labelKey: "summary_shards",
          value: `${formatCount(outputState.response.generatedSummary.completedShards)} / ${formatCount(outputState.response.generatedSummary.shardCount)} · ${t("skipped")} ${formatCount(outputState.response.generatedSummary.skippedShards)}`
        },
        {
          labelKey: "summary_request_count",
          value: formatCount(outputState.response.generatedSummary.requestCount)
        },
        { labelKey: "summary_dataset_path", value: outputState.response.datasetPath, wide: true },
        { labelKey: "summary_output_dir", value: outputState.response.outputDir, wide: true }
      ]);
      renderActionButtons([
        { key: "action_open_dataset", action: "open-dataset" },
        { key: "action_open_pack_summary", action: "open-pack-summary" },
        { key: "action_copy_dataset_path", action: "copy-dataset-path" }
      ]);
      output.textContent = JSON.stringify(outputState.response, null, 2);
      outputDetails.hidden = false;
      outputDetails.open = false;
      return;
    case "cancelled":
      resultMode.textContent = t("output_mode_cancelled");
      renderEmptyCard(outputState.message);
      renderActionButtons([]);
      output.textContent = outputState.message;
      outputDetails.hidden = false;
      outputDetails.open = false;
      return;
    case "validation_error":
      resultMode.textContent = t("output_mode_validation");
      renderValidationIssues(outputState.issues);
      renderActionButtons([]);
      output.textContent = [t("validation_failed"), ...outputState.issues.map((issue) => `- ${t(issue)}`)].join("\n");
      outputDetails.hidden = false;
      outputDetails.open = true;
      return;
    case "error":
      resultMode.textContent = t("output_mode_error");
      renderEmptyCard(`${failureTitle(outputState.phase)}: ${outputState.message}`);
      renderActionButtons([]);
      output.textContent = `${failureTitle(outputState.phase)}: ${outputState.message}`;
      outputDetails.hidden = false;
      outputDetails.open = true;
  }
}

function setText(id: string, value: string) {
  const element = document.querySelector<HTMLElement>(`#${id}`);
  if (element) {
    element.textContent = value;
  }
}

function applyTranslations() {
  document.documentElement.lang = currentLang;
  langSelect.value = currentLang;
  topbarTabSelect.value = currentTab;
  setText("eyebrow", t("eyebrow"));
  setText("workspace-switch-label", t("nav_title"));
  setText("lang-label", t("lang_label"));
  setText("hero-title", t("hero_title"));
  setText("hero-lede", t("hero_lede"));
  setText("tab-topic-label", t("tab_topic"));
  setText("tab-settings-label", t("tab_settings"));
  setText("tab-browse-label", t("tab_browse"));
  setText("tab-qa-evaluate-label", t("tab_qa_evaluate"));
  setText("tab-model-trial-label", t("tab_model_trial"));
  setText("tab-recent-updates-label", t("tab_recent_updates"));
  setText("tab-chat-qa-label", t("tab_chat_qa"));
  setText("tab-feedback2-label", t("tab_feedback2"));
  setText("topbar-tab-option-recent-updates", t("tab_recent_updates"));
  setText("topbar-tab-option-chat-qa", t("tab_chat_qa"));
  setText("topbar-tab-option-topic", t("tab_topic"));
  setText("topbar-tab-option-browse", t("tab_browse"));
  setText("topbar-tab-option-qa-evaluate", t("tab_qa_evaluate"));
  setText("topbar-tab-option-model-trial", t("tab_model_trial"));
  setText("topbar-tab-option-settings", t("tab_settings"));
  setText("topbar-tab-option-feedback2", t("tab_feedback2"));
  updateCheckButtonUi();
  setText("topic-tab-title", t("topic_tab_title"));
  setText("settings-tab-title", t("settings_tab_title"));
  setText("settings-basic-copy", t("settings_basic_copy"));
  setText("cot-structure-section-title", t("cot_structure_section_title"));
  setText("literature-section-title", t("literature_section_title"));
  setText("cot-section-headers-label", t("cot_section_headers"));
  setText("cot-section-headers-hint", t("cot_section_headers_hint"));
  setText(
    "settings-version",
    currentLang === "zh" ? `当前版本：v${appVersion}` : `Current version: v${appVersion}`
  );
  setText("browse-tab-title", t("browse_tab_title"));
  setText("qa-evaluate-tab-title", t("qa_evaluate_tab_title"));
  setText("chat-qa-tab-title", t("tab_chat_qa"));
  setText("chat-qa-tab-copy", t("chat_qa_tab_copy"));
  setText("chat-qa-send", t("chat_qa_send"));
  chatQaInput?.setAttribute("placeholder", t("chat_qa_placeholder"));
  setText("qa-evaluate-tab-copy", t("qa_evaluate_tab_copy"));
  setText("model-trial-tab-title", t("model_trial_tab_title"));
  setText("model-trial-tab-copy", t("model_trial_tab_copy"));
  setText("recent-updates-title", t("recent_updates_title"));
  setText("feedback2-panel-title", t("tab_feedback2"));
  setText("feedback2-email-title", t("feedback_email"));
  setText("feedback2-email-hint", t("feedback_email_hint"));
  setText("feedback2-email-link", t("feedback_email"));
  setText("feedback2-github-title", t("feedback_github"));
  setText("feedback2-github-hint", t("feedback_github_hint"));
  setText("feedback2-github-button", t("feedback_github"));
  setText("feedback2-form-title", t("feedback_form"));
  setText("feedback2-form-hint", t("feedback_form_hint"));
  setText("feedback2-login-required", t("feedback_form_login_required"));
  setText("feedback2-title-label", t("feedback_title_label"));
  document.querySelector<HTMLInputElement>("#feedback2-title")?.setAttribute("placeholder", t("feedback_title_placeholder"));
  setText("feedback2-content-label", t("feedback_content_label"));
  document.querySelector<HTMLTextAreaElement>("#feedback2-content")?.setAttribute("placeholder", t("feedback_content_placeholder"));
  setText("feedback2-category-label", t("feedback_category_label"));
  setText("feedback2-cat-feature", t("feedback_category_feature"));
  setText("feedback2-cat-bug", t("feedback_category_bug"));
  setText("feedback2-cat-other", t("feedback_category_other"));
  setText("feedback2-submit-button", t("feedback_submit"));
  setText("model-section-title", t("model_section_title"));
  setText("output-section-title", t("output_root"));
  setText("output-root-label", t("output_root"));
  setText("output-root-hint", t("output_root_hint"));
  setText("select-output-root", t("action_select_output_dir"));
  setText("open-output-root", t("action_open_output_dir"));
  setText("reset-output-root", t("action_restore_default"));
  setText("integration-section-title", t("integration_section_title"));
  setText("runtime-section-title", t("runtime_section_title"));
  setText("advanced-settings-summary", t("advanced_settings_summary"));
  setText("advanced-settings-copy", t("advanced_settings_copy"));
  setText("run-lock-banner", t("run_locked_hint"));
  setText("managed-run-mode-label", t("managed_run_mode"));
  setText("managed-run-mode-new-label", t("managed_run_mode_new"));
  setText("managed-run-mode-resume-latest-label", t("managed_run_mode_resume_latest"));
  setText("managed-run-mode-hint", t("managed_run_mode_hint"));
  setText("managed-run-pick-label", t("managed_run_mode_pick_label"));
  setText("managed-run-pick-hint", t("managed_run_mode_pick_hint"));
  syncManagedRunModeUi();
  setText("topic-prompt-label", t("topic_prompt"));
  setText("topic-tags-label", t("topic_tags"));
  setText("topic-tags-hint", t("topic_tags_hint"));
  setText("qa-mode-label", t("qa_mode"));
  setText("qa-mode-hint", t("qa_mode_hint"));
  setText("qa-mode-normal-label", t("qa_mode_normal"));
  setText("qa-mode-cot-label", t("qa_mode_cot"));
  setText("selected-tags-label", t("selected_tags"));
  setText("quick-tags-label", t("quick_tags"));
  setText("open-topic-field-selector", t("topic_field_selector"));
  setText("topic-field-selector-hint", t("topic_field_selector_hint"));
  setText("topic-field-modal-title", t("topic_field_modal_title"));
  setText("topic-field-modal-copy", t("topic_field_modal_copy"));
  setText("topic-field-primary-title", t("topic_field_primary_title"));
  setText("topic-field-detail-title", t("topic_field_detail_title"));
  setText("topic-field-pending-title", t("topic_field_pending_title"));
  setText("confirm-topic-field-selection", t("topic_field_add_selected"));
  setText("cancel-topic-field-selection", t("topic_field_cancel"));
  setText("close-topic-field-modal", t("topic_field_close"));
  setText("provider-preset-label", t("provider_preset"));
  setText("provider-label", t("provider"));
  setText("model-label", t("model"));
  setText("custom-model-label", t("custom_model"));
  setText("base-url-label", t("base_url"));
  setText("api-key-label", t("api_key"));
  setText("qa-platform-env-label", t("qa_platform_env_label"));
  setText("qa-platform-username-label", t("qa_platform_username"));
  setText("qa-platform-password-label", t("qa_platform_password"));
  setText("literature-api-url-label", t("literature_api_url"));
  setText("literature-api-auth-label", t("literature_api_auth"));
  setText("literature-api-auth-hint", t("literature_api_auth_hint"));
  setText("provider-preset-option-custom", t("preset_custom"));
  setText("provider-preset-option-qwen", t("preset_qwen_dashscope"));
  setText("provider-preset-option-deepseek", t("preset_deepseek"));
  setText("provider-preset-option-moonshot", t("preset_moonshot_kimi"));
  setText("provider-preset-option-zhipu", t("preset_zhipu_glm"));
  setText("provider-preset-option-minimax", t("preset_minimax"));
  setText("provider-preset-option-hunyuan", t("preset_tencent_hunyuan"));
  setText("provider-preset-option-qianfan", t("preset_baidu_qianfan"));
  setText("provider-preset-option-stub", t("preset_stub_local"));
  setText("provider-preset-option-platform", t("preset_platform"));
  setText("target-count-label", t("target_count"));
  setText("plan-limit-label", t("plan_limit"));
  setText("shard-size-label", t("shard_size"));
  setText("batch-size-label", t("batch_size"));
  setText("max-in-flight-label", t("max_in_flight"));
  setText("max-retries-label", t("max_retries"));
  setText("timeout-secs-label", t("timeout_secs"));
  setText("resume-existing-label", t("resume_existing"));
  setText("result-title", t("result_title"));
  setText("run-logs-title", t("run_logs_title"));
  setText("run-stats-title", t("run_stats_title"));
  setText("export-logs", t("action_export_logs"));
  setText("browse-batches-title", t("browse_batches_title"));
  for (const button of fieldHelpButtons) {
    button.title = t("field_help_button");
    button.setAttribute("aria-label", t("field_help_button"));
  }
  customModelInput.placeholder = currentLang === "zh" ? "例如 glm-5.1" : "For example: glm-5.1";
  syncModelOptions(providerPresetInput.value as ProviderPresetId);
  setText("browse-questions-title", t("browse_questions_title"));
  setText("browse-detail-title", t("browse_detail_title"));
  updateRunButtonUi();
  addTopicTagButton.textContent = t("add_tag");
  topicTagInput.placeholder = t("custom_tag_placeholder");
  setText("qa-platform-dev-label", t("qa_platform_dev"));
  setText("qa-platform-prod-label", t("qa_platform_prod"));
  platformLoginButton.textContent = t("platform_action_login");
  qaPlatformUsernameInput.placeholder = currentLang === "zh" ? "你的平台账号" : "your account";
  literatureApiUrlInput.placeholder = "https://example.com/literature/api";
  updateApiKeyVisibilityUi();
  appVersionBadge.textContent = `v${appVersion}`;
  renderPlatformPanels();
  const logPlaceholderKey = findMatchingTranslationKey(logs.textContent, [
    "no_run",
    "waiting_events"
  ]);
  if (logPlaceholderKey) {
    logs.textContent = t(logPlaceholderKey);
  }
  updateRuntimeConstraintHint();
  setStatus(currentStatus, currentStatus !== "idle");
  renderProgressSnapshot(lastPipelineProgressEvent);
  setCurrentTab(currentTab);
  renderTopicTags();
  renderTopicFieldModal();
  renderSetupSummary();
  renderOutput();
  renderBrowseView();
  syncStickyOffsets();
}

function readNumber(input: HTMLInputElement): number {
  return Number.parseInt(input.value, 10);
}

function defaultNumberValue(input: HTMLInputElement): number {
  const value = Number.parseInt(input.defaultValue, 10);
  return Number.isFinite(value) ? value : 1;
}

function readOptionalInteger(input: HTMLInputElement): number | null {
  const trimmed = input.value.trim();
  if (!trimmed) {
    return null;
  }

  const value = Number.parseInt(trimmed, 10);
  return Number.isFinite(value) ? value : null;
}

function setNumberValueIfNeeded(input: HTMLInputElement, value: number) {
  const next = String(value);
  if (input.value !== next) {
    input.value = next;
  }
}

function updateRuntimeConstraintHint() {
  runtimeConstraintHint.textContent = t(
    currentQaMode() === "cot" ? "runtime_constraint_hint_cot" : "runtime_constraint_hint_normal"
  );
}

function syncRuntimeParameterInputBounds() {
  const targetValue = readOptionalInteger(targetCountInput) ?? defaultNumberValue(targetCountInput);
  const safeTarget = Math.max(
    1,
    currentQaMode() === "cot" ? Math.min(targetValue, COT_TARGET_COUNT_CAP) : targetValue
  );
  const shardCap =
    currentQaMode() === "cot" ? Math.min(safeTarget, COT_SAFE_SHARD_SIZE_CAP) : safeTarget;
  const currentShardValue = readOptionalInteger(shardSizeInput);
  const batchCap =
    currentQaMode() === "cot"
      ? 1
      : Math.max(1, Math.min(currentShardValue ?? shardCap, shardCap));

  targetCountInput.min = "1";
  targetCountInput.max = currentQaMode() === "cot" ? String(COT_TARGET_COUNT_CAP) : "";
  planLimitInput.min = "1";
  shardSizeInput.min = "1";
  shardSizeInput.max = String(Math.max(1, shardCap));
  batchSizeInput.min = "1";
  batchSizeInput.max = String(batchCap);
  maxInFlightInput.min = "1";
  maxInFlightInput.max = currentQaMode() === "cot" ? String(DEFAULT_COT_MAX_IN_FLIGHT) : "";
  maxRetriesInput.min = "0";
  timeoutInput.min = "1";
}

function syncRuntimeParameterControlStates() {
  if (isPipelineBusyStatus(currentStatus)) {
    return;
  }

  const cotMode = currentQaMode() === "cot";
  const resumeMode = currentManagedRunMode() !== "new";
  batchSizeInput.disabled = cotMode;
  maxInFlightInput.disabled = cotMode;
  if (resumeMode) {
    resumeInput.checked = true;
  }
  resumeInput.disabled = resumeMode;
}

function syncManagedRunModeUi() {
  managedRunBanner.hidden = !managedResumeBatchId;
  managedRunModeCurrent.textContent = managedResumeBatchId
    ? formatMessage("managed_run_mode_exact_hint", managedResumeBatchLabel ?? managedResumeBatchId)
    : "";
  clearManagedResumeBatchButton.textContent = t("managed_run_mode_clear");
  renderManagedRunPicker();
}

function renderManagedRunPicker() {
  const localBatches = localBrowseBatches();
  const options = [
    {
      value: "",
      label: localBatches.length ? t("managed_run_mode_pick_placeholder") : t("managed_run_mode_pick_empty")
    },
    ...localBatches.map((batch) => ({
      value: batch.id,
      label: `${batch.topicName || batch.name} · ${formatUpdatedAt(batch.updatedAtMs)}`
    }))
  ];

  managedRunPickInput.innerHTML = options
    .map(
      ({ value, label }) =>
        `<option value="${escapeHtml(value)}"${value === "" ? "" : ""}>${escapeHtml(label)}</option>`
    )
    .join("");
  managedRunPickInput.value = managedResumeBatchId ?? "";
  managedRunPickInput.disabled =
    currentStatus === "running" || currentStatus === "stopping" || localBatches.length === 0;
}

function clearManagedResumeBatch(logChange = false) {
  managedResumeBatchId = null;
  managedResumeBatchLabel = null;
  managedRunModeNewInput.checked = true;
  managedRunModeResumeLatestInput.checked = false;
  syncManagedRunModeUi();
  syncRuntimeParameterControlStates();
  if (logChange) {
    appendLog(t("log_cleared_batch_task"));
  }
}

function normalizeRuntimeParameterInputs(commit = false) {
  const cotMode = currentQaMode() === "cot";
  const fallbackTarget = cotMode ? DEFAULT_COT_TARGET_COUNT : defaultNumberValue(targetCountInput);
  const fallbackShard = cotMode ? DEFAULT_COT_SHARD_SIZE : defaultNumberValue(shardSizeInput);
  const fallbackBatch = cotMode ? DEFAULT_COT_BATCH_SIZE : defaultNumberValue(batchSizeInput);
  const fallbackMaxInFlight = cotMode
    ? DEFAULT_COT_MAX_IN_FLIGHT
    : defaultNumberValue(maxInFlightInput);
  const fallbackPlanLimit = defaultNumberValue(planLimitInput);
  const fallbackMaxRetries = Math.max(0, defaultNumberValue(maxRetriesInput));
  const fallbackTimeout = defaultNumberValue(timeoutInput);

  let target = readOptionalInteger(targetCountInput);
  let planLimit = readOptionalInteger(planLimitInput);
  let shardSize = readOptionalInteger(shardSizeInput);
  let batchSize = readOptionalInteger(batchSizeInput);
  let maxInFlight = readOptionalInteger(maxInFlightInput);
  let maxRetries = readOptionalInteger(maxRetriesInput);
  let timeout = readOptionalInteger(timeoutInput);

  if (commit) {
    target ??= fallbackTarget;
    planLimit ??= fallbackPlanLimit;
    shardSize ??= fallbackShard;
    batchSize ??= fallbackBatch;
    maxInFlight ??= fallbackMaxInFlight;
    maxRetries ??= fallbackMaxRetries;
    timeout ??= fallbackTimeout;
  }

  if (target !== null) {
    target = Math.max(1, cotMode ? Math.min(target, COT_TARGET_COUNT_CAP) : target);
    setNumberValueIfNeeded(targetCountInput, target);
  }

  if (planLimit !== null) {
    planLimit = Math.max(1, planLimit);
    setNumberValueIfNeeded(planLimitInput, planLimit);
  }

  if (shardSize !== null) {
    const shardUpperBound = target !== null
      ? cotMode
        ? Math.min(target, COT_SAFE_SHARD_SIZE_CAP)
        : target
      : cotMode
        ? COT_SAFE_SHARD_SIZE_CAP
        : null;
    shardSize = Math.max(1, shardSize);
    if (shardUpperBound !== null) {
      shardSize = Math.min(shardSize, Math.max(1, shardUpperBound));
    }
    setNumberValueIfNeeded(shardSizeInput, shardSize);
  }

  if (batchSize !== null) {
    batchSize = cotMode ? 1 : Math.max(1, batchSize);
    if (!cotMode && shardSize !== null) {
      batchSize = Math.min(batchSize, Math.max(1, shardSize));
    }
    setNumberValueIfNeeded(batchSizeInput, batchSize);
  }

  if (maxInFlight !== null) {
    maxInFlight = cotMode ? DEFAULT_COT_MAX_IN_FLIGHT : Math.max(1, maxInFlight);
    setNumberValueIfNeeded(maxInFlightInput, maxInFlight);
  }

  if (maxRetries !== null) {
    maxRetries = Math.max(0, maxRetries);
    setNumberValueIfNeeded(maxRetriesInput, maxRetries);
  }

  if (timeout !== null) {
    timeout = Math.max(1, timeout);
    setNumberValueIfNeeded(timeoutInput, timeout);
  }

  syncRuntimeParameterInputBounds();
  updateRuntimeConstraintHint();
  syncRuntimeParameterControlStates();
}

async function showSettingHelp(helpKey: string) {
  const content = SETTING_HELP_CONTENT[currentLang][helpKey];
  if (!content) {
    return;
  }

  await message(content.body, {
    title: content.title,
    kind: "info"
  });
}

function isPipelineBusyStatus(statusValue: typeof currentStatus): boolean {
  return statusValue === "running" || statusValue === "stopping";
}

function runReadinessMissingKeys(): string[] {
  const missingKeys: string[] = [];

  if (!promptInput.value.trim()) {
    missingKeys.push("run_readiness_missing_prompt");
  }
  const resolved = resolveLLMProvider();
  if (resolved.mode === "none") {
    missingKeys.push("settings_checklist_missing_provider");
  }
  if (!resolved.model) {
    missingKeys.push("settings_checklist_missing_model");
  }
  if (resolved.mode === "settings") {
    if (!resolved.baseUrl) missingKeys.push("settings_checklist_missing_base_url");
    if (!resolved.apiKey) missingKeys.push("settings_checklist_missing_api_key");
  }

  return missingKeys;
}

function hasModelSettingsReady() {
  return runReadinessMissingKeys().every((key) =>
    ![
      "settings_checklist_missing_provider",
      "settings_checklist_missing_model",
      "settings_checklist_missing_base_url",
      "settings_checklist_missing_api_key"
    ].includes(key)
  );
}

function isRunReady() {
  return runReadinessMissingKeys().length === 0;
}

function updateRunButtonUi() {
  runButton.dataset.intent = currentStatus === "running" || currentStatus === "stopping" ? "stop" : "run";
  if (currentStatus === "running") {
    runButton.textContent = t("stop_run");
  } else if (currentStatus === "stopping") {
    runButton.textContent = t("stop_requested");
  } else if (shouldShowContinueRunButton()) {
    runButton.textContent = t("continue_run");
  } else {
    runButton.textContent = t("run_pipeline");
  }

  runButton.disabled =
    currentStatus === "previewing" ||
    currentStatus === "updating" ||
    currentStatus === "stopping" ||
    (currentStatus !== "running" && !isRunReady());
}

function buildLogExportFileName() {
  const now = new Date();
  const parts = [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, "0"),
    String(now.getDate()).padStart(2, "0"),
    String(now.getHours()).padStart(2, "0"),
    String(now.getMinutes()).padStart(2, "0"),
    String(now.getSeconds()).padStart(2, "0")
  ];

  return `distill-studio-run-log-${parts.join("")}.txt`;
}

function clearBrowsePlatformStatuses() {
  browsePlatformStatusRequestId += 1;
  browsePlatformStatusLoading = false;
  browsePlatformStatusMap = new Map();
}

function syncBrowsePlatformStatusCacheToCurrentBatches() {
  const validIds = new Set(localBrowseBatches().map((batch) => batch.id));
  browsePlatformStatusMap = new Map(
    [...browsePlatformStatusMap.entries()].filter(([batchId]) => validIds.has(batchId))
  );
}

async function syncBrowseBatchPlatformStatuses(
  batchIds: string[] = browseBatches.map((batch) => batch.id),
  silent = true
) {
  const auth = currentPlatformAuthPayload();
  const normalizedBatchIds = [
    ...new Set(
      batchIds
        .map((batchId) => batchId.trim())
        .filter((batchId) => batchId && !isRemoteVirtualBrowseBatch(batchId))
    )
  ];

  if (!auth || !normalizedBatchIds.length) {
    clearBrowsePlatformStatuses();
    renderBrowseView();
    return;
  }

  const requestId = ++browsePlatformStatusRequestId;
  browsePlatformStatusLoading = true;
  if (!silent) {
    renderBrowseView();
  }

  try {
    const response = await invoke<QaBatchPlatformStatusResponse>("get_qa_batch_platform_statuses", {
      ...auth,
      batchIds: normalizedBatchIds
    });
    if (requestId !== browsePlatformStatusRequestId) {
      return;
    }

    const nextMap = new Map(browsePlatformStatusMap);
    for (const item of response.items) {
      nextMap.set(item.externalBatchId, item);
    }
    browsePlatformStatusMap = nextMap;
    syncBrowsePlatformStatusCacheToCurrentBatches();
    platformHealthState = {
      kind: "success",
      response: {
        reachable: true,
        message: "ok",
        endpoints: response.endpoints
      }
    };
  } catch (error) {
    if (requestId !== browsePlatformStatusRequestId) {
      return;
    }
    if (!silent) {
      appendLog(`${t("browse_platform_status_sync_failed")}: ${String(error)}`);
    }
  } finally {
    if (requestId === browsePlatformStatusRequestId) {
      browsePlatformStatusLoading = false;
      renderBrowseView();
    }
  }
}

async function exportLogs() {
  const placeholderKey = findMatchingTranslationKey(logs.textContent, ["no_run", "waiting_events"]);
  if (placeholderKey || !logs.textContent?.trim()) {
    appendLog(t("log_export_empty"));
    return;
  }

  try {
    const fileName = buildLogExportFileName();
    const blob = new Blob([`${logs.textContent.trimEnd()}\n`], {
      type: "text/plain;charset=utf-8"
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = fileName;
    link.style.display = "none";
    document.body.append(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
    appendLog(formatMessage("log_exported_logs", fileName));
  } catch (error) {
    appendLog(`${t("log_export_failed")}: ${String(error)}`);
  }
}

function setControlsLocked(locked: boolean) {
  for (const control of lockableControls) {
    control.disabled = locked;
  }
  runLockBanner.hidden = !locked;
  syncRuntimeParameterControlStates();
}

function formatProgressSummary(payload: PipelineProgressEvent | null): string {
  if (!payload?.shardCount || !payload.shardIndex) {
    return payload ? `${payload.currentStep} / ${payload.totalSteps}` : "0 / 5";
  }

  return currentLang === "zh"
    ? `分片 ${payload.shardIndex} / ${payload.shardCount}`
    : `Shard ${payload.shardIndex} / ${payload.shardCount}`;
}

function formatProgressDetail(payload: PipelineProgressEvent | null): string {
  if (!payload?.shardCount || !payload.shardIndex || !payload.shardItemTotal) {
    return "";
  }

  const shardCompleted = payload.shardItemCompleted ?? 0;
  const totalGenerated = payload.totalGenerated ?? 0;
  const targetCount = payload.targetCount ?? 0;

  return currentLang === "zh"
    ? `当前 shard ${formatCount(shardCompleted)} / ${formatCount(payload.shardItemTotal)} · 总计 ${formatCount(totalGenerated)} / ${formatCount(targetCount)}`
    : `Current shard ${formatCount(shardCompleted)} / ${formatCount(payload.shardItemTotal)} · Total ${formatCount(totalGenerated)} / ${formatCount(targetCount)}`;
}

function renderProgressSnapshot(payload: PipelineProgressEvent | null) {
  progressMeta.textContent = formatProgressSummary(payload);
  progressDetail.textContent = formatProgressDetail(payload);
  renderRunStats();
}

function setProgressFill(percent: number) {
  const safePercent = Math.max(0, Math.min(100, percent));
  progressFill.style.width = `${safePercent}%`;
}

function updateProgressFromEvent(payload: PipelineProgressEvent) {
  const mergedPayload: PipelineProgressEvent =
    lastPipelineProgressEvent === null
      ? payload
      : {
          ...lastPipelineProgressEvent,
          ...payload,
          runtimeKind: payload.runtimeKind ?? lastPipelineProgressEvent.runtimeKind ?? null,
          retryAttempt: payload.retryAttempt ?? lastPipelineProgressEvent.retryAttempt ?? null,
          retryLimit: payload.retryLimit ?? lastPipelineProgressEvent.retryLimit ?? null,
          attemptNumber: payload.attemptNumber ?? lastPipelineProgressEvent.attemptNumber ?? null,
          attemptLimit: payload.attemptLimit ?? lastPipelineProgressEvent.attemptLimit ?? null,
          errorMessage: payload.errorMessage ?? lastPipelineProgressEvent.errorMessage ?? null,
          shardIndex: payload.shardIndex ?? lastPipelineProgressEvent.shardIndex ?? null,
          shardCount: payload.shardCount ?? lastPipelineProgressEvent.shardCount ?? null,
          shardItemCompleted:
            payload.shardItemCompleted ?? lastPipelineProgressEvent.shardItemCompleted ?? null,
          shardItemTotal: payload.shardItemTotal ?? lastPipelineProgressEvent.shardItemTotal ?? null,
          totalGenerated: payload.totalGenerated ?? lastPipelineProgressEvent.totalGenerated ?? null,
          targetCount: payload.targetCount ?? lastPipelineProgressEvent.targetCount ?? null,
          batchIndex: payload.batchIndex ?? lastPipelineProgressEvent.batchIndex ?? null,
          batchCountInShard:
            payload.batchCountInShard ?? lastPipelineProgressEvent.batchCountInShard ?? null,
          batchSize: payload.batchSize ?? lastPipelineProgressEvent.batchSize ?? null,
          durationMs: payload.durationMs ?? lastPipelineProgressEvent.durationMs ?? null,
          backoffSecs: payload.backoffSecs ?? lastPipelineProgressEvent.backoffSecs ?? null,
          subtopic: payload.subtopic ?? lastPipelineProgressEvent.subtopic ?? null,
          axis: payload.axis ?? lastPipelineProgressEvent.axis ?? null,
          questionType: payload.questionType ?? lastPipelineProgressEvent.questionType ?? null,
          difficulty: payload.difficulty ?? lastPipelineProgressEvent.difficulty ?? null,
          audience: payload.audience ?? lastPipelineProgressEvent.audience ?? null
        };
  lastPipelineProgressEvent = mergedPayload;
  updateRunStatsFromEvent(payload);

  if (
    mergedPayload.stage === "generate" &&
    mergedPayload.targetCount &&
    mergedPayload.totalGenerated !== null &&
    mergedPayload.totalGenerated !== undefined
  ) {
    const generatedRatio =
      mergedPayload.targetCount <= 0 ? 0 : mergedPayload.totalGenerated / mergedPayload.targetCount;
    setProgressFill(((3 + generatedRatio) / mergedPayload.totalSteps) * 100);
  } else {
    const safeTotal = mergedPayload.totalSteps <= 0 ? 1 : mergedPayload.totalSteps;
    setProgressFill((mergedPayload.currentStep / safeTotal) * 100);
  }

  renderProgressSnapshot(mergedPayload);
}

function setStatus(nextStatus: "idle" | "previewing" | "running" | "stopping" | "updating", busy = false) {
  currentStatus = nextStatus;
  status.textContent = t(`status_${nextStatus}`);
  status.dataset.busy = busy ? "true" : "false";
  checkUpdateButton.disabled = busy;
  setControlsLocked(isPipelineBusyStatus(nextStatus));
  updateRunButtonUi();
  updateCheckButtonUi();
}

function appendLog(line: string) {
  const now = new Date().toLocaleTimeString();
  const next = `[${now}] ${line}`;
  logs.textContent = matchesAnyTranslation(logs.textContent, ["no_run", "waiting_events"])
    ? next
    : `${logs.textContent}\n${next}`;
  logs.scrollTop = logs.scrollHeight;
}

function resetTelemetry() {
  lastPipelineProgressEvent = null;
  logs.textContent = t("waiting_events");
  setProgressFill(0);
  resetRunStats();
  renderProgressSnapshot(null);
}

async function copyText(value: string) {
  try {
    await navigator.clipboard.writeText(value);
    appendLog(formatMessage("log_copied_value", value));
  } catch (error) {
    appendLog(`${t("log_copy_failed")}: ${String(error)}`);
  }
}

async function openResultPath(path: string) {
  try {
    await invoke("open_path", { path });
    appendLog(formatMessage("log_opened_path", path));
  } catch (error) {
    appendLog(`${t("log_open_failed")}: ${String(error)}`);
  }
}

async function loadManagedOutputRoot() {
  try {
    const response = await invoke<ManagedOutputRootResponse>("get_managed_output_root");
    if (!outputRootInput.value.trim()) {
      outputRootInput.value = response.outputRoot;
    }
  } catch (error) {
    appendLog(`${t("log_load_failed")}: ${String(error)}`);
  }
}

async function resetManagedOutputRootToDefault(logSelection: boolean) {
  const previousValue = outputRootInput.value.trim();
  outputRootInput.value = "";
  try {
    const response = await invoke<ManagedOutputRootResponse>("get_managed_output_root");
    outputRootInput.value = response.outputRoot;
    clearManagedResumeBatch(false);
    await persistCurrentConfig(true);
    if (logSelection) {
      appendLog(`${t("log_selected_output")}: ${response.outputRoot}`);
    }
    if (previousValue !== response.outputRoot) {
      void loadBrowseBatches();
    }
  } catch (error) {
    outputRootInput.value = previousValue;
    appendLog(`${t("log_load_failed")}: ${String(error)}`);
  }
}

async function chooseManagedOutputRoot() {
  try {
    const selected = await open({
      directory: true,
      multiple: false,
      defaultPath: currentManagedOutputRoot() || undefined
    });
    if (!selected || Array.isArray(selected)) {
      return;
    }
    if (selected === currentManagedOutputRoot()) {
      return;
    }
    outputRootInput.value = selected;
    clearManagedResumeBatch(false);
    await persistCurrentConfig(true);
    appendLog(`${t("log_selected_output")}: ${selected}`);
    void loadBrowseBatches();
  } catch (error) {
    appendLog(`${t("log_browse_failed")}: ${String(error)}`);
  }
}

function collectRequest() {
  normalizeRuntimeParameterInputs(true);
  const resolved = resolveLLMProvider();

  const request: PipelineFormRequest = {
    prompt: promptInput.value.trim(),
    topicTags: [...topicTags],
    qaMode: currentQaMode(),
    outputLanguage: currentLang,
    cotSectionHeaders: normalizeCotSectionHeaders(cotSectionHeadersInput.value.split(/\r?\n/)),
    targetCount: readNumber(targetCountInput),
    planLimit: readNumber(planLimitInput),
    outputDir: MANAGED_OUTPUT_DIR,
    managedOutputRoot: currentManagedOutputRoot() || null,
    provider: resolved.mode === "settings" ? resolved.provider : "openai-compatible",
    model: resolved.model,
    baseUrl: resolved.mode === "settings" ? resolved.baseUrl : null,
    apiKey: resolved.mode === "settings" ? resolved.apiKey : null,
    apiKeyEnv: null,
    temperature: resolved.mode === "platform"
      ? (currentPlatformGenerateModel()?.temperature ?? 0.8)
      : 0.8,
    maxTokens: resolved.mode === "platform"
      ? (currentPlatformGenerateModel()?.maxTokens ?? 800)
      : (providerInput.value === "openai-compatible" ? 2400 : 800),
    shardSize: readNumber(shardSizeInput),
    batchSize: readNumber(batchSizeInput),
    maxInFlight: readNumber(maxInFlightInput),
    maxRetries: readNumber(maxRetriesInput),
    requestTimeoutSecs: readNumber(timeoutInput),
    resume: resumeInput.checked,
    managedRunMode: currentManagedRunMode(),
    managedRunBatchId: managedResumeBatchId,
    qaPlatformUrl: currentQaPlatformUrl() || null,
    qaPlatformUsername: qaPlatformUsernameInput.value.trim() || null,
    qaPlatformPassword: qaPlatformPasswordInput.value.trim() || null,
    literatureApiUrl: literatureApiUrlInput.value.trim() || null,
    literatureApiAuthToken: literatureApiAuthInput.value.trim() || null
  };

  return request;
}

function validateRequest(request: PipelineFormRequest): ValidationIssueKey[] {
  const issues: ValidationIssueKey[] = [];

  if (!request.prompt) {
    issues.push("validation_issue_prompt_required");
  }
  if (!request.model) {
    issues.push("validation_issue_model_required");
  }
  const resolved = resolveLLMProvider();
  if (resolved.mode === "settings") {
    if (!request.baseUrl) issues.push("validation_issue_base_url_required");
    if (!request.apiKey) issues.push("validation_issue_api_key_required");
  }
  if (!Number.isInteger(request.targetCount) || request.targetCount <= 0) {
    issues.push("validation_issue_target_count_invalid");
  }
  if (!Number.isInteger(request.planLimit) || request.planLimit <= 0) {
    issues.push("validation_issue_plan_limit_invalid");
  }
  if (!Number.isInteger(request.shardSize) || request.shardSize <= 0) {
    issues.push("validation_issue_shard_size_invalid");
  }
  if (!Number.isInteger(request.batchSize) || request.batchSize <= 0) {
    issues.push("validation_issue_batch_size_invalid");
  }
  if (!Number.isInteger(request.maxInFlight) || request.maxInFlight <= 0) {
    issues.push("validation_issue_max_in_flight_invalid");
  }
  if (!Number.isInteger(request.maxRetries) || request.maxRetries < 0) {
    issues.push("validation_issue_max_retries_invalid");
  }
  if (!Number.isInteger(request.requestTimeoutSecs) || request.requestTimeoutSecs <= 0) {
    issues.push("validation_issue_timeout_invalid");
  }

  return issues;
}

function applyRequest(request: PipelineFormRequest) {
  promptInput.value = request.prompt;
  topicTags = [...request.topicTags];
  qaModeNormalInput.checked = (request.qaMode ?? "normal") !== "cot";
  qaModeCotInput.checked = (request.qaMode ?? "normal") === "cot";
  cotSectionHeadersInput.value = formatCotSectionHeaders(request.cotSectionHeaders);
  targetCountInput.value = String(request.targetCount);
  planLimitInput.value = String(request.planLimit);
  if (request.managedOutputRoot?.trim()) {
    outputRootInput.value = request.managedOutputRoot.trim();
  }
  providerInput.value = request.provider;
  baseUrlInput.value = request.baseUrl ?? "";
  apiKeyInput.value = request.apiKey ?? "";
  const savedUrl = request.qaPlatformUrl ?? "";
  if (qaPlatformDevInput) qaPlatformDevInput.checked = savedUrl.includes("127.0.0.1");
  if (qaPlatformProdInput) qaPlatformProdInput.checked = !savedUrl.includes("127.0.0.1");
  qaPlatformUsernameInput.value = request.qaPlatformUsername ?? "";
  qaPlatformPasswordInput.value = request.qaPlatformPassword ?? "";
  literatureApiUrlInput.value = request.literatureApiUrl ?? "";
  literatureApiAuthInput.value = request.literatureApiAuthToken ?? "";
  shardSizeInput.value = String(request.shardSize);
  batchSizeInput.value = String(request.batchSize);
  maxInFlightInput.value = String(request.maxInFlight);
  maxRetriesInput.value = String(request.maxRetries);
  timeoutInput.value = String(request.requestTimeoutSecs);
  resumeInput.checked = request.resume;
  managedResumeBatchId = request.managedRunMode === "resume-batch" ? request.managedRunBatchId ?? null : null;
  managedResumeBatchLabel = null;
  managedRunModeNewInput.checked = (request.managedRunMode ?? "new") === "new";
  managedRunModeResumeLatestInput.checked = (request.managedRunMode ?? "new") !== "new";
  const presetId = detectProviderPreset({
    provider: request.provider,
    baseUrl: request.baseUrl
  });
  resetPlatformIntegrationState();
  providerPresetInput.value = presetId;
  syncProviderFieldVisibility(presetId);
  syncModelOptions(presetId, request.model);
  normalizeRuntimeParameterInputs(true);
  syncManagedRunModeUi();
  renderTopicTags();
  renderSetupSummary();
  updateRunButtonUi();
}

void listen<PipelineProgressEvent>("pipeline-progress", (event) => {
  const payload = event.payload;
  const stageKey = `stage_${payload.stage.replace(/-/g, "_")}`;
  const statusKey = `event_${payload.status.replace(/-/g, "_")}`;
  updateProgressFromEvent(payload);
  appendLog(`${t(stageKey)} [${t(statusKey)}] ${payload.message}`);
});

void listen<AppUpdateProgressEvent>("app-update-progress", (event) => {
  if (event.payload.status === "failed") {
    appUpdateLastError = event.payload.message;
  } else if (event.payload.status === "completed") {
    appUpdateLastError = null;
  }
  appendLog(event.payload.message);
  updateCheckButtonUi();
});

void listen<{ step: string; chunkIndex: number; totalChunks: number; status: string; itemCount: number; message: string }>("paper-qa-progress", (event) => {
  const p = event.payload;
  paperQaProgressPercent = p.totalChunks > 0 ? Math.round(((p.chunkIndex + (p.step === "qa" ? 1 : 0.5)) / p.totalChunks) * 100) : 0;
  paperQaProgressMessage = p.message;
  paperQaLogLines.push(p.message);
  if (paperQaLogLines.length > 50) paperQaLogLines.shift();
  renderPaperQaPanel();
});

void listen<{ message: string }>("paper-qa-log", (event) => {
  paperQaLogLines.push(event.payload.message);
  if (paperQaLogLines.length > 50) paperQaLogLines.shift();
  renderPaperQaPanel();
});

// Chat QA streaming: update the last assistant message as tokens arrive
void listen<{ token: string; fullContent: string }>("chat-qa-token", (event) => {
  const session = getCurrentSession();
  if (!session) return;
  const lastMsg = session.messages[session.messages.length - 1];
  if (lastMsg && lastMsg.role === "assistant") {
    lastMsg.content = event.payload.fullContent;
    renderChatQaPanel();
  }
});

async function persistCurrentConfig(silent = true) {
  try {
    await invoke("save_local_pipeline_config", {
      profileName: DEFAULT_PROFILE_NAME,
      request: collectRequest()
    });
    if (!silent) {
      appendLog(t("log_saved_config"));
    }
  } catch (error) {
    appendLog(`${t("log_save_failed")}: ${String(error)}`);
  }
}

function scheduleAutoSave() {
  if (!autoSaveEnabled) {
    return;
  }

  if (autoSaveTimer !== null) {
    window.clearTimeout(autoSaveTimer);
  }

  autoSaveTimer = window.setTimeout(() => {
    autoSaveTimer = null;
    void persistCurrentConfig(true);
  }, AUTO_SAVE_DELAY_MS);
}

async function loadConfig(auto = false) {
  try {
    const request = await invoke<PipelineFormRequest | null>("load_local_pipeline_config", {
      profileName: DEFAULT_PROFILE_NAME
    });
    if (!request) {
      return;
    }
    const stubMigratedRequest = migrateLegacyStubRequest(request);
    const normalizedRequest = normalizeLoadedCotRequest(stubMigratedRequest);
    applyRequest(normalizedRequest);
    if (normalizedRequest !== request) {
      if (stubMigratedRequest !== request) {
        appendLog(t("log_stub_migrated"));
      }
      if (normalizedRequest !== stubMigratedRequest) {
        appendLog(t("log_cot_runtime_normalized"));
      }
      await invoke("save_local_pipeline_config", {
        profileName: DEFAULT_PROFILE_NAME,
        request: normalizedRequest
      });
    }
    appendLog(
      formatMessage(
        auto ? "log_loaded_startup_profile" : "log_loaded_manual_profile",
        DEFAULT_PROFILE_NAME
      )
    );
  } catch (error) {
    appendLog(`${t("log_load_failed")}: ${String(error)}`);
  }
}

langSelect.addEventListener("change", () => {
  const shouldSyncCotHeaders = isDefaultCotSectionHeaderText(cotSectionHeadersInput.value);
  currentLang = langSelect.value === "zh" ? "zh" : "en";
  window.localStorage.setItem(LANG_STORAGE_KEY, currentLang);
  if (shouldSyncCotHeaders) {
    cotSectionHeadersInput.value = formatCotSectionHeaders(defaultCotSectionHeadersForLang(currentLang));
  }
  applyTranslations();
});

for (const tab of tabs) {
  tab.addEventListener("click", () => {
    const nextTab = tab.dataset.tab as UiTab | undefined;
    if (nextTab) {
      setCurrentTab(nextTab);
    }
  });
}

tabsContainer.addEventListener("pointerup", (event) => {
  const target = event.target;
  if (!(target instanceof HTMLElement)) {
    return;
  }
  const tab = target.closest<HTMLButtonElement>("[data-tab]");
  const nextTab = tab?.dataset.tab as UiTab | undefined;
  if (nextTab) {
    setCurrentTab(nextTab);
  }
});

topbarTabSelect.addEventListener("change", () => {
  const nextTab = topbarTabSelect.value as UiTab;
  setCurrentTab(nextTab);
});

selectedTopicTags.addEventListener("click", (event) => {
  const target = event.target;
  if (!(target instanceof HTMLElement)) {
    return;
  }

  const button = target.closest<HTMLElement>("[data-selected-tag]");
  const tag = button?.dataset.selectedTag;
  if (tag) {
    removeTopicTag(tag);
  }
});

topicTagSuggestions.addEventListener("click", (event) => {
  const target = event.target;
  if (!(target instanceof HTMLElement)) {
    return;
  }

  const button = target.closest<HTMLElement>("[data-suggested-tag]");
  const tag = button?.dataset.suggestedTag;
  if (!tag) {
    return;
  }

  if (topicTags.includes(tag)) {
    removeTopicTag(tag);
    return;
  }
  addTopicTag(tag);
});

openTopicFieldSelectorButton.addEventListener("click", () => {
  openTopicFieldModal();
});

topicFieldModal.addEventListener("click", (event) => {
  const target = event.target;
  if (!(target instanceof HTMLElement)) {
    return;
  }

  if (target.dataset.modalClose === "true") {
    closeTopicFieldModal();
    return;
  }

  const primaryButton = target.closest<HTMLElement>("[data-field-primary]");
  if (primaryButton?.dataset.fieldPrimary) {
    topicFieldModalPrimaryId = primaryButton.dataset.fieldPrimary;
    renderTopicFieldModal();
    return;
  }

  const fieldButton = target.closest<HTMLElement>("[data-field-tag]");
  if (fieldButton?.dataset.fieldTag) {
    togglePendingTopicFieldTag(fieldButton.dataset.fieldTag);
    return;
  }

  const pendingButton = target.closest<HTMLElement>("[data-pending-tag]");
  if (pendingButton?.dataset.pendingTag) {
    togglePendingTopicFieldTag(pendingButton.dataset.pendingTag);
  }
});

closeTopicFieldModalButton.addEventListener("click", () => {
  closeTopicFieldModal();
});

cancelTopicFieldSelectionButton.addEventListener("click", () => {
  closeTopicFieldModal();
});

confirmTopicFieldSelectionButton.addEventListener("click", () => {
  for (const tag of pendingTopicFieldTags) {
    addTopicTag(tag);
  }
  closeTopicFieldModal();
});

addTopicTagButton.addEventListener("click", () => {
  addTopicTag(topicTagInput.value);
  topicTagInput.value = "";
});

for (const button of fieldHelpButtons) {
  button.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    const helpKey = button.dataset.helpKey;
    if (!helpKey) {
      return;
    }
    void showSettingHelp(helpKey);
  });
}

topicTagInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    event.preventDefault();
    addTopicTag(topicTagInput.value);
    topicTagInput.value = "";
  }
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && !topicFieldModal.hidden) {
    closeTopicFieldModal();
  }
});

window.addEventListener("resize", syncStickyOffsets);

if (topbar && typeof ResizeObserver !== "undefined") {
  new ResizeObserver(() => {
    syncStickyOffsets();
  }).observe(topbar);
}

qaModeNormalInput.addEventListener("change", () => {
  clearManagedResumeBatchOnUserEdit();
  normalizeRuntimeParameterInputs(true);
  scheduleAutoSave();
});
qaModeCotInput.addEventListener("change", () => {
  clearManagedResumeBatchOnUserEdit();
  if (qaModeCotInput.checked) {
    applyQaModeDefaults("cot");
  } else {
    normalizeRuntimeParameterInputs(true);
  }
  scheduleAutoSave();
});

managedRunModeNewInput.addEventListener("change", () => {
  clearManagedResumeBatch(false);
  scheduleAutoSave();
});

managedRunModeResumeLatestInput.addEventListener("change", () => {
  if (managedRunModeResumeLatestInput.checked) {
    managedResumeBatchId = null;
    managedResumeBatchLabel = null;
    appendLog(t("log_resuming_latest_task"));
  }
  syncManagedRunModeUi();
  syncRuntimeParameterControlStates();
  scheduleAutoSave();
});

managedRunPickInput.addEventListener("change", () => {
  const batchId = managedRunPickInput.value;
  if (!batchId) {
    return;
  }

  void resumeBrowseBatch(batchId);
});

clearManagedResumeBatchButton.addEventListener("click", () => {
  clearManagedResumeBatch(true);
  scheduleAutoSave();
});

providerPresetInput.addEventListener("change", () => {
  clearManagedResumeBatchOnUserEdit();
  const presetId = providerPresetInput.value as ProviderPresetId;
  applyProviderPreset(presetId, presetId !== "custom");
  scheduleAutoSave();
});

providerInput.addEventListener("change", () => {
  clearManagedResumeBatchOnUserEdit();
  syncProviderPresetInput();
  renderSetupSummary();
  scheduleAutoSave();
});
modelInput.addEventListener("change", () => {
  clearManagedResumeBatchOnUserEdit();
  const usesCustomModel = modelInput.value === CUSTOM_MODEL_VALUE;
  customModelField.hidden = !usesCustomModel;
  if (usesCustomModel) {
    customModelInput.focus();
  } else {
    customModelInput.value = "";
  }

  // Detect platform model by looking it up in platformGenerateModels
  const modelId = Number(modelInput.value);
  const pm = platformGenerateModels.find(m => m.id === modelId);
  if (pm && platformLoginState.kind === "success") {
    selectedPlatformModelId = modelId;
    batchSizeInput.value = String(pm.batchSize);
    maxInFlightInput.value = String(pm.maxInFlight);
  } else {
    selectedPlatformModelId = null;
  }

  syncProviderPresetInput();
  renderSetupSummary();
  scheduleAutoSave();
});
customModelInput.addEventListener("input", () => {
  clearManagedResumeBatchOnUserEdit();
  renderSetupSummary();
  scheduleAutoSave();
});
baseUrlInput.addEventListener("input", () => {
  clearManagedResumeBatchOnUserEdit();
  syncProviderPresetInput();
  renderSetupSummary();
  scheduleAutoSave();
});
apiKeyInput.addEventListener("input", () => {
  renderSetupSummary();
  scheduleAutoSave();
});
qaPlatformDevInput?.addEventListener("change", () => {
  resetPlatformIntegrationState();
  renderBrowseView();
  renderPlatformPanels();
  scheduleAutoSave();
});
qaPlatformProdInput?.addEventListener("change", () => {
  resetPlatformIntegrationState();
  renderBrowseView();
  renderPlatformPanels();
  scheduleAutoSave();
});
platformLoginButton?.addEventListener("click", () => {
  void refreshPlatformLogin();
});
qaPlatformUsernameInput.addEventListener("input", () => {
  resetPlatformIntegrationState();
  renderBrowseView();
  renderPlatformPanels();
  scheduleAutoSave();
});
qaPlatformPasswordInput.addEventListener("input", () => {
  resetPlatformIntegrationState();
  renderBrowseView();
  renderPlatformPanels();
  scheduleAutoSave();
});
literatureApiUrlInput.addEventListener("input", () => {
  renderPlatformPanels();
  renderBrowseView();
  scheduleAutoSave();
});
literatureApiAuthInput.addEventListener("input", scheduleAutoSave);
toggleApiKeyVisibilityButton.addEventListener("click", () => {
  apiKeyVisible = !apiKeyVisible;
  updateApiKeyVisibilityUi();
});
promptInput.addEventListener("input", () => {
  clearManagedResumeBatchOnUserEdit();
  renderSetupSummary();
  scheduleAutoSave();
});
targetCountInput.addEventListener("input", () => {
  clearManagedResumeBatchOnUserEdit();
  normalizeRuntimeParameterInputs(false);
  renderSetupSummary();
  scheduleAutoSave();
});
planLimitInput.addEventListener("input", () => {
  clearManagedResumeBatchOnUserEdit();
  normalizeRuntimeParameterInputs(false);
  renderSetupSummary();
  scheduleAutoSave();
});
shardSizeInput.addEventListener("input", () => {
  clearManagedResumeBatchOnUserEdit();
  normalizeRuntimeParameterInputs(false);
  scheduleAutoSave();
});
batchSizeInput.addEventListener("input", () => {
  clearManagedResumeBatchOnUserEdit();
  normalizeRuntimeParameterInputs(false);
  scheduleAutoSave();
});
maxInFlightInput.addEventListener("input", () => {
  clearManagedResumeBatchOnUserEdit();
  normalizeRuntimeParameterInputs(false);
  scheduleAutoSave();
});
maxRetriesInput.addEventListener("input", () => {
  clearManagedResumeBatchOnUserEdit();
  normalizeRuntimeParameterInputs(false);
  scheduleAutoSave();
});
timeoutInput.addEventListener("input", () => {
  clearManagedResumeBatchOnUserEdit();
  normalizeRuntimeParameterInputs(false);
  scheduleAutoSave();
});
targetCountInput.addEventListener("change", () => normalizeRuntimeParameterInputs(true));
planLimitInput.addEventListener("change", () => normalizeRuntimeParameterInputs(true));
shardSizeInput.addEventListener("change", () => normalizeRuntimeParameterInputs(true));
batchSizeInput.addEventListener("change", () => normalizeRuntimeParameterInputs(true));
maxInFlightInput.addEventListener("change", () => normalizeRuntimeParameterInputs(true));
maxRetriesInput.addEventListener("change", () => normalizeRuntimeParameterInputs(true));
timeoutInput.addEventListener("change", () => normalizeRuntimeParameterInputs(true));
outputRootInput.addEventListener("input", () => {
  clearManagedResumeBatchOnUserEdit();
  scheduleAutoSave();
});
cotSectionHeadersInput.addEventListener("input", () => {
  scheduleAutoSave();
});
outputRootInput.addEventListener("change", () => {
  clearManagedResumeBatchOnUserEdit();
  void (async () => {
    await persistCurrentConfig(true);
    await loadBrowseBatches();
  })();
});
selectOutputRootButton.addEventListener("click", () => {
  void chooseManagedOutputRoot();
});
openOutputRootButton.addEventListener("click", async () => {
  const outputRoot = currentManagedOutputRoot();
  if (!outputRoot) {
    return;
  }
  await openResultPath(outputRoot);
});
resetOutputRootButton.addEventListener("click", () => {
  clearManagedResumeBatchOnUserEdit();
  void resetManagedOutputRootToDefault(true);
});
resumeInput.addEventListener("change", () => {
  clearManagedResumeBatchOnUserEdit();
  scheduleAutoSave();
});

function buildUpdatePrompt(response: AppUpdateCheckResponse): string {
  const lines = [
    currentLang === "zh"
      ? `当前版本：${response.currentVersion}`
      : `Current version: ${response.currentVersion}`,
    currentLang === "zh"
      ? `最新版本：${response.version ?? "unknown"}`
      : `Latest version: ${response.version ?? "unknown"}`
  ];

  if (response.date) {
    lines.push(
      currentLang === "zh"
        ? `发布时间：${response.date}`
        : `Release date: ${response.date}`
    );
  }

  if (response.body) {
    const notes = response.body.trim();
    if (notes) {
      lines.push("");
      lines.push(currentLang === "zh" ? "更新说明：" : "Release notes:");
      lines.push(notes);
    }
  }

  lines.push("");
  lines.push(currentLang === "zh" ? "现在安装这个更新吗？" : "Install this update now?");
  return lines.join("\n");
}

function updateCheckButtonUi() {
  if (pendingAppUpdate?.updateAvailable) {
    checkUpdateButton.textContent = appUpdateLastError ? t("action_retry_update") : t("action_install_update");
    return;
  }

  checkUpdateButton.textContent = t("action_check_update");
}

function classifyUpdateErrorMessage(errorText: string): string {
  if (errorText.includes("timed out after 8 seconds")) {
    return t("log_update_timeout");
  }
  return `${t("log_update_failed")}: ${errorText}`;
}

async function offerManualUpdateFallback() {
  const manualUrl =
    pendingAppUpdate?.manualDownloadUrl?.trim() || appUpdateManualDownloadUrl?.trim() || "";
  if (!manualUrl) {
    return;
  }

  const shouldOpen = window.confirm(t("log_update_manual_prompt"));
  if (!shouldOpen) {
    return;
  }

  try {
    await invoke("open_external_url", { url: manualUrl });
    appendLog(`${t("log_update_manual_download")}: ${manualUrl}`);
  } catch (error) {
    appendLog(`${t("platform_open_failed")}: ${String(error)}`);
  }
}

async function startInstallPendingUpdate(response: AppUpdateCheckResponse) {
  appendLog(`${t("log_update_installing")} ${response.version ?? ""}`.trim());
  await invoke("install_app_update");
}

browseContent.addEventListener("click", (event) => {
  const target = event.target;
  if (!(target instanceof HTMLElement)) {
    return;
  }

  const actionButton = target.closest<HTMLElement>("[data-batch-action]");
  const action = actionButton?.dataset.batchAction;
  const actionBatchId = actionButton?.dataset.batchId;
  if (action && actionBatchId) {
    if (action === "continue") {
      void resumeBrowseBatch(actionBatchId);
      return;
    }
    if (action === "open") {
      browseDetailData = null;
      void loadBrowseQaPage(actionBatchId, 1);
      return;
    }
    if (action === "review") {
      void loadBrowseReview(actionBatchId);
      return;
    }
    if (action === "delete") {
      void deleteBrowseBatch(actionBatchId);
      return;
    }
    if (action === "upload") {
      void uploadBrowseBatch(actionBatchId);
      return;
    }
  }

  const batchButton = target.closest<HTMLElement>("[data-batch-id]");
  const batchId = batchButton?.dataset.batchId;
  if (batchId) {
    if (batchId === browseSelectedBatchId && browsePageData) {
      browseView = "questions";
      renderBrowseView();
      return;
    }

    browseDetailData = null;
    void loadBrowseQaPage(batchId, 1);
    return;
  }

  const qaButton = target.closest<HTMLElement>("[data-qa-id]");
  const qaId = qaButton?.dataset.qaId;
  if (qaId) {
    if (!browseSelectedBatchId) {
      return;
    }

    if (qaId === browseDetailData?.item.id && browseView === "detail") {
      return;
    }

    void loadBrowseDetail(browseSelectedBatchId, qaId);
    return;
  }

  if (browseView === "review" && browseSelectedBatchId) {
    const reviewItem = currentBrowseReviewItem();
    if (!reviewItem) {
      return;
    }
    const button = target.closest<HTMLButtonElement>("button");
    if (!button || button.disabled) {
      return;
    }
    if (button.id === "browse-review-save") {
      void saveBrowseReview(browseSelectedBatchId, reviewItem.id);
      return;
    }
    if (button.id === "browse-review-keep") {
      void saveBrowseReview(browseSelectedBatchId, reviewItem.id, "kept");
      return;
    }
    if (button.id === "browse-review-discard") {
      void saveBrowseReview(browseSelectedBatchId, reviewItem.id, "discarded");
      return;
    }
    if (button.id === "browse-review-prev" && browseReviewIndex > 0) {
      browseReviewIndex -= 1;
      renderBrowseView();
      return;
    }
    if (button.id === "browse-review-next" && browseReviewIndex < browseReviewItems.length - 1) {
      browseReviewIndex += 1;
      renderBrowseView();
      return;
    }
  }

  if (!browsePageData || !browseSelectedBatchId) {
    return;
  }

  const button = target.closest<HTMLButtonElement>("button");
  if (!button || button.disabled) {
    return;
  }

  if (button.id === "browse-prev-page" && browsePageData.page > 1) {
    void loadBrowseQaPage(browseSelectedBatchId, browsePageData.page - 1);
  }

  if (button.id === "browse-next-page" && browsePageData.page < browsePageData.totalPages) {
    void loadBrowseQaPage(browseSelectedBatchId, browsePageData.page + 1);
  }
});

browseContent.addEventListener("input", (event) => {
  const target = event.target;
  if (!(target instanceof HTMLTextAreaElement)) {
    return;
  }
  if (target.id !== "browse-review-question") {
    return;
  }
  const item = currentBrowseReviewItem();
  if (!item) {
    return;
  }
  browseReviewDrafts.set(item.id, target.value);
  const saveButton = browseContent.querySelector<HTMLButtonElement>("#browse-review-save");
  if (saveButton) {
    const dirty = target.value.trim() !== item.effectiveQuestion.trim();
    saveButton.disabled = !dirty || browseReviewSaving;
    saveButton.classList.toggle("browse-mini-button-muted", !dirty || browseReviewSaving);
    saveButton.textContent = t(browseReviewSaving ? "browse_review_saving" : "browse_review_save");
  }
});

browseBackButton.addEventListener("click", () => {
  browseErrorMessage = null;
  if (browseView === "detail") {
    browseView = "questions";
  } else if (browseView === "review") {
    browseView = "batches";
  } else if (browseView === "questions") {
    browseView = "batches";
  }

  renderBrowseView();
});

for (const panel of [qaEvaluatePanel, modelTrialPanel]) {
  panel.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) {
      return;
    }

    const button = target.closest<HTMLButtonElement>("[data-platform-action]");
    const action = button?.dataset.platformAction;
    if (!action || button.disabled) {
      return;
    }

    if (action === "health") {
      void refreshPlatformHealth();
      return;
    }
    if (action === "login") {
      void refreshPlatformLogin();
      return;
    }
    if (action === "open-qa") {
      void openPlatformArea("qa-evaluate");
      return;
    }
    if (action === "open-trial") {
      void openPlatformArea("model-trial");
    }
  });
}

modelTrialPanel.addEventListener("click", (event) => {
  const target = event.target;
  if (!(target instanceof HTMLElement)) {
    return;
  }

  const button = target.closest<HTMLButtonElement>("[data-model-trial-action]");
  const action = button?.dataset.modelTrialAction;
  if (!action || button.disabled) {
    return;
  }

  if (action === "refresh-workspace") {
    void (async () => {
      await loadModelTrialLocalBatches();
      await loadModelTrialWorkspace(true);
    })();
    return;
  }
  if (action === "create-session") {
    void createModelTrialSession();
    return;
  }
  if (action === "select-session") {
    const sessionId = Number(button.dataset.sessionId);
    if (Number.isFinite(sessionId) && sessionId > 0) {
      modelTrialSelectedSessionId = sessionId;
      void loadModelTrialSessionDetail(sessionId);
    }
    return;
  }
  if (action === "delete-session") {
    const sessionId = Number(button.dataset.sessionId);
    if (Number.isFinite(sessionId) && sessionId > 0) {
      void deleteModelTrialSession(sessionId);
    }
    return;
  }
  if (action === "send-message") {
    void sendModelTrialMessage();
  }
});

modelTrialPanel.addEventListener("change", (event) => {
  const target = event.target;
  if (!(target instanceof HTMLElement)) {
    return;
  }

  if (target instanceof HTMLSelectElement && target.id === "model-trial-config-select") {
    modelTrialSelectedConfigId = Number(target.value) || null;
    modelTrialNoticeMessage = null;
    modelTrialErrorMessage = null;
    renderPlatformPanels();
    return;
  }

  if (target instanceof HTMLSelectElement && target.id === "model-trial-batch-select") {
    const batchId = target.value;
    if (!batchId) {
      modelTrialSelectedBatchId = null;
      modelTrialLocalQuestions = [];
      modelTrialSelectedQuestionId = null;
      modelTrialLocalQuestionDetail = null;
      renderPlatformPanels();
      return;
    }
    void loadModelTrialLocalQuestions(batchId);
    return;
  }

  if (target instanceof HTMLSelectElement && target.id === "model-trial-question-select") {
    const qaId = target.value;
    modelTrialSelectedQuestionId = qaId || null;
    modelTrialLocalQuestionDetail = null;
    if (modelTrialSelectedBatchId && qaId) {
      const selectedQuestion = currentModelTrialSelectedQuestion();
      if (selectedQuestion && !modelTrialComposer.trim()) {
        modelTrialComposer = selectedQuestion.question;
      }
      void loadModelTrialLocalQuestionDetail(modelTrialSelectedBatchId, qaId);
      return;
    }
    modelTrialNoticeMessage = null;
    modelTrialErrorMessage = null;
    renderPlatformPanels();
  }
});

modelTrialPanel.addEventListener("input", (event) => {
  const target = event.target;
  if (target instanceof HTMLTextAreaElement && target.id === "model-trial-composer") {
    modelTrialComposer = target.value;
  }
});

modelTrialPanel.addEventListener("keydown", (event) => {
  const target = event.target;
  if (
    target instanceof HTMLTextAreaElement &&
    target.id === "model-trial-composer" &&
    event.key === "Enter" &&
    (event.metaKey || event.ctrlKey)
  ) {
    event.preventDefault();
    void sendModelTrialMessage();
  }
});

checkUpdateButton.addEventListener("click", async () => {
  setStatus("updating", true);

  try {
    if (pendingAppUpdate?.updateAvailable) {
      const shouldInstall = window.confirm(buildUpdatePrompt(pendingAppUpdate));
      if (!shouldInstall) {
        appendLog(t("log_update_declined"));
        setStatus("idle", false);
        return;
      }

      appUpdateLastError = null;
      updateCheckButtonUi();
      await startInstallPendingUpdate(pendingAppUpdate);
      return;
    }

    const response = await invoke<AppUpdateCheckResponse>("check_for_app_update");
    appUpdateManualDownloadUrl = response.manualDownloadUrl ?? appUpdateManualDownloadUrl;
    if (!response.configured) {
      pendingAppUpdate = null;
      appUpdateLastError = null;
      appendLog(t("log_update_not_configured"));
      setStatus("idle", false);
      return;
    }

    if (response.sourcePath) {
      appendLog(`${t("log_update_source")}: ${response.sourcePath}`);
    }

    if (!response.updateAvailable) {
      pendingAppUpdate = null;
      appUpdateLastError = null;
      appendLog(`${t("log_update_not_available")} (${response.currentVersion})`);
      await message(`${t("log_update_not_available")} (${response.currentVersion})`, {
        title: t("action_check_update"),
        kind: "info"
      });
      setStatus("idle", false);
      return;
    }

    pendingAppUpdate = response;
    appUpdateLastError = null;
    updateCheckButtonUi();
    appendLog(`${t("log_update_available")} ${response.version ?? ""}`.trim());
    const shouldInstall = window.confirm(buildUpdatePrompt(response));
    if (!shouldInstall) {
      appendLog(t("log_update_declined"));
      setStatus("idle", false);
      return;
    }

    await startInstallPendingUpdate(response);
  } catch (error) {
    const errorText = String(error);
    if (errorText.includes("No update is currently available.")) {
      pendingAppUpdate = null;
    }
    const displayMessage = classifyUpdateErrorMessage(errorText);
    appUpdateLastError = displayMessage;
    appendLog(displayMessage);
    await message(displayMessage, {
      title: t("action_check_update"),
      kind: "warning"
    });
    await offerManualUpdateFallback();
    setStatus("idle", false);
  }
});

exportLogsButton.addEventListener("click", () => {
  void exportLogs();
});

openRunOutputDirButton.addEventListener("click", async () => {
  const response = currentRunResponse();
  if (!response) {
    return;
  }

  await openResultPath(response.outputDir);
});

resultActions.addEventListener("click", async (event) => {
  const target = event.target;
  if (!(target instanceof HTMLElement)) {
    return;
  }

  const action = target.dataset.resultAction;
  const response = currentRunResponse();
  if (!action || !response) {
    return;
  }

  if (action === "open-output-dir") {
    await openResultPath(response.outputDir);
    return;
  }
  if (action === "open-dataset") {
    await openResultPath(response.datasetPath);
    return;
  }
  if (action === "open-pack-summary") {
    await openResultPath(response.packSummaryPath);
    return;
  }
  if (action === "copy-output-dir") {
    await copyText(response.outputDir);
    return;
  }
  if (action === "copy-dataset-path") {
    await copyText(response.datasetPath);
  }
});

runButton.addEventListener("click", async () => {
  if (currentStatus === "running") {
    setStatus("stopping", true);
    appendLog(t("log_stop_requested"));

    try {
      const stopped = await invoke<boolean>("stop_pipeline");
      if (!stopped) {
        appendLog(t("log_stop_not_running"));
        setStatus("idle", false);
      }
    } catch (error) {
      appendLog(`${t("log_stop_failed")}: ${String(error)}`);
      setStatus("running", true);
    }
    return;
  }

  if (currentStatus === "stopping" || currentStatus === "updating" || currentStatus === "previewing") {
    return;
  }

  const request = collectRequest();
  const issues = validateRequest(request);
  if (issues.length > 0) {
    outputState = { kind: "validation_error", issues };
    renderOutput();
    appendLog(`${t("log_validation_failed")}: ${issues.map((issue) => t(issue)).join(" ")}`);
    return;
  }

  setStatus("running", true);
  outputState = { kind: "run_loading" };
  renderOutput();
  resetTelemetry();
  beginRunStats(request);
  startRunStatsTicker();
  renderRunStats();
  appendLog(t("log_request_submitted"));

  try {
    const response = await invoke<PipelineResponse>("run_pipeline", {
      request: {
        ...request,
        prompt: composeEffectivePrompt(request.prompt, request.topicTags)
      }
    });
    clearManagedResumeBatch(false);
    outputState = { kind: "run_success", response };
    renderOutput();
    browseSelectedBatchId = null;
    void loadBrowseBatches();
    appendLog(formatMessage("log_pipeline_completed", response.datasetPath));
  } catch (error) {
    const message = String(error);
    if (isPipelineCancelledMessage(message)) {
      await armResumeBatchForRequest(request);
      outputState = { kind: "cancelled", message: t("pipeline_cancelled") };
      renderOutput();
      appendLog(t("log_pipeline_cancelled"));
    } else {
      await armResumeBatchForRequest(request);
      outputState = { kind: "error", phase: "run", message };
      renderOutput();
      appendLog(`${t("pipeline_failed")}: ${message}`);
    }
  } finally {
    stopRunStatsTicker();
    renderRunStats();
    setStatus("idle", false);
  }
});

async function initializeApp() {
  try {
    const metadata = await invoke<AppMetadataResponse>("get_app_metadata");
    appVersion = metadata.version;
  } catch (error) {
    appendLog(`app metadata failed: ${String(error)}`);
  }
  await loadManagedOutputRoot();
  if (runModeBlock) {
    runModeBlock.hidden = true;
  }
  openRunOutputDirButton.hidden = true;
  syncStickyOffsets();
  applyTranslations();
  syncProviderPresetInput();
  normalizeRuntimeParameterInputs(true);
  await loadConfig(true);
  normalizeRuntimeParameterInputs(true);
  autoSaveEnabled = true;
  renderRunStats();
  try { renderPlatformPanels(); } catch (e) { appendLog(`renderPlatformPanels: ${String(e)}`); }
  void loadBrowseBatches();
  // Auto-login if platform credentials are saved
  if (currentQaPlatformUrl() && hasQaPlatformCredentials()) {
    platformLoginState = { kind: "loading" };
    try { renderPlatformPanels(); } catch (e) { appendLog(`renderPlatformPanels(auth): ${String(e)}`); }
    try {
      const response = await invoke<PlatformLoginResponse>("login_platform", {
        platformUrl: currentQaPlatformUrl(),
        username: qaPlatformUsernameInput.value.trim(),
        password: qaPlatformPasswordInput.value.trim()
      });
      platformLoginState = { kind: "success", response };
      platformHealthState = {
        kind: "success",
        response: {
          reachable: true,
          message: "ok",
          endpoints: response.endpoints
        }
      };
    } catch {
      platformLoginState = { kind: "idle" };
    }
    try { renderPlatformPanels(); } catch (e) { appendLog(`renderPlatformPanels(auth): ${String(e)}`); }
  }
  // Pre-render all lazy panels so they are populated before the user clicks them
  if (chatSessions.length === 0) createChatSession();
  try { renderChatQaPanel(); } catch (e) { appendLog(`renderChatQaPanel(init): ${String(e)}`); }
  try { renderFeedback2Panel(); } catch (e) { appendLog(`renderFeedback2Panel(init): ${String(e)}`); }
  try { renderRecentUpdatesPanel(); } catch (e) { appendLog(`renderRecentUpdatesPanel(init): ${String(e)}`); }
}

void initializeApp();

// ---- Feedback event handlers ----

feedback2Panel?.addEventListener("click", (event) => {
  const target = event.target;
  if (!(target instanceof HTMLElement)) return;

  const button = target.closest<HTMLButtonElement>("[data-feedback2-action]");
  const action = button?.dataset.feedback2Action;
  if (!action || button.disabled) return;

  if (action === "github") {
    const url = "https://github.com/AI4S-YB/distill-studio/issues/new";
    invoke("open_external_url", { url });
  }
});

feedback2Panel?.addEventListener("submit", (event) => {
  const target = event.target;
  if (!(target instanceof HTMLFormElement)) return;
  if (target.id === "feedback2-form") {
    event.preventDefault();
    void handleFeedback2FormSubmit(event);
  }
});

// ---- Chat QA event handlers ----

chatQaSessionsBar?.addEventListener("click", (event) => {
  const target = event.target;
  if (!(target instanceof HTMLElement)) return;

  const deleteBtn = target.closest<HTMLElement>("[data-delete-session]");
  if (deleteBtn) {
    event.stopPropagation();
    deleteChatSession(deleteBtn.dataset.deleteSession!);
    return;
  }

  const newBtn = target.closest<HTMLElement>("#chat-qa-new-session-button");
  if (newBtn) {
    createChatSession();
    return;
  }

  const uploadBtn = target.closest<HTMLElement>("#chat-qa-upload-button");
  if (uploadBtn && !(uploadBtn as HTMLButtonElement).disabled) {
    const sessionId = uploadBtn.dataset.uploadSession;
    if (sessionId) void uploadChatSession(sessionId);
    return;
  }

  const tab = target.closest<HTMLElement>(".chat-qa-session-tab");
  if (tab) {
    switchChatSession(tab.dataset.sessionId!);
    return;
  }
});

chatQaSendButton?.addEventListener("click", () => {
  void handleChatSend();
});

chatQaInput?.addEventListener("keydown", (event) => {
  if (event.key === "Enter" && !event.shiftKey) {
    event.preventDefault();
    void handleChatSend();
  }
});

// Paper QA: toolbar button clicks
const paperQaPanelEl = document.querySelector("#paper-qa-panel");
paperQaPanelEl?.addEventListener("click", (event) => {
  const target = event.target;
  if (!(target instanceof HTMLElement)) return;

  // Add PDF — use Tauri native dialog for real file paths
  if (target.closest("#paper-qa-add-btn")) {
    void (async () => {
      const selected = await open({
        multiple: true,
        filters: [{ name: "PDF", extensions: ["pdf"] }],
      });
      if (selected) {
        addPaperFiles(Array.isArray(selected) ? selected : [selected]);
      }
    })();
    return;
  }
  // Convert
  const convBtn = target.closest<HTMLElement>("#paper-qa-convert-btn");
  if (convBtn && !(convBtn as HTMLButtonElement).disabled) {
    void handlePaperQaConvert();
    return;
  }
  // Generate
  const genBtn = target.closest<HTMLElement>("#paper-qa-generate-btn");
  if (genBtn && !(genBtn as HTMLButtonElement).disabled) {
    void handlePaperQaGenerate();
    return;
  }
  // Save as Batch
  const saveBtn = target.closest<HTMLElement>("#paper-qa-save-batch-btn");
  if (saveBtn && !(saveBtn as HTMLButtonElement).disabled) {
    void handlePaperQaSaveBatch();
    return;
  }
  // Remove file
  const rmBtn = target.closest<HTMLElement>("[data-remove-file]");
  if (rmBtn) {
    const fileId = rmBtn.dataset.removeFile;
    if (fileId) removePaperFile(fileId);
    return;
  }
  // Toggle file chunk preview
  const fileCard = target.closest<HTMLElement>(".paper-file-card");
  if (fileCard && !(target.closest("[data-remove-file]"))) {
    const fId = fileCard.dataset.fileId;
    paperQaSelectedFileId = paperQaSelectedFileId === fId ? null : (fId ?? null);
    renderPaperQaPanel();
    return;
  }
});

// Paper QA: Tauri native drag & drop (provides real file paths)
void listen("tauri://drag-drop", (event: { payload: { type: string; paths: string[] } }) => {
  if (event.payload.type !== "drop") return;
  if (currentTab !== "paper-qa") return;
  const pdfs = (event.payload.paths ?? []).filter((p: string) => p.toLowerCase().endsWith(".pdf"));
  if (pdfs.length > 0) {
    addPaperFiles(pdfs);
  }
});

// Paper QA: CoT ratio slider
document.querySelector("#paper-qa-cot-ratio")?.addEventListener("input", (event) => {
  const slider = event.target as HTMLInputElement;
  paperQaCotRatio = parseFloat(slider.value);
  const valEl = document.querySelector("#paper-qa-cot-ratio-value");
  if (valEl) valEl.textContent = String(paperQaCotRatio);
});
