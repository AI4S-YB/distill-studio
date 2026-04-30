import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { message, open } from "@tauri-apps/plugin-dialog";
import "./styles.css";
import type {
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
} from "./types";
import {
  formatCotSectionHeaders,
  defaultCotSectionHeadersForLang,
  isDefaultCotSectionHeaderText,
  normalizeCotSectionHeaders,
  LANG_STORAGE_KEY,
  CHAT_SESSIONS_STORAGE_KEY,
  PAPER_QA_STORAGE_KEY,
  DEFAULT_PROFILE_NAME,
  AUTO_SAVE_DELAY_MS,
  MANAGED_OUTPUT_DIR,
  CUSTOM_MODEL_VALUE,
  DEFAULT_COT_TARGET_COUNT,
  COT_TARGET_COUNT_CAP,
  DEFAULT_COT_SHARD_SIZE,
  COT_SAFE_SHARD_SIZE_CAP,
  DEFAULT_COT_BATCH_SIZE,
  DEFAULT_COT_MAX_IN_FLIGHT,
  PROVIDER_PRESETS,
  DEFAULT_COT_SECTION_HEADERS_ZH,
  DEFAULT_COT_SECTION_HEADERS_EN,
  DEFAULT_MANUAL_UPDATE_URL,
  RESEARCH_FIELD_TAXONOMY,
} from "./constants";
import { state } from "./state";
import type {
  PlatformNews,
  DashboardOverview,
  ChangePasswordResponse,
  ModelChangelogEntry,
  PlatformGenerateModel,
  ExportsStatsData,
  ExportsStatsWeekly,
  PaperFileStatus,
  PaperChunk,
  PaperQaGenerateResponse,
  PaperFile,
  ChatSession,
  ChatUploadResponse,
} from "./state";

import {
  translations,
  t,
  translationValues,
  matchesAnyTranslation,
  findMatchingTranslationKey,
  formatMessage,
  createResearchFieldLabels,
  lookupResearchFieldLabel,
  topicTagLabel,
  formatCountTemplate,
} from "./translations";

import {
  escapeHtml,
  escapeRegExp,
  formatCount,
  formatDuration,
  formatRate,
  displayValue,
  formatPlatformTime,
  parseTimestampMs,
  parsePlatformMetadataJson,
  metadataString,
  currentPresetLabel,
  qaModeLabel,
  batchStatusLabel,
  reviewStatusLabel,
  reviewStatusBadgeClass,
  browseReviewSummaryLabel,
  changeTypeLabel,
  browseResumeActionLabel,
  batchPlatformStatusLabel,
  isRemoteVirtualBrowseBatch,
  currentBrowseBatchPlatformStatus,
  browseBatchPlatformBadgeHtml,
  canResumeBrowseBatch,
  currentModelValue,
  renderEmptyCard,
  renderValidationIssues,
  renderCards,
  renderActionButtons,
} from "./utils";
import { injectAppHtml } from "./html-template";
import {
  initProviderDomRefs,
  resolveLLMProvider,
  syncProviderFieldVisibility,
  syncModelOptions,
  detectProviderPreset,
  migrateLegacyStubRequest,
  normalizeLoadedCotRequest,
  loadPlatformGenerateModels,
  updatePlatformPresetOption,
  currentPlatformGenerateModel,
  syncProviderPresetInput,
  applyProviderPreset,
} from "./provider";


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
const app = injectAppHtml();

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

initProviderDomRefs({
  baseUrlInput: baseUrlInput!,
  apiKeyInput: apiKeyInput!,
  providerInput: providerInput!,
  providerField: providerField!,
  modelInput: modelInput!,
  customModelInput: customModelInput!,
  customModelField: customModelField!,
  batchSizeInput: batchSizeInput!,
  maxInFlightInput: maxInFlightInput!,
  timeoutInput: timeoutInput!,
  providerPresetInput: providerPresetInput!,
});

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

cotSectionHeadersInput.value = formatCotSectionHeaders(defaultCotSectionHeadersForLang(state.currentLang), state.currentLang);

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


function currentTopicFieldNode(): ResearchFieldNode | null {
  if (!state.topicFieldModalPrimaryId) {
    return RESEARCH_FIELD_TAXONOMY[0] ?? null;
  }

  return RESEARCH_FIELD_TAXONOMY.find((node) => node.id === state.topicFieldModalPrimaryId) ?? RESEARCH_FIELD_TAXONOMY[0] ?? null;
}


function currentQaMode(): "normal" | "cot" {
  return qaModeCotInput.checked ? "cot" : "normal";
}

function currentManagedRunMode(): "new" | "resume-latest" {
  if (state.managedResumeBatchId) {
    return "resume-batch";
  }

  return "new";
}

function shouldShowContinueRunButton(): boolean {
  return state.managedResumeBatchId !== null;
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
    state.browseBatches.find((batch) => batchMatchesRequest(batch, request)) ??
    null
  );
}

async function armResumeBatchForRequest(request: PipelineFormRequest) {
  await loadBrowseBatches();
  const batch = findLatestResumableBatchForRequest(request);
  state.managedResumeBatchId = batch?.id ?? null;
  state.managedResumeBatchLabel = batch ? batch.topicName || batch.name || batch.id : null;
  syncManagedRunModeUi();
  updateRunButtonUi();
}

function clearManagedResumeBatchOnUserEdit() {
  if (!state.managedResumeBatchId || isPipelineBusyStatus(state.currentStatus)) {
    return;
  }
  clearManagedResumeBatch(false);
  updateRunButtonUi();
}

function applyQaModeDefaults(qaMode: "normal" | "cot") {
  if (qaMode !== "cot") {
    return;
  }

  cotSectionHeadersInput.value = formatCotSectionHeaders(defaultCotSectionHeadersForLang(state.currentLang), state.currentLang);
  targetCountInput.value = String(DEFAULT_COT_TARGET_COUNT);
  shardSizeInput.value = String(DEFAULT_COT_SHARD_SIZE);
  batchSizeInput.value = String(DEFAULT_COT_BATCH_SIZE);
  maxInFlightInput.value = String(DEFAULT_COT_MAX_IN_FLIGHT);
  normalizeRuntimeParameterInputs(true);
  renderSetupSummary();
}

function updateApiKeyVisibilityUi() {
  apiKeyInput.type = state.apiKeyVisible ? "text" : "password";
  toggleApiKeyVisibilityButton.textContent = t(state.apiKeyVisible ? "hide_secret" : "show_secret");
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
    errBanner.hidden = !state.paperQaErrorMessage;
    if (state.paperQaErrorMessage) errBanner.textContent = state.paperQaErrorMessage;
  }
  if (okBanner) {
    okBanner.hidden = !state.paperQaUploadMessage;
    if (state.paperQaUploadMessage) okBanner.textContent = state.paperQaUploadMessage;
  }

  // File list
  const fileList = document.querySelector("#paper-qa-file-list");
  if (fileList) {
    if (state.paperFiles.length === 0) {
      fileList.innerHTML = `<div class="paper-qa-hint">${t("paper_qa_empty")}</div>`;
    } else {
      fileList.innerHTML = state.paperFiles.map((f) => {
        const isSelected = state.paperQaSelectedFileId === f.id;
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
    if (!state.paperQaResult || state.paperQaResult.items.length === 0) {
      results.innerHTML = `<div class="paper-qa-empty">${t("paper_qa_empty")}</div>`;
    } else {
      results.innerHTML = state.paperQaResult.items.map((item) => `
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
    if (state.paperQaResult && state.paperQaResult.stats.total > 0) {
      stats.hidden = false;
      stats.textContent = t("paper_qa_stats")
        .replace("{total}", String(state.paperQaResult.stats.total))
        .replace("{cot}", String(state.paperQaResult.stats.cotCount))
        .replace("{qa}", String(state.paperQaResult.stats.qaCount));
    } else {
      stats.hidden = true;
    }
  }

  // Progress bar
  const progressEl = document.querySelector("#paper-qa-progress");
  const progressBar = document.querySelector<HTMLElement>("#paper-qa-progress-bar");
  const progressText = document.querySelector("#paper-qa-progress-text");
  if (progressEl && progressBar && progressText) {
    if (state.paperQaGenerating) {
      progressEl.hidden = false;
      progressBar.style.width = state.paperQaProgressPercent + "%";
      progressText.textContent = state.paperQaProgressMessage || t("paper_qa_generating");
    } else {
      progressEl.hidden = true;
    }
  }

  // Log area
  const logEl = document.querySelector("#paper-qa-log");
  if (logEl) {
    if (state.paperQaLogLines.length > 0) {
      logEl.hidden = false;
      logEl.innerHTML = state.paperQaLogLines.map(l => `<div class="paper-qa-log-line">${escapeHtml(l)}</div>`).join("");
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
    convertBtn.disabled = state.paperQaConverting || state.paperQaGenerating || state.paperFiles.length === 0;
  }
  if (generateBtn) {
    const hasChunked = state.paperFiles.some(f => f.status === "chunked");
    const hasProvider = resolveLLMProvider().mode !== "none";
    generateBtn.disabled = state.paperQaConverting || state.paperQaGenerating || !hasChunked || !hasProvider;
    generateBtn.title = (!hasProvider && hasChunked) ? t("paper_qa_no_provider") : "";
  }
  if (saveBatchBtn) {
    saveBatchBtn.disabled = state.paperQaUploading || !state.paperQaResult || state.paperQaResult.items.length === 0;
  }
  if (statusEl) {
    const hasChunked2 = state.paperFiles.some(f => f.status === "chunked");
    const hasProvider2 = resolveLLMProvider().mode !== "none";
    if (state.paperQaConverting) statusEl.textContent = t("paper_qa_converting");
    else if (state.paperQaGenerating) statusEl.textContent = t("paper_qa_generating");
    else if (state.paperQaUploading) statusEl.textContent = t("paper_qa_uploading");
    else if (!hasProvider2 && hasChunked2) statusEl.textContent = t("paper_qa_no_provider");
    else statusEl.textContent = "";
  }

  // CoT ratio slider
  const ratioSlider = document.querySelector<HTMLInputElement>("#paper-qa-cot-ratio");
  const ratioValue = document.querySelector("#paper-qa-cot-ratio-value");
  if (ratioSlider) ratioSlider.value = String(state.paperQaCotRatio);
  if (ratioValue) ratioValue.textContent = String(state.paperQaCotRatio);

  // Tab labels
  const tabLabel = document.querySelector("#tab-paper-qa-label");
  const tabTitle = document.querySelector("#paper-qa-tab-title");
  const tabCopy = document.querySelector("#paper-qa-tab-copy");
  if (tabLabel) tabLabel.textContent = t("paper_qa_tab");
  if (tabTitle) tabTitle.textContent = t("paper_qa_tab");
  if (tabCopy) tabCopy.textContent = t("paper_qa_empty");

  persistPaperQaState();
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

  const remaining = 20 - state.paperFiles.length;
  if (remaining <= 0) {
    state.paperQaErrorMessage = t("paper_qa_max_files");
    renderPaperQaPanel();
    return;
  }

  const toAdd = paths.slice(0, remaining);
  if (paths.length > remaining) {
    state.paperQaErrorMessage = t("paper_qa_max_files");
  } else {
    state.paperQaErrorMessage = null;
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
    state.paperFiles.push(paperFile);
  }

  renderPaperQaPanel();
}

function removePaperFile(id: string) {
  state.paperFiles = state.paperFiles.filter(f => f.id !== id);
  if (state.paperFiles.length === 0) {
    state.paperQaResult = null;
  }
  state.paperQaErrorMessage = null;
  state.paperQaSelectedFileId = null;
  renderPaperQaPanel();
}

async function handlePaperQaConvert() {
  if (state.paperQaConverting || state.paperQaGenerating) return;
  const pending = state.paperFiles.filter(f => f.status === "pending");
  if (pending.length === 0) return;

  state.paperQaConverting = true;
  state.paperQaErrorMessage = null;
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

  state.paperQaConverting = false;
  renderPaperQaPanel();
}

async function handlePaperQaGenerate() {
  if (state.paperQaConverting || state.paperQaGenerating) return;
  const chunkedFiles = state.paperFiles.filter(f => f.status === "chunked" && f.chunks);
  appendLog(`Paper QA Generate: chunkedFiles=${chunkedFiles.length}, files=${state.paperFiles.map(f => `${f.name}(${f.status})`).join(", ")}`);
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
    state.paperQaErrorMessage = t("paper_qa_no_provider");
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
    cotRatio: state.paperQaCotRatio,
  };
  if (platformUrl) {
    request.platformUrl = platformUrl;
    request.username = username;
    request.password = password;
  }

  appendLog(`Paper QA Generate: sending ${allChunks.length} chunks, title="${paperTitle}", cotRatio=${state.paperQaCotRatio}`);

  state.paperQaGenerating = true;
  state.paperQaErrorMessage = null;
  state.paperQaUploadMessage = null;
  renderPaperQaPanel();

  try {
    const result = await invoke<PaperQaGenerateResponse>("generate_paper_qa", { request });
    appendLog(`Paper QA Generate: OK items=${result.items.length}, total=${result.stats.total}, warnings=${result.warnings?.length ?? 0}`);
    if (result.warnings && result.warnings.length > 0) {
      for (const w of result.warnings) {
        appendLog(`Paper QA Warning: ${w}`);
      }
    }
    state.paperQaResult = result;
  } catch (err) {
    appendLog(`Paper QA Generate: ERROR ${String(err)}`);
    state.paperQaErrorMessage = t("paper_qa_generate_error") + ": " + String(err);
  }

  state.paperQaGenerating = false;
  renderPaperQaPanel();
}

async function handlePaperQaSaveBatch() {
  if (state.paperQaUploading || !state.paperQaResult?.items.length) return;

  state.paperQaUploading = true;
  state.paperQaErrorMessage = null;
  state.paperQaUploadMessage = null;
  renderPaperQaPanel();

  try {
    const chunkedFiles = state.paperFiles.filter(f => f.status === "chunked" && f.chunks);
    const paperTitle = chunkedFiles.map(f => f.name).join(", ");
    const resolved = resolveLLMProvider();
    const provider = resolved.mode === "settings" ? resolved.provider : "openai-compatible";
    const model = resolved.model;

    const batch = await invoke<QaBatchSummary>("save_paper_qa_batch", {
      items: state.paperQaResult.items,
      paperTitle,
      provider,
      model,
    });

    appendLog(`Paper QA: saved batch ${batch.id} (${batch.totalCount} items) to Browse QA`);
    state.paperQaUploadMessage = t("paper_qa_save_batch_done");
  } catch (err) {
    appendLog(`Paper QA Save Batch: ERROR ${String(err)}`);
    state.paperQaErrorMessage = t("paper_qa_save_batch_error") + ": " + String(err);
  }

  state.paperQaUploading = false;
  renderPaperQaPanel();
}

function setCurrentTab(tab: UiTab) {
  state.currentTab = tab;
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

  if (tab === "browse" && !state.browseLoading) {
    void loadBrowseBatches();
  }
  if (tab === "qa-evaluate") {
    try { renderQaEvaluatePanel(); } catch (e) { appendLog(`renderQaEvaluatePanel: ${String(e)}`); }
  }
  if (
    tab === "model-trial" &&
    !state.modelTrialLocalBatches.length
  ) {
    void loadModelTrialLocalBatches();
  }
  if (
    tab === "model-trial" &&
    !state.modelTrialWorkspaceLoading &&
    hasQaPlatformCredentials() &&
    currentQaPlatformUrl() &&
    !state.modelTrialConfigs.length &&
    !state.modelTrialSessions.length
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
        const secondarySelected = state.pendingTopicFieldTags.includes(secondary.id);
        const tertiaryHtml = secondary.children?.length
          ? `<div class="field-chip-grid">${secondary.children
              .map((tertiary) => {
                const tertiarySelected = state.pendingTopicFieldTags.includes(tertiary.id);
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

  if (state.pendingTopicFieldTags.length === 0) {
    topicFieldPendingList.innerHTML = `<p class="empty-inline">${escapeHtml(t("no_tags"))}</p>`;
  } else {
    topicFieldPendingList.innerHTML = state.pendingTopicFieldTags
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

  topicFieldSelectedCount.textContent = formatCountTemplate("topic_field_selected_count", state.pendingTopicFieldTags.length);
  confirmTopicFieldSelectionButton.disabled = state.pendingTopicFieldTags.length === 0;
}

function renderTopicTags() {
  if (state.topicTags.length === 0) {
    selectedTopicTags.innerHTML = `<p class="empty-inline">${escapeHtml(t("no_tags"))}</p>`;
  } else {
    selectedTopicTags.innerHTML = state.topicTags
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
    const active = state.topicTags.includes(tag);
    return `<button class="tag-chip${active ? " active" : ""}" type="button" data-suggested-tag="${tag}">${escapeHtml(topicTagLabel(tag, "short"))}</button>`;
  }).join("");

  if (!topicFieldModal.hidden) {
    renderTopicFieldModal();
  }
}

function togglePendingTopicFieldTag(tag: string) {
  if (state.pendingTopicFieldTags.includes(tag)) {
    state.pendingTopicFieldTags = state.pendingTopicFieldTags.filter((item) => item !== tag);
  } else {
    state.pendingTopicFieldTags = [...state.pendingTopicFieldTags, tag];
  }

  renderTopicFieldModal();
}

function openTopicFieldModal() {
  if (!state.topicFieldModalPrimaryId) {
    state.topicFieldModalPrimaryId = RESEARCH_FIELD_TAXONOMY[0]?.id ?? null;
  }

  state.pendingTopicFieldTags = [];
  topicFieldModal.hidden = false;
  renderTopicFieldModal();
}

function closeTopicFieldModal() {
  topicFieldModal.hidden = true;
  state.pendingTopicFieldTags = [];
}

function addTopicTag(tag: string) {
  const normalized = normalizeTopicTag(tag);
  if (!normalized) {
    return;
  }
  if (!state.topicTags.includes(normalized)) {
    clearManagedResumeBatchOnUserEdit();
    state.topicTags = [...state.topicTags, normalized];
    renderTopicTags();
    renderSetupSummary();
    scheduleAutoSave();
  }
}

function removeTopicTag(tag: string) {
  clearManagedResumeBatchOnUserEdit();
  state.topicTags = state.topicTags.filter((item) => item !== tag);
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

function localBrowseBatches(): QaBatchSummary[] {
  return state.browseBatches.filter((batch) => !isRemoteVirtualBrowseBatch(batch.id));
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


function remoteVirtualBatchPrompt(summary: PlatformImportBatchSummary): string {
  const scope = [summary.applicationName, summary.technicalTypeName].filter(Boolean).join(" · ");
  if (state.currentLang === "zh") {
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
    cotSectionHeaders: defaultCotSectionHeadersForLang(state.currentLang),
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


export function renderSetupSummary() {
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

  const missingLabels = missingKeys.map((key) => t(key)).join(state.currentLang === "zh" ? "、" : ", ");
  const connectionMissingKeys = missingKeys.filter((key) =>
    ["settings_checklist_missing_base_url", "settings_checklist_missing_api_key"].includes(key)
  );
  const connectionMissingLabels = connectionMissingKeys
    .map((key) => t(key))
    .join(state.currentLang === "zh" ? "、" : ", ");
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
        ? formatMessage("settings_checklist_model_ready", currentModelValue(modelInput, customModelInput))
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
  state.runStats = {
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
  state.runStats = {
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
  if (state.runStatsTimer !== null) {
    window.clearInterval(state.runStatsTimer);
    state.runStatsTimer = null;
  }
}

function startRunStatsTicker() {
  stopRunStatsTicker();
  state.runStatsTimer = window.setInterval(() => {
    renderRunStats();
  }, 1000);
}

function updateRunStatsFromEvent(payload: PipelineProgressEvent) {
  const now = Date.now();
  if (state.runStats.startedAtMs === null) {
    state.runStats.startedAtMs = now;
  }

  state.runStats.lastUpdatedAtMs = now;
  if (payload.targetCount !== null && payload.targetCount !== undefined) {
    state.runStats.targetCount = payload.targetCount;
  }
  if (payload.totalGenerated !== null && payload.totalGenerated !== undefined) {
    state.runStats.generatedCount = payload.totalGenerated;
  }
  if (payload.shardIndex !== null && payload.shardIndex !== undefined) {
    state.runStats.shardIndex = payload.shardIndex;
  }
  if (payload.shardCount !== null && payload.shardCount !== undefined) {
    state.runStats.shardCount = payload.shardCount;
  }

  if (payload.runtimeKind === "batch_completed") {
    state.runStats.completedBatchCount += 1;
  } else if (payload.runtimeKind === "shard_completed") {
    state.runStats.completedShardCount += 1;
  } else if (payload.runtimeKind === "shard_skipped") {
    state.runStats.skippedShardCount += 1;
  } else if (payload.runtimeKind === "batch_retry") {
    state.runStats.retryCount += 1;
  } else if (payload.runtimeKind === "batch_failed") {
    state.runStats.failedBatchCount += 1;
  }

  if (
    state.runStats.samples.length === 0 ||
    state.runStats.samples[state.runStats.samples.length - 1]?.generatedCount !== state.runStats.generatedCount
  ) {
    state.runStats.samples.push({ atMs: now, generatedCount: state.runStats.generatedCount });
  }

  state.runStats.samples = state.runStats.samples.filter((sample) => now - sample.atMs <= 5 * 60 * 1000);
}

function renderRunStats() {
  const now = Date.now();
  const startedAtMs = state.runStats.startedAtMs;
  const elapsedMs = startedAtMs === null ? null : now - startedAtMs;
  const totalGenerated = state.runStats.generatedCount;
  const totalTarget = state.runStats.targetCount;
  const avgRatePerMinute =
    startedAtMs !== null && elapsedMs !== null && elapsedMs > 0
      ? (totalGenerated / elapsedMs) * 60_000
      : null;

  const recentWindowStart = now - 60_000;
  const recentSample = [...state.runStats.samples]
    .reverse()
    .find((sample) => sample.atMs <= recentWindowStart) ?? state.runStats.samples[0] ?? null;
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
  const shardCompleted = state.runStats.completedShardCount + state.runStats.skippedShardCount;
  const shardProgress =
    state.runStats.shardCount !== null
      ? `${formatCount(shardCompleted)} / ${formatCount(state.runStats.shardCount)}`
      : state.runStats.shardIndex !== null
        ? formatCount(state.runStats.shardIndex)
        : t("stats_idle");

  const cards = [
    { label: t("stats_elapsed"), value: startedAtMs === null ? t("stats_idle") : formatDuration(elapsedMs) },
    { label: t("stats_current_speed"), value: formatRate(currentRatePerMinute) },
    { label: t("stats_eta"), value: formatDuration(etaMs) },
    { label: t("stats_generated_progress"), value: generatedProgress },
    { label: t("stats_shard_progress"), value: shardProgress },
    ...(state.runStats.retryCount > 0
      ? [{ label: t("stats_retry_count"), value: formatCount(state.runStats.retryCount) }]
      : []),
    ...(state.runStats.failedBatchCount > 0
      ? [{ label: t("stats_failed_requests"), value: formatCount(state.runStats.failedBatchCount) }]
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
    state.browseBatches.find((batch) => batch.id === state.browseSelectedBatchId) ??
    state.browsePageData?.batch ??
    state.browseDetailData?.batch ??
    null
  );
}

function currentBrowseReviewItem(): QaRecordSummary | null {
  return state.browseReviewItems[state.browseReviewIndex] ?? null;
}

function currentBrowseReviewDraft(): string {
  const item = currentBrowseReviewItem();
  if (!item) {
    return "";
  }
  return state.browseReviewDrafts.get(item.id) ?? item.effectiveQuestion;
}

function moveToNextBrowseReviewItem() {
  if (state.browseReviewIndex < state.browseReviewItems.length - 1) {
    state.browseReviewIndex += 1;
  }
}

function updateBrowseBatchReviewSummary(
  batchId: string,
  summary: { reviewedCount: number; keptCount: number; discardedCount: number }
) {
  state.browseBatches = state.browseBatches.map((batch) =>
    batch.id === batchId
      ? {
          ...batch,
          reviewedCount: summary.reviewedCount,
          reviewKeptCount: summary.keptCount,
          discardedCount: summary.discardedCount
        }
      : batch
  );
  if (state.browsePageData?.batch.id === batchId) {
    state.browsePageData = {
      ...state.browsePageData,
      batch: {
        ...state.browsePageData.batch,
        reviewedCount: summary.reviewedCount,
        reviewKeptCount: summary.keptCount,
        discardedCount: summary.discardedCount
      }
    };
  }
  if (state.browseDetailData?.batch.id === batchId) {
    state.browseDetailData = {
      ...state.browseDetailData,
      batch: {
        ...state.browseDetailData.batch,
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
  state.browseReviewItems = state.browseReviewItems.map((item) =>
    item.id === qaId
      ? {
          ...item,
          reviewStatus: response.review.status,
          editedQuestion: response.review.editedQuestion,
          effectiveQuestion: response.review.effectiveQuestion
        }
      : item
  );
  state.browsePageData =
    state.browsePageData && state.browsePageData.batch.id === batchId
      ? {
          ...state.browsePageData,
          items: state.browsePageData.items.map((item) =>
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
      : state.browsePageData;
  state.browseDetailData =
    state.browseDetailData && state.browseDetailData.batch.id === batchId && state.browseDetailData.item.id === qaId
      ? {
          ...state.browseDetailData,
          review: response.review
        }
      : state.browseDetailData;
  state.browseReviewDrafts.set(qaId, response.review.effectiveQuestion);
}

function clearBrowseRemoteVirtualBatch() {
  state.browseRemoteVirtualBatch = null;
  state.browseRemoteVirtualBatchDetail = null;
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
  if (state.platformLoginState.kind === "success") {
    return state.platformLoginState.response.endpoints;
  }
  if (state.platformHealthState.kind === "success") {
    return state.platformHealthState.response.endpoints;
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
  state.modelTrialWorkspaceLoading = false;
  state.modelTrialDetailLoading = false;
  state.modelTrialCreating = false;
  state.modelTrialSending = false;
  state.modelTrialDeletingSessionId = null;
  state.modelTrialConfigs = [];
  state.modelTrialSessions = [];
  state.modelTrialDetail = null;
  state.modelTrialSelectedConfigId = null;
  state.modelTrialSelectedSessionId = null;
  state.modelTrialComposer = "";
  state.modelTrialErrorMessage = null;
  state.modelTrialNoticeMessage = null;
  state.modelTrialLocalBatches = [];
  state.modelTrialSelectedBatchId = null;
  state.modelTrialLocalQuestions = [];
  state.modelTrialSelectedQuestionId = null;
  state.modelTrialLocalQuestionDetail = null;
  state.modelTrialLocalQuestionsLoading = false;
}

function resetPlatformIntegrationState() {
  state.platformHealthState = { kind: "idle" };
  state.platformLoginState = { kind: "idle" };
  clearBrowsePlatformStatuses();
  clearBrowseRemoteVirtualBatch();
  resetModelTrialState();
}

function currentModelTrialSelectedQuestion(): QaRecordSummary | null {
  if (!state.modelTrialSelectedQuestionId) {
    return null;
  }
  return state.modelTrialLocalQuestions.find((item) => item.id === state.modelTrialSelectedQuestionId) ?? null;
}

function currentModelTrialSelectedConfig(): TrialLlmConfigOption | null {
  return state.modelTrialConfigs.find((item) => item.id === state.modelTrialSelectedConfigId) ?? null;
}

function renderPlatformStateBlock(platformState: typeof state.platformHealthState | typeof state.platformLoginState, kind: "health" | "login"): string {
  if (platformState.kind === "loading") {
    return `<div class="platform-state-card"><p class="platform-state-value">${escapeHtml(
      kind === "health" ? t("platform_health_checking") : t("platform_login_checking")
    )}</p></div>`;
  }
  if (platformState.kind === "error") {
    return `<div class="platform-state-card error"><p class="platform-state-value">${escapeHtml(platformState.message)}</p></div>`;
  }
  if (platformState.kind === "success") {
    if (kind === "health") {
      return `
        <div class="platform-state-card success">
          <p class="platform-state-label">${escapeHtml(t("platform_web_base"))}</p>
          <p class="platform-state-value">${escapeHtml(platformState.response.endpoints.platformWebBaseUrl)}</p>
          <p class="platform-state-label">${escapeHtml(t("platform_api_base"))}</p>
          <p class="platform-state-value">${escapeHtml(platformState.response.endpoints.platformApiBaseUrl)}</p>
        </div>
      `;
    }
    const loginResponse = platformState.response as PlatformLoginResponse;
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
    state.platformLoginState.kind === "error"
      ? `<div class="platform-inline-banner error">${escapeHtml(state.platformLoginState.message)}</div>`
      : state.platformLoginState.kind === "success"
        ? `<div class="platform-inline-banner success">${escapeHtml(
            `${t("platform_login_ok")} ${state.platformLoginState.response.user.username}`
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
          state.platformLoginState.kind === "success"
            ? state.platformLoginState.response.user.username
            : qaPlatformUsernameInput.value.trim() || t("empty_value")
        )}</span>
      </div>
      <div class="model-trial-topbar-item">
        <span class="platform-card-label">${escapeHtml(t("platform_action_check"))}</span>
        <div class="model-trial-topbar-check">
          <span class="platform-card-value">${escapeHtml(
            state.platformHealthState.kind === "success"
              ? t("platform_health_ok")
              : state.platformHealthState.kind === "error"
                ? t("platform_health_failed")
                : state.platformHealthState.kind === "loading"
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
    state.modelTrialLocalBatches.find((item) => item.id === state.modelTrialSelectedBatchId) ?? null;
  const sourceMeta = selectedBatch
    ? `${t("model_trial_source_local")}: ${selectedBatch.topicName || selectedBatch.name}`
    : "";

  const sessionListHtml = state.modelTrialSessions.length
    ? state.modelTrialSessions
        .map((session) => {
          const selected = session.id === state.modelTrialSelectedSessionId;
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
                  ${state.modelTrialDeletingSessionId === session.id ? "disabled" : ""}
                >${escapeHtml(
                  state.modelTrialDeletingSessionId === session.id
                    ? t("model_trial_delete_busy")
                    : t("model_trial_delete")
                )}</button>
              </div>
            </article>
          `;
        })
        .join("")
    : `<div class="empty-state compact">${escapeHtml(
        state.modelTrialWorkspaceLoading ? t("model_trial_loading") : t("model_trial_empty_sessions")
      )}</div>`;

  const messagesHtml = state.modelTrialDetail?.messages.length
    ? state.modelTrialDetail.messages
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
        state.modelTrialDetailLoading ? t("model_trial_loading") : t("model_trial_message_empty")
      )}</div>`;

  const bannerHtml = state.modelTrialErrorMessage
    ? `<div class="platform-inline-banner error">${escapeHtml(state.modelTrialErrorMessage)}</div>`
    : state.modelTrialNoticeMessage
      ? `<div class="platform-inline-banner success">${escapeHtml(state.modelTrialNoticeMessage)}</div>`
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
          state.platformLoginState.kind === "success"
            ? state.platformLoginState.response.user.username
            : qaPlatformUsernameInput.value.trim() || t("empty_value")
        )}</span>
      </div>
      <div class="model-trial-topbar-item">
        <span class="platform-card-label">${escapeHtml(t("platform_action_check"))}</span>
        <div class="model-trial-topbar-check">
          <span class="platform-card-value">${escapeHtml(
            state.platformHealthState.kind === "success"
              ? t("platform_health_ok")
              : state.platformHealthState.kind === "error"
                ? t("platform_health_failed")
                : state.platformHealthState.kind === "loading"
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
                  ${state.modelTrialCreating || !selectedConfig ? "disabled" : ""}
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
                    ${state.modelTrialConfigs
                      .map(
                        (config) => `
                          <option value="${config.id}" ${config.id === state.modelTrialSelectedConfigId ? "selected" : ""}>
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
                    ${state.modelTrialLocalBatches
                      .map(
                        (batch) => `
                          <option value="${escapeHtml(batch.id)}" ${batch.id === state.modelTrialSelectedBatchId ? "selected" : ""}>
                            ${escapeHtml(batch.topicName || batch.name)}
                          </option>
                        `
                      )
                      .join("")}
                  </select>
                </label>
                <label class="model-trial-field">
                  <span>${escapeHtml(t("model_trial_select_question"))}</span>
                  <select id="model-trial-question-select" ${state.modelTrialSelectedBatchId ? "" : "disabled"}>
                    <option value="">${escapeHtml(
                      state.modelTrialSelectedBatchId
                        ? state.modelTrialLocalQuestionsLoading
                          ? t("model_trial_loading")
                          : t("model_trial_select_question_empty")
                        : t("model_trial_select_question_empty")
                    )}</option>
                    ${state.modelTrialLocalQuestions
                      .map(
                        (question) => `
                          <option value="${escapeHtml(question.id)}" ${question.id === state.modelTrialSelectedQuestionId ? "selected" : ""}>
                            ${escapeHtml(truncateText(question.question, 90))}
                          </option>
                        `
                      )
                      .join("")}
                  </select>
                </label>
                <div class="model-trial-meta-cards">
                  <div class="version-badge">${escapeHtml(
                    `${t("model_trial_user_badge")} ${state.platformLoginState.kind === "success" ? state.platformLoginState.response.user.username : t("empty_value")}`
                  )}</div>
                  <div class="version-badge">${escapeHtml(
                    `${t("model_trial_model_badge")} ${selectedConfig?.modelName || state.modelTrialDetail?.session.llmModelName || t("empty_value")}`
                  )}</div>
                </div>
              </div>
              <section class="model-trial-source-panel">
                <div class="title-with-meta">
                  <p class="section-title">${escapeHtml(t("model_trial_source_card"))}</p>
                  ${sourceMeta ? `<p class="model-trial-source-meta">${escapeHtml(sourceMeta)}</p>` : ""}
                </div>
                ${
                  state.modelTrialLocalQuestionDetail
                    ? `
                      <p class="model-trial-source-question">${escapeHtml(state.modelTrialLocalQuestionDetail.item.question)}</p>
                      ${
                        state.modelTrialLocalQuestionDetail.item.answer
                          ? `<p class="model-trial-source-answer">${escapeHtml(state.modelTrialLocalQuestionDetail.item.answer)}</p>`
                          : ""
                      }
                    `
                    : state.modelTrialDetail?.source
                      ? `
                          <p class="model-trial-source-question">${escapeHtml(state.modelTrialDetail.source.questionText)}</p>
                          ${
                            state.modelTrialDetail.source.answerText
                              ? `<p class="model-trial-source-answer">${escapeHtml(state.modelTrialDetail.source.answerText)}</p>`
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
                    state.modelTrialDetail?.session
                      ? `<p class="model-trial-chat-meta">${escapeHtml(
                          `${state.modelTrialDetail.session.title} · ${formatPlatformTime(state.modelTrialDetail.session.updatedAt)}`
                        )}</p>`
                      : ""
                  }
                </div>
                <div class="model-trial-message-list">${messagesHtml}</div>
                <div class="model-trial-composer">
                  <textarea id="model-trial-composer" placeholder="${escapeHtml(
                    t("model_trial_input_placeholder")
                  )}">${escapeHtml(state.modelTrialComposer)}</textarea>
                  <div class="model-trial-composer-actions">
                    <button
                      type="button"
                      data-model-trial-action="send-message"
                      ${state.modelTrialSending || state.modelTrialCreating || !selectedConfig ? "disabled" : ""}
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
  if (state.platformLoginState.kind === "success") {
    platformStatusBadge.className = "platform-status-badge connected";
    platformStatusBadge.textContent = state.platformLoginState.response.user.username;
  } else if (state.platformLoginState.kind === "loading") {
    platformStatusBadge.className = "platform-status-badge checking";
    platformStatusBadge.textContent = "...";
  } else if (state.platformLoginState.kind === "error") {
    platformStatusBadge.className = "platform-status-badge error";
    platformStatusBadge.textContent = "✕";
  } else {
    platformStatusBadge.className = "platform-status-badge";
    platformStatusBadge.textContent = "○";
  }
  // Also sync the in-settings login status
  if (platformLoginStatus) {
    if (state.platformLoginState.kind === "success") {
      platformLoginStatus.className = "platform-login-status connected";
      platformLoginStatus.textContent = `${t("platform_login_ok")} ${state.platformLoginState.response.user.username}`;
    } else if (state.platformLoginState.kind === "loading") {
      platformLoginStatus.className = "platform-login-status checking";
      platformLoginStatus.textContent = t("platform_login_checking");
    } else if (state.platformLoginState.kind === "error") {
      platformLoginStatus.className = "platform-login-status error";
      platformLoginStatus.textContent = `${t("platform_login_failed")}: ${state.platformLoginState.message}`;
    } else {
      platformLoginStatus.className = "platform-login-status";
      platformLoginStatus.textContent = t("platform_login_idle");
    }
  }
}

function renderPlatformAccountCard() {
  const card = document.querySelector<HTMLElement>("#platform-account-card");
  if (!card) return;

  if (state.platformLoginState.kind !== "success") {
    card.innerHTML = `
      <div class="platform-account-card disconnected">
        <p class="platform-account-status">${escapeHtml(t("platform_login_idle"))}</p>
      </div>`;
    return;
  }

  const user = state.platformLoginState.response.user;
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
        state.passwordChangeState = { kind: "idle" };
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
    state.platformLoginState = { kind: "idle" };
    renderPlatformPanels();
  });
}

// ---- v0.1.8: Recent updates & feedback ----

function renderRecentUpdatesPanel() {
  if (!recentUpdatesPanel) return;

  const isConnected = state.platformLoginState.kind === "success";

  if (!isConnected) {
    recentUpdatesPanel.innerHTML = `
      <div class="recent-updates-disconnected">
        <p>${escapeHtml(t("recent_updates_disconnected"))}</p>
      </div>`;
    return;
  }

  const overview = state.dashboardOverviewState;
  const exportsStats = state.exportsStatsState;
  const changelog = state.modelChangelogState;
  const news = state.platformNewsState;

  const overviewHtml = overview.kind === "loading" ? `
    <div class="recent-updates-card">
      <div class="recent-updates-loading">${state.currentLang === "zh" ? "加载中" : "Loading"}...</div>
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
        <span class="stat-label">${escapeHtml(t("recent_updates_last_refresh"))}: ${escapeHtml(formatTimestamp(state.recentUpdatesLastRefreshTime))}</span>
      </div>
    </div>` : "";

  const weeklyHtml = exportsStats.kind === "loading" ? `
    <div class="recent-updates-card">
      <h3>${state.currentLang === "zh" ? "周 QA 趋势" : "Weekly QA Trend"}</h3>
      <div class="recent-updates-loading">${state.currentLang === "zh" ? "加载中" : "Loading"}...</div>
    </div>` : exportsStats.kind === "error" ? `
    <div class="recent-updates-card error">
      <h3>${state.currentLang === "zh" ? "周 QA 趋势" : "Weekly QA Trend"}</h3>
      <p>${escapeHtml(exportsStats.message)}</p>
    </div>` : exportsStats.kind === "success" ? renderWeeklyStats(exportsStats.data) : "";

  const changelogHtml = changelog.kind === "loading" ? `
    <div class="recent-updates-card">
      <h3>${escapeHtml(t("recent_updates_model_changes"))}</h3>
      <div class="recent-updates-loading">${state.currentLang === "zh" ? "加载中" : "Loading"}...</div>
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
      <div class="recent-updates-loading">${state.currentLang === "zh" ? "加载中" : "Loading"}...</div>
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
      return state.currentLang === "zh"
        ? ["日", "一", "二", "三", "四", "五", "六"][d.getDay()]
        : ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][d.getDay()];
    } catch { return dateStr.slice(-5); }
  }

  return `
    <div class="recent-updates-card">
      <h3>${state.currentLang === "zh" ? "周 QA 趋势" : "Weekly QA Trend"}</h3>
      ${thisWeek || lastWeek ? `
      <div class="weekly-summary">
        ${lastWeek ? `
        <div class="weekly-summary-item">
          <span class="weekly-summary-period">${state.currentLang === "zh" ? "上周" : "Last Week"}</span>
          <span class="weekly-summary-count">${lastWeek.importCount.toLocaleString()}</span>
        </div>` : ""}
        ${thisWeek ? `
        <div class="weekly-summary-item">
          <span class="weekly-summary-period">${state.currentLang === "zh" ? "本周" : "This Week"}</span>
          <span class="weekly-summary-count">${thisWeek.importCount.toLocaleString()}</span>
        </div>` : ""}
      </div>` : ""}
      <div class="daily-trend">
        <div class="daily-trend-bars">
          ${recentDays.map(d => `
            <div class="daily-bar-item" title="${d.date}: ${d.count.toLocaleString()}">
              <span class="daily-bar-count">${d.count > 0 ? d.count.toLocaleString() : ""}</span>
              <div class="daily-bar" style="height: ${barHeight(d.count)}px"></div>
              ${d.isToday ? '<span class="daily-bar-today">' + (state.currentLang === "zh" ? "今天" : "Today") + '</span>' : `<span class="daily-bar-label">${dayLabel(d.date)}</span>`}
            </div>
          `).join("")}
        </div>
      </div>
    </div>`;
}

function getCurrentSession(): ChatSession | undefined {
  return state.chatSessions.find(s => s.id === state.currentChatSessionId);
}

function createChatSession() {
  state.sessionCounter++;
  const session: ChatSession = {
    id: crypto.randomUUID(),
    name: `${t("chat_qa_session_untitled")} ${state.sessionCounter}`,
    messages: [],
    createdAt: Date.now()
  };
  state.chatSessions.push(session);
  state.currentChatSessionId = session.id;
  persistChatSessions();
  renderChatQaPanel();
}

function switchChatSession(id: string) {
  if (state.chatSessions.some(s => s.id === id)) {
    state.currentChatSessionId = id;
    persistChatSessions();
    renderChatQaPanel();
  }
}

function deleteChatSession(id: string) {
  const idx = state.chatSessions.findIndex(s => s.id === id);
  if (idx === -1) return;
  state.chatSessions.splice(idx, 1);
  if (state.currentChatSessionId === id) {
    if (state.chatSessions.length > 0) {
      state.currentChatSessionId = state.chatSessions[state.chatSessions.length - 1].id;
    } else {
      state.currentChatSessionId = null;
    }
  }
  persistChatSessions();
  if (state.chatSessions.length === 0) {
    createChatSession();
  } else {
    renderChatQaPanel();
  }
}

function persistChatSessions() {
  try {
    const data = JSON.stringify({
      sessions: state.chatSessions,
      currentId: state.currentChatSessionId,
      counter: state.sessionCounter,
    });
    window.localStorage.setItem(CHAT_SESSIONS_STORAGE_KEY, data);
  } catch { /* quota exceeded — silently skip */ }
}

function restoreChatSessions() {
  try {
    const raw = window.localStorage.getItem(CHAT_SESSIONS_STORAGE_KEY);
    if (!raw) return;
    const data = JSON.parse(raw);
    if (Array.isArray(data.sessions) && data.sessions.length > 0) {
      state.chatSessions = data.sessions;
      state.currentChatSessionId = data.currentId ?? state.chatSessions[0]?.id ?? null;
      state.sessionCounter = data.counter ?? state.chatSessions.length;
    }
  } catch { /* corrupted data — ignore */ }
}

function persistPaperQaState() {
  try {
    const data = JSON.stringify({
      files: state.paperFiles,
      result: state.paperQaResult,
      cotRatio: state.paperQaCotRatio,
    });
    window.localStorage.setItem(PAPER_QA_STORAGE_KEY, data);
  } catch { /* quota exceeded — silently skip */ }
}

function restorePaperQaState() {
  try {
    const raw = window.localStorage.getItem(PAPER_QA_STORAGE_KEY);
    if (!raw) return;
    const data = JSON.parse(raw);
    if (Array.isArray(data.files)) state.paperFiles = data.files;
    if (data.result) state.paperQaResult = data.result;
    if (typeof data.cotRatio === "number") state.paperQaCotRatio = data.cotRatio;
  } catch { /* corrupted data — ignore */ }
}

function renderChatSessionsBar() {
  if (!chatQaSessionsBar) return;

  const auth = currentPlatformAuthPayload();
  const currentSession = getCurrentSession();
  const hasMessages = (currentSession?.messages.length ?? 0) > 0;
  const canUpload = Boolean(auth) && hasMessages;

  const tabs = state.chatSessions.map(s => {
    const activeClass = s.id === state.currentChatSessionId ? " active" : "";
    const uploadState = state.sessionUploadStates[s.id];
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
    + `<button type="button" class="chat-qa-upload-button${uploadDisabled}" id="chat-qa-upload-button" title="${uploadTitle}"${uploadDisabled} data-upload-session="${state.currentChatSessionId ?? ""}">${escapeHtml(t("chat_qa_upload"))}</button>`;
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

  chatQaSendButton.disabled = !hasConfig || state.chatSending;
  chatQaInput.disabled = !hasConfig || state.chatSending;

  if (state.chatError) {
    chatQaError.hidden = false;
    chatQaError.textContent = state.chatError;
  } else {
    chatQaError.hidden = true;
  }
}

async function handleChatSend() {
  if (state.chatSending) return;

  const session = getCurrentSession();
  if (!session) return;

  const text = chatQaInput.value.trim();
  if (!text) return;

  const resolved = resolveLLMProvider();
  const modelReady = resolved.model.length > 0;
  if (resolved.mode === "none" || !modelReady) {
    state.chatError = t("chat_qa_no_model");
    renderChatQaPanel();
    return;
  }

  session.messages.push({ role: "user", content: text });
  chatQaInput.value = "";
  state.chatSending = true;
  state.chatError = null;
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
    state.chatError = `${t("chat_qa_send_failed")}: ${String(error)}`;
  } finally {
    state.chatSending = false;
    persistChatSessions();
    renderChatQaPanel();
  }
}

async function uploadChatSession(sessionId: string) {
  const session = state.chatSessions.find(s => s.id === sessionId);
  if (!session || session.messages.length === 0) return;

  const auth = currentPlatformAuthPayload();
  if (!auth) {
    state.sessionUploadStates[sessionId] = { kind: "error", message: t("chat_qa_upload_no_auth") };
    renderChatQaPanel();
    return;
  }

  state.sessionUploadStates[sessionId] = { kind: "uploading" };
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
    state.sessionUploadStates[sessionId] = { kind: "success", batchId: response.batch_id ?? 0 };
  } catch (error) {
    state.sessionUploadStates[sessionId] = { kind: "error", message: String(error) };
  }
  renderChatQaPanel();
}

function renderFeedback2Panel() {
  const isLoggedIn = state.platformLoginState.kind === "success";
  const formState = state.feedback2FormState;

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
    state.dashboardOverviewState = { kind: "idle" };
    state.platformNewsState = { kind: "idle" };
    state.modelChangelogState = { kind: "idle" };
    state.exportsStatsState = { kind: "idle" };
    renderRecentUpdatesPanel();
    return;
  }

  state.dashboardOverviewState = { kind: "loading" };
  state.platformNewsState = { kind: "loading" };
  state.modelChangelogState = { kind: "loading" };
  state.exportsStatsState = { kind: "loading" };
  renderRecentUpdatesPanel();

  try {
    const [overview, news, changelog, exportsStats] = await Promise.all([
      invoke<DashboardOverview>("get_platform_stats", auth),
      invoke<PlatformNews[]>("get_platform_news", auth),
      invoke<ModelChangelogEntry[]>("get_model_changelog", { ...auth, days: 7 }),
      invoke<ExportsStatsData>("get_exports_stats", auth)
    ]);
    state.dashboardOverviewState = { kind: "success", data: overview };
    state.platformNewsState = { kind: "success", items: news };
    state.modelChangelogState = { kind: "success", items: changelog };
    state.exportsStatsState = { kind: "success", data: exportsStats };
    state.recentUpdatesLastRefreshTime = Date.now();
  } catch (error) {
    state.dashboardOverviewState = { kind: "error", message: String(error) };
    state.platformNewsState = { kind: "error", message: String(error) };
    state.modelChangelogState = { kind: "error", message: String(error) };
    state.exportsStatsState = { kind: "error", message: String(error) };
  }
  renderRecentUpdatesPanel();
}

function formatDateString(dateStr: string): string {
  try {
    const d = new Date(dateStr);
    return new Intl.DateTimeFormat(state.currentLang === "zh" ? "zh-CN" : "en-US", {
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit"
    }).format(d);
  } catch { return dateStr; }
}

function formatTimestamp(ts: number | null): string {
  if (!ts) return t("empty_value");
  return new Intl.DateTimeFormat(state.currentLang === "zh" ? "zh-CN" : "en-US", {
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

  state.feedback2FormState = { kind: "submitting" };
  renderFeedback2Panel();
  try {
    await invoke("submit_feedback", {
      ...auth,
      title,
      content,
      category: categorySelect.value
    });
    state.feedback2FormState = { kind: "success" };
    titleInput.value = "";
    contentInput.value = "";
  } catch (error) {
    state.feedback2FormState = { kind: "error", message: String(error) };
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
    state.passwordChangeState = { kind: "error", message: t("platform_password_mismatch") };
    renderPasswordChangeForm();
    return;
  }

  const auth = currentPlatformAuthPayload();
  if (!auth) return;

  state.passwordChangeState = { kind: "submitting" };
  renderPasswordChangeForm();
  try {
    await invoke<ChangePasswordResponse>("change_platform_password", {
      ...auth,
      currentPassword,
      newPassword
    });
    state.passwordChangeState = { kind: "success" };
    currentInput.value = "";
    newInput.value = "";
    confirmInput.value = "";
  } catch (error) {
    state.passwordChangeState = { kind: "error", message: String(error) };
  }
  renderPasswordChangeForm();
}

function renderPasswordChangeForm() {
  const container = document.querySelector<HTMLElement>("#password-change-form-container");
  if (!container) return;

  const pwState = state.passwordChangeState;
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
      <button type="submit" class="feedback-submit-button" ${pwState.kind === "submitting" ? "disabled" : ""}>
        ${pwState.kind === "submitting" ? escapeHtml(t("platform_password_submitting")) : escapeHtml(t("platform_password_submit"))}
      </button>
      ${pwState.kind === "success" ? `<p class="feedback-success">${escapeHtml(t("platform_password_success"))}</p>` : ""}
      ${pwState.kind === "error" ? `<p class="feedback-error">${escapeHtml(pwState.message)}</p>` : ""}
    </form>
  `;

  const form = container.querySelector<HTMLFormElement>("#password-change-form");
  if (form) {
    form.addEventListener("submit", handlePasswordChange);
  }
}

function formatBrowsePageLabel(page: number, totalPages: number): string {
  return state.currentLang === "zh"
    ? `第 ${page} / ${totalPages} 页`
    : `Page ${page} / ${totalPages}`;
}

function formatUpdatedAt(updatedAtMs: number | null): string {
  if (!updatedAtMs) {
    return t("empty_value");
  }

  return new Intl.DateTimeFormat(state.currentLang === "zh" ? "zh-CN" : "en-US", {
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

function parseCotAnswerSections(
  answer: string,
  headers: string[] | null | undefined
): Array<{ label: string; value: string }> {
  const normalizedHeaders = normalizeCotSectionHeaders(headers, state.currentLang);
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
  if (state.browseView === "batches") {
    browseBackButton.hidden = true;
    browseBackButton.textContent = "";
    browseViewTitle.textContent = t("browse_batches_title");
    browseViewMeta.textContent = state.browseBatches.length
      ? `${t("browse_history_count")} ${formatCount(state.browseBatches.length)}`
      : t("browse_batches_empty");
    browseContent.innerHTML = renderBrowseBatches();
    return;
  }

  const batch = currentBrowseBatch();

  if (state.browseView === "questions") {
    browseBackButton.hidden = false;
    browseBackButton.textContent = t("browse_back_batches");
    browseViewTitle.textContent = batch ? batch.topicName || batch.name : t("browse_questions_title");
    browseViewMeta.textContent = state.browsePageData
      ? `${t("browse_total_items")} ${formatCount(state.browsePageData.totalItems)} · ${formatBrowsePageLabel(state.browsePageData.page, state.browsePageData.totalPages)}`
      : state.browseQuestionsLoading
        ? t("browse_questions_loading")
        : t("browse_questions_empty");
    browseContent.innerHTML = renderBrowseQaList();
    return;
  }

  if (state.browseView === "review") {
    browseBackButton.hidden = false;
    browseBackButton.textContent = t("browse_back_batches");
    browseViewTitle.textContent = batch ? `${batch.topicName || batch.name} · ${t("browse_review_title")}` : t("browse_review_title");
    browseViewMeta.textContent = state.browseReviewLoading
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
  browseViewMeta.textContent = state.browseDetailData
    ? `${batch ? `${batch.topicName || batch.name} · ` : ""}${truncateText(state.browseDetailData.review.effectiveQuestion, 88)}`
    : state.browseDetailLoading
      ? t("browse_detail_loading")
      : t("browse_detail_empty");
  browseContent.innerHTML = renderBrowseDetail();
}

function renderBrowseBatches(): string {
  if (!state.browseBatches.length) {
    return `<div class="empty-state">${escapeHtml(t("browse_batches_empty"))}</div>`;
  }

  const hasUploadUrl = Boolean(currentQaPlatformUrl());
  return `<div class="browse-list">${state.browseBatches
    .map((batch) => {
      const remoteVirtual = isRemoteVirtualBrowseBatch(batch.id);
      const selected = batch.id === state.browseSelectedBatchId;
      const platformStatus = currentBrowseBatchPlatformStatus(batch.id);
      const resumable = canResumeBrowseBatch(batch);
      const uploadDisabled = remoteVirtual || !hasUploadUrl || state.browseUploadingBatchId !== null;
      const uploadBusy = state.browseUploadingBatchId === batch.id;
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
  if (state.browseErrorMessage) {
    return `<div class="empty-state">${escapeHtml(state.browseErrorMessage)}</div>`;
  }

  if (state.browseQuestionsLoading) {
    return `<div class="empty-state">${escapeHtml(t("browse_questions_loading"))}</div>`;
  }

  if (!state.browsePageData || !state.browseSelectedBatchId) {
    return `<div class="empty-state">${escapeHtml(t("browse_questions_empty"))}</div>`;
  }

  const listHtml = !state.browsePageData.items.length
    ? `<div class="empty-state">${escapeHtml(t("browse_questions_empty"))}</div>`
    : `<div class="browse-list">${state.browsePageData.items
        .map((item) => {
          const active = state.browseDetailData?.item.id === item.id;
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
      <button type="button" id="browse-prev-page" ${state.browsePageData.page <= 1 ? "disabled" : ""}>${escapeHtml(t("browse_prev"))}</button>
      <span class="browse-page-label">${escapeHtml(formatBrowsePageLabel(state.browsePageData.page, state.browsePageData.totalPages))}</span>
      <button type="button" id="browse-next-page" ${state.browsePageData.page >= state.browsePageData.totalPages ? "disabled" : ""}>${escapeHtml(t("browse_next"))}</button>
    </div>
  `;
}

function renderBrowseDetail(): string {
  if (state.browseErrorMessage) {
    return `<div class="empty-state">${escapeHtml(state.browseErrorMessage)}</div>`;
  }

  if (state.browseDetailLoading) {
    return `<div class="empty-state">${escapeHtml(t("browse_detail_loading"))}</div>`;
  }

  if (!state.browseDetailData) {
    return `<div class="empty-state">${escapeHtml(t("browse_detail_empty"))}</div>`;
  }

  const { batch, item } = state.browseDetailData;
  const review = state.browseDetailData.review;
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
  if (state.browseErrorMessage) {
    return `<div class="empty-state">${escapeHtml(state.browseErrorMessage)}</div>`;
  }

  if (state.browseReviewLoading) {
    return `<div class="empty-state">${escapeHtml(t("browse_review_loading"))}</div>`;
  }

  const item = currentBrowseReviewItem();
  const batch = currentBrowseBatch();
  if (!item || !batch) {
    return `<div class="empty-state">${escapeHtml(t("browse_review_empty"))}</div>`;
  }

  const draft = currentBrowseReviewDraft();
  const dirty = draft.trim() !== item.effectiveQuestion.trim();
  const total = state.browseReviewItems.length;
  const meta = [item.subtopic, item.axis, item.questionType, item.difficulty]
    .filter(Boolean)
    .join(" · ");

  return `
    <section class="browse-review-shell">
      <article class="browse-review-card">
        <div class="browse-review-header">
          <div class="browse-review-header-copy">
            <p class="result-card-label">${escapeHtml(t("browse_review_progress"))}</p>
            <p class="browse-review-progress">${escapeHtml(`${formatCount(state.browseReviewIndex + 1)} / ${formatCount(total)}`)}</p>
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
          <button type="button" class="browse-mini-button${!dirty || state.browseReviewSaving ? " browse-mini-button-muted" : ""}" id="browse-review-save" ${!dirty || state.browseReviewSaving ? "disabled" : ""}>${escapeHtml(t(state.browseReviewSaving ? "browse_review_saving" : "browse_review_save"))}</button>
          <button type="button" class="browse-mini-button${item.reviewStatus === "kept" ? " active" : ""}" id="browse-review-keep" ${state.browseReviewSaving ? "disabled" : ""}>${escapeHtml(t("browse_review_keep"))}</button>
          <button type="button" class="browse-mini-button browse-mini-button-danger${item.reviewStatus === "discarded" ? " active" : ""}" id="browse-review-discard" ${state.browseReviewSaving ? "disabled" : ""}>${escapeHtml(t("browse_review_discard"))}</button>
        </div>
      </article>
      <div class="browse-review-nav">
        <button type="button" class="browse-review-nav-button" id="browse-review-prev" ${state.browseReviewIndex <= 0 || state.browseReviewSaving ? "disabled" : ""}>${escapeHtml(t("browse_review_prev_question"))}</button>
        <span class="browse-page-label">${escapeHtml(browseReviewSummaryLabel(batch))}</span>
        <button type="button" class="browse-review-nav-button" id="browse-review-next" ${state.browseReviewIndex >= total - 1 || state.browseReviewSaving ? "disabled" : ""}>${escapeHtml(t("browse_review_next_question"))}</button>
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
    if (state.browseSelectedBatchId === batchId) {
      state.browseView = "batches";
      state.browseSelectedBatchId = null;
      state.browsePageData = null;
      state.browseDetailData = null;
      state.browseReviewItems = [];
      state.browseReviewDrafts = new Map();
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
  if (state.browseUploadingBatchId) {
    return;
  }
  if (!hasQaPlatformCredentials()) {
    window.alert(t("browse_platform_credentials_missing"));
    setCurrentTab("settings");
    qaPlatformUsernameInput.focus();
    return;
  }

  state.browseUploadingBatchId = batchId;
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
    state.platformHealthState = {
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
    state.browseUploadingBatchId = null;
    renderBrowseView();
  }
}

async function refreshPlatformHealth() {
  state.platformHealthState = { kind: "loading" };
  renderPlatformPanels();
  try {
    const platformUrl = currentQaPlatformUrl();
    const response = await invoke<PlatformHealthResponse>("check_platform_health", {
      platformUrl
    });
    state.platformHealthState = { kind: "success", response };
    appendLog(`${t("platform_health_ok")} ${response.endpoints.platformApiBaseUrl}`);
  } catch (error) {
    state.platformHealthState = { kind: "error", message: String(error) };
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

  state.platformLoginState = { kind: "loading" };
  renderPlatformPanels();
  try {
    const platformUrl = currentQaPlatformUrl();
    const response = await invoke<PlatformLoginResponse>("login_platform", {
      platformUrl,
      username: qaPlatformUsernameInput.value.trim(),
      password: qaPlatformPasswordInput.value.trim()
    });
    state.platformLoginState = { kind: "success", response };
    state.platformHealthState = {
      kind: "success",
      response: {
        reachable: true,
        message: "ok",
        endpoints: response.endpoints
      }
    };
    appendLog(`${t("platform_login_ok")} ${response.user.username}`);
  } catch (error) {
    state.platformLoginState = { kind: "error", message: String(error) };
    appendLog(`${t("platform_login_failed")}: ${String(error)}`);
  }
  renderPlatformPanels();
}

export function currentPlatformAuthPayload():
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

  state.browseRemoteVirtualBatch = remoteVirtualBatchToBrowseSummary(remoteSummary);
  state.browseRemoteVirtualBatchDetail = null;
  return state.browseRemoteVirtualBatch;
}

async function ensureRemoteVirtualBrowseBatchDetail(): Promise<PlatformImportBatchDetail> {
  const auth = currentPlatformAuthPayload();
  if (!auth) {
    throw new Error(state.currentLang === "zh" ? "请先填写平台地址、用户名和密码" : "Platform credentials are required");
  }

  if (state.browseRemoteVirtualBatchDetail) {
    return state.browseRemoteVirtualBatchDetail;
  }

  const detail = await invoke<PlatformImportBatchDetail>("get_platform_import_batch_detail", {
    ...auth,
    batchId: PLATFORM_REMOTE_VIRTUAL_BATCH_ID
  });
  state.browseRemoteVirtualBatchDetail = detail;
  state.browseRemoteVirtualBatch = remoteVirtualBatchToBrowseSummary(detail.batch);
  state.browseBatches = mergeBrowseBatches(localBrowseBatches(), state.browseRemoteVirtualBatch);
  return detail;
}

async function loadModelTrialSessionDetail(sessionId: number, silent = false) {
  const auth = currentPlatformAuthPayload();
  if (!auth) {
    return;
  }

  state.modelTrialDetailLoading = true;
  if (!silent) {
    state.modelTrialErrorMessage = null;
    state.modelTrialNoticeMessage = null;
  }
  renderPlatformPanels();
  try {
    const detail = await invoke<TrialSessionDetail>("get_model_trial_session_detail", {
      ...auth,
      sessionId
    });
    state.modelTrialDetail = detail;
    state.modelTrialSelectedSessionId = detail.session.id;
    state.modelTrialSelectedConfigId = detail.session.llmConfigId;
  } catch (error) {
    state.modelTrialErrorMessage = `${t("model_trial_error_detail")}: ${String(error)}`;
    appendLog(state.modelTrialErrorMessage);
  } finally {
    state.modelTrialDetailLoading = false;
    renderPlatformPanels();
  }
}

async function loadModelTrialLocalBatches() {
  try {
    state.modelTrialLocalBatches = await invoke<QaBatchSummary[]>("list_qa_batches");
    if (
      state.modelTrialSelectedBatchId &&
      !state.modelTrialLocalBatches.some((item) => item.id === state.modelTrialSelectedBatchId)
    ) {
      state.modelTrialSelectedBatchId = null;
      state.modelTrialLocalQuestions = [];
      state.modelTrialSelectedQuestionId = null;
      state.modelTrialLocalQuestionDetail = null;
    }
  } catch (error) {
    state.modelTrialErrorMessage = `${t("browse_tab_title")}: ${String(error)}`;
    appendLog(state.modelTrialErrorMessage);
  }
}

async function loadModelTrialLocalQuestions(batchId: string) {
  state.modelTrialLocalQuestionsLoading = true;
  state.modelTrialSelectedBatchId = batchId;
  state.modelTrialSelectedQuestionId = null;
  state.modelTrialLocalQuestionDetail = null;
  renderPlatformPanels();
  try {
    state.modelTrialLocalQuestions = await invoke<QaRecordSummary[]>("list_batch_qa_question_options", {
      batchId
    });
  } catch (error) {
    state.modelTrialLocalQuestions = [];
    state.modelTrialErrorMessage = `${t("model_trial_select_question")}: ${String(error)}`;
    appendLog(state.modelTrialErrorMessage);
  } finally {
    state.modelTrialLocalQuestionsLoading = false;
    renderPlatformPanels();
  }
}

async function loadModelTrialLocalQuestionDetail(batchId: string, qaId: string) {
  try {
    const detail = await invoke<QaRecordDetail>("get_batch_qa_record", {
      batchId,
      qaId
    });
    state.modelTrialLocalQuestionDetail = detail;
    state.modelTrialSelectedQuestionId = qaId;
  } catch (error) {
    state.modelTrialLocalQuestionDetail = null;
    state.modelTrialErrorMessage = `${t("model_trial_source_card")}: ${String(error)}`;
    appendLog(state.modelTrialErrorMessage);
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

  state.modelTrialWorkspaceLoading = true;
  state.platformLoginState = { kind: "loading" };
  state.modelTrialErrorMessage = null;
  if (!showNotice) {
    state.modelTrialNoticeMessage = null;
  }
  renderPlatformPanels();
  try {
    const response = await invoke<TrialWorkspaceResponse>("load_model_trial_workspace", auth);
    state.platformLoginState = {
      kind: "success",
      response: {
        endpoints: response.endpoints,
        user: response.user
      }
    };
    state.platformHealthState = {
      kind: "success",
      response: {
        reachable: true,
        message: "ok",
        endpoints: response.endpoints
      }
    };

    const nextConfigs = response.configs.filter((item) => item.isTrialEnabled && item.hasApiKey);
    const nextSessions = response.sessions;
    state.modelTrialConfigs = nextConfigs;
    state.modelTrialSessions = nextSessions;

    const defaultConfig =
      nextConfigs.find((item) => item.id === state.modelTrialSelectedConfigId) ??
      nextConfigs.find((item) => item.hasApiKey && item.isTrialEnabled) ??
      nextConfigs[0] ??
      null;
    state.modelTrialSelectedConfigId = defaultConfig?.id ?? null;

    const selectedSessionStillExists = nextSessions.some((item) => item.id === state.modelTrialSelectedSessionId);
    state.modelTrialSelectedSessionId = selectedSessionStillExists
      ? state.modelTrialSelectedSessionId
      : nextSessions[0]?.id ?? null;
    if (!state.modelTrialSelectedSessionId) {
      state.modelTrialDetail = null;
    }

    if (showNotice) {
      state.modelTrialNoticeMessage = t("model_trial_notice_refreshed");
    }
  } catch (error) {
    state.platformLoginState = { kind: "error", message: String(error) };
    state.modelTrialErrorMessage = `${t("model_trial_error_load")}: ${String(error)}`;
    appendLog(state.modelTrialErrorMessage);
  } finally {
    state.modelTrialWorkspaceLoading = false;
    renderPlatformPanels();
  }

  if (state.modelTrialSelectedSessionId !== null) {
    await loadModelTrialSessionDetail(state.modelTrialSelectedSessionId, true);
  }
}

async function createModelTrialSession() {
  const auth = currentPlatformAuthPayload();
  if (!auth) {
    state.modelTrialErrorMessage = t("model_trial_settings_required");
    renderPlatformPanels();
    return null;
  }
  if (!state.modelTrialSelectedConfigId) {
    state.modelTrialErrorMessage = t("model_trial_need_model");
    renderPlatformPanels();
    return null;
  }

  state.modelTrialCreating = true;
  state.modelTrialErrorMessage = null;
  state.modelTrialNoticeMessage = null;
  renderPlatformPanels();
  try {
    const response = await invoke<TrialSessionCreateResponse>("create_model_trial_session", {
      ...auth,
      llmConfigId: state.modelTrialSelectedConfigId,
      sourceQaItemId: null,
      sourceAnswerId: null,
      title: state.modelTrialLocalQuestionDetail?.item.question ?? currentModelTrialSelectedQuestion()?.question ?? null
    });
    state.modelTrialSelectedSessionId = response.sessionId;
    await loadModelTrialWorkspace(false);
    await loadModelTrialSessionDetail(response.sessionId, true);
    state.modelTrialNoticeMessage = t("model_trial_notice_created");
    return response.sessionId;
  } catch (error) {
    state.modelTrialErrorMessage = `${t("model_trial_error_create")}: ${String(error)}`;
    appendLog(state.modelTrialErrorMessage);
    renderPlatformPanels();
    return null;
  } finally {
    state.modelTrialCreating = false;
    renderPlatformPanels();
  }
}

async function sendModelTrialMessage() {
  const auth = currentPlatformAuthPayload();
  if (!auth) {
    state.modelTrialErrorMessage = t("model_trial_settings_required");
    renderPlatformPanels();
    return;
  }
  const content = state.modelTrialComposer.trim();
  if (!content) {
    state.modelTrialErrorMessage = t("model_trial_need_message");
    renderPlatformPanels();
    return;
  }
  if (!state.modelTrialSelectedConfigId) {
    state.modelTrialErrorMessage = t("model_trial_need_model");
    renderPlatformPanels();
    return;
  }

  state.modelTrialSending = true;
  state.modelTrialErrorMessage = null;
  state.modelTrialNoticeMessage = null;
  renderPlatformPanels();
  try {
    const sessionId = state.modelTrialSelectedSessionId ?? (await createModelTrialSession());
    if (!sessionId) {
      return;
    }
    await invoke<TrialSendMessageResponse>("send_model_trial_message", {
      ...auth,
      sessionId,
      content
    });
    state.modelTrialComposer = "";
    await loadModelTrialWorkspace(false);
    await loadModelTrialSessionDetail(sessionId, true);
  } catch (error) {
    state.modelTrialErrorMessage = `${t("model_trial_error_send")}: ${String(error)}`;
    appendLog(state.modelTrialErrorMessage);
  } finally {
    state.modelTrialSending = false;
    renderPlatformPanels();
  }
}

async function deleteModelTrialSession(sessionId: number) {
  const auth = currentPlatformAuthPayload();
  if (!auth) {
    state.modelTrialErrorMessage = t("model_trial_settings_required");
    renderPlatformPanels();
    return;
  }
  if (!window.confirm(`${t("model_trial_delete")} #${sessionId}?`)) {
    return;
  }

  state.modelTrialDeletingSessionId = sessionId;
  state.modelTrialErrorMessage = null;
  state.modelTrialNoticeMessage = null;
  renderPlatformPanels();
  try {
    await invoke("delete_model_trial_session", {
      ...auth,
      sessionId
    });
    if (state.modelTrialSelectedSessionId === sessionId) {
      state.modelTrialSelectedSessionId = null;
      state.modelTrialDetail = null;
    }
    await loadModelTrialWorkspace(false);
    state.modelTrialNoticeMessage = t("model_trial_notice_deleted");
  } catch (error) {
    state.modelTrialErrorMessage = `${t("model_trial_error_delete")}: ${String(error)}`;
    appendLog(state.modelTrialErrorMessage);
  } finally {
    state.modelTrialDeletingSessionId = null;
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
    const batch = state.browseBatches.find((item) => item.id === batchId) ?? null;
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

    state.managedResumeBatchId = batchId;
    state.managedResumeBatchLabel = batch?.topicName || batch?.name || batchId;
    applyRequest(mergedRequest);
    syncManagedRunModeUi();
    setCurrentTab("topic");
    void persistCurrentConfig(true);
    appendLog(t("log_loaded_batch_task"));
  } catch (error) {
    const batch = state.browseBatches.find((item) => item.id === batchId) ?? null;
    window.alert(`${batch ? browseResumeActionLabel(batch) : t("browse_action_continue")}: ${String(error)}`);
  }
}

async function loadBrowseBatches() {
  if (state.browseLoading) {
    return;
  }

  state.browseLoading = true;
  try {
    state.browseErrorMessage = null;
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
            state.currentLang === "zh" ? "远程任务同步失败" : "Remote browse sync failed"
          }: ${String(error)}`
        );
      }
    } else {
      clearBrowseRemoteVirtualBatch();
    }
    state.browseBatches = mergeBrowseBatches(localBatches, remoteBatch);
    syncBrowsePlatformStatusCacheToCurrentBatches();
    if (!state.browseBatches.length) {
      state.browseView = "batches";
      state.browseSelectedBatchId = null;
      state.browsePageData = null;
      state.browseDetailData = null;
      state.browseReviewItems = [];
      state.browseReviewDrafts = new Map();
      state.browseQuestionsLoading = false;
      state.browseDetailLoading = false;
      state.browseReviewLoading = false;
      clearBrowsePlatformStatuses();
    } else if (!state.browseSelectedBatchId || !state.browseBatches.some((batch) => batch.id === state.browseSelectedBatchId)) {
      state.browseView = "batches";
      state.browseSelectedBatchId = null;
      state.browsePageData = null;
      state.browseDetailData = null;
      state.browseReviewItems = [];
      state.browseReviewDrafts = new Map();
      state.browseQuestionsLoading = false;
      state.browseDetailLoading = false;
      state.browseReviewLoading = false;
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
    state.browseView = "batches";
    state.browseBatches = [];
    clearBrowseRemoteVirtualBatch();
    clearBrowsePlatformStatuses();
    state.browseSelectedBatchId = null;
    state.browsePageData = null;
    state.browseDetailData = null;
    state.browseReviewItems = [];
    state.browseReviewDrafts = new Map();
    state.browseQuestionsLoading = false;
    state.browseDetailLoading = false;
    state.browseReviewLoading = false;
    state.browseErrorMessage = `Browse QA failed: ${String(error)}`;
    appendLog(`Browse QA failed: ${String(error)}`);
  } finally {
    state.browseLoading = false;
    renderManagedRunPicker();
    renderBrowseView();
  }
}

async function loadBrowseQaPage(batchId: string, page: number) {
  state.browseSelectedBatchId = batchId;
  state.browseView = "questions";
  state.browseQuestionsLoading = true;
  state.browseDetailLoading = false;
  state.browseReviewLoading = false;
  state.browsePageData = null;
  state.browseDetailData = null;
  state.browseReviewItems = [];
  state.browseReviewDrafts = new Map();
  state.browseErrorMessage = null;
  renderBrowseView();

  try {
    if (isRemoteVirtualBrowseBatch(batchId)) {
      const detail = await ensureRemoteVirtualBrowseBatchDetail();
      state.browsePageData = remoteVirtualBrowsePageFromDetail(detail, page, 10);
    } else {
      state.browsePageData = await invoke<QaRecordPage>("list_batch_qa_records", {
        batchId,
        page,
        pageSize: 10
      });
    }
  } catch (error) {
    state.browsePageData = null;
    state.browseDetailData = null;
    state.browseErrorMessage = `Load QA list failed: ${String(error)}`;
    appendLog(`Browse QA page failed: ${String(error)}`);
  } finally {
    state.browseQuestionsLoading = false;
    renderBrowseView();
  }
}

async function loadBrowseDetail(batchId: string, qaId: string) {
  state.browseDetailLoading = true;
  state.browseView = "detail";
  state.browseErrorMessage = null;
  renderBrowseView();

  try {
    if (isRemoteVirtualBrowseBatch(batchId)) {
      const detail = await ensureRemoteVirtualBrowseBatchDetail();
      const item = detail.items.find((entry) => String(entry.id) === qaId);
      if (!item) {
        throw new Error(`QA record not found: ${qaId}`);
      }
      const batch = remoteVirtualBatchToBrowseSummary(detail.batch);
      state.browseDetailData = platformImportItemToQaRecordDetail(item, batch);
      state.browsePageData = remoteVirtualBrowsePageFromDetail(detail, state.browsePageData?.page ?? 1, 10);
    } else {
      state.browseDetailData = await invoke<QaRecordDetail>("get_batch_qa_record", {
        batchId,
        qaId
      });
    }
  } catch (error) {
    state.browseDetailData = null;
    state.browseErrorMessage = `Load QA detail failed: ${String(error)}`;
    appendLog(`Browse QA detail failed: ${String(error)}`);
  } finally {
    state.browseDetailLoading = false;
    renderBrowseView();
  }
}

async function loadBrowseReview(batchId: string) {
  if (isRemoteVirtualBrowseBatch(batchId)) {
    return;
  }

  state.browseSelectedBatchId = batchId;
  state.browseView = "review";
  state.browseReviewLoading = true;
  state.browseDetailData = null;
  state.browseReviewItems = [];
  state.browseReviewIndex = 0;
  state.browseReviewDrafts = new Map();
  state.browseErrorMessage = null;
  renderBrowseView();

  try {
    state.browseReviewItems = await invoke<QaRecordSummary[]>("list_batch_qa_question_options", {
      batchId
    });
    for (const item of state.browseReviewItems) {
      state.browseReviewDrafts.set(item.id, item.effectiveQuestion);
    }
  } catch (error) {
    state.browseReviewItems = [];
    state.browseErrorMessage = `Load QA review failed: ${String(error)}`;
    appendLog(`Browse QA review failed: ${String(error)}`);
  } finally {
    state.browseReviewLoading = false;
    renderBrowseView();
  }
}

async function saveBrowseReview(
  batchId: string,
  qaId: string,
  nextStatus?: ReviewStatus
) {
  if (state.browseReviewSaving) {
    return;
  }

  const item = state.browseReviewItems.find((entry) => entry.id === qaId);
  if (!item) {
    return;
  }

  state.browseReviewSaving = true;
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
    state.browseErrorMessage = null;
  } catch (error) {
    const message = `${t("browse_review_save_failed")}: ${String(error)}`;
    appendLog(message);
    window.alert(message);
  } finally {
    state.browseReviewSaving = false;
    renderBrowseView();
  }
}

function currentRunResponse(): PipelineResponse | null {
  return state.outputState.kind === "run_success" ? state.outputState.response : null;
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

  switch (state.outputState.kind) {
    case "idle":
      resultMode.textContent = t("output_mode_idle");
      renderEmptyCard(resultCards,t("no_preview"));
      renderActionButtons(resultActions,[]);
      output.textContent = t("no_preview");
      outputDetails.hidden = true;
      outputDetails.open = false;
      return;
    case "preview_loading":
      resultMode.textContent = t("output_mode_preview");
      renderEmptyCard(resultCards,t("preview_generating"));
      renderActionButtons(resultActions,[]);
      output.textContent = t("preview_generating");
      outputDetails.hidden = false;
      outputDetails.open = false;
      return;
    case "run_loading":
      resultMode.textContent = t("output_mode_run");
      renderEmptyCard(resultCards,t("running_pipeline"));
      renderActionButtons(resultActions,[]);
      output.textContent = t("running_pipeline");
      outputDetails.hidden = false;
      outputDetails.open = false;
      return;
    case "preview_success":
      resultMode.textContent = t("output_mode_preview");
      renderCards(resultCards,[
        { labelKey: "summary_topic_name", value: state.outputState.preview.topic_name },
        { labelKey: "summary_target_count", value: formatCount(state.outputState.preview.target_count) },
        { labelKey: "summary_keyword_count", value: formatCount(state.outputState.preview.keywords.length) },
        { labelKey: "summary_subtopic_count", value: formatCount(state.outputState.preview.subtopics.length) },
        { labelKey: "summary_axis_count", value: formatCount(state.outputState.preview.question_axes.length) },
        { labelKey: "summary_goal", value: state.outputState.preview.goal, wide: true },
        { labelKey: "summary_keywords", value: state.outputState.preview.keywords.join(", "), wide: true }
      ]);
      renderActionButtons(resultActions,[]);
      output.textContent = JSON.stringify(state.outputState.preview, null, 2);
      outputDetails.hidden = false;
      outputDetails.open = false;
      return;
    case "run_success":
      resultMode.textContent = t("output_mode_run");
      renderCards(resultCards,[
        { labelKey: "summary_provider", value: state.outputState.response.generatedSummary.provider },
        { labelKey: "summary_model", value: state.outputState.response.generatedSummary.model },
        {
          labelKey: "summary_generated_count",
          value: formatCount(state.outputState.response.generatedSummary.generatedCount)
        },
        { labelKey: "summary_kept_count", value: formatCount(state.outputState.response.keptCount) },
        {
          labelKey: "summary_shards",
          value: `${formatCount(state.outputState.response.generatedSummary.completedShards)} / ${formatCount(state.outputState.response.generatedSummary.shardCount)} · ${t("skipped")} ${formatCount(state.outputState.response.generatedSummary.skippedShards)}`
        },
        {
          labelKey: "summary_request_count",
          value: formatCount(state.outputState.response.generatedSummary.requestCount)
        },
        { labelKey: "summary_dataset_path", value: state.outputState.response.datasetPath, wide: true },
        { labelKey: "summary_output_dir", value: state.outputState.response.outputDir, wide: true }
      ]);
      renderActionButtons(resultActions,[
        { key: "action_open_dataset", action: "open-dataset" },
        { key: "action_open_pack_summary", action: "open-pack-summary" },
        { key: "action_copy_dataset_path", action: "copy-dataset-path" }
      ]);
      output.textContent = JSON.stringify(state.outputState.response, null, 2);
      outputDetails.hidden = false;
      outputDetails.open = false;
      return;
    case "cancelled":
      resultMode.textContent = t("output_mode_cancelled");
      renderEmptyCard(resultCards,state.outputState.message);
      renderActionButtons(resultActions,[]);
      output.textContent = state.outputState.message;
      outputDetails.hidden = false;
      outputDetails.open = false;
      return;
    case "validation_error":
      resultMode.textContent = t("output_mode_validation");
      renderValidationIssues(resultCards,state.outputState.issues);
      renderActionButtons(resultActions,[]);
      output.textContent = [t("validation_failed"), ...state.outputState.issues.map((issue) => `- ${t(issue)}`)].join("\n");
      outputDetails.hidden = false;
      outputDetails.open = true;
      return;
    case "error":
      resultMode.textContent = t("output_mode_error");
      renderEmptyCard(resultCards,`${failureTitle(state.outputState.phase)}: ${state.outputState.message}`);
      renderActionButtons(resultActions,[]);
      output.textContent = `${failureTitle(state.outputState.phase)}: ${state.outputState.message}`;
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
  document.documentElement.lang = state.currentLang;
  langSelect.value = state.currentLang;
  topbarTabSelect.value = state.currentTab;
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
    state.currentLang === "zh" ? `当前版本：v${state.appVersion}` : `Current version: v${state.appVersion}`
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
  customModelInput.placeholder = state.currentLang === "zh" ? "例如 glm-5.1" : "For example: glm-5.1";
  syncModelOptions(providerPresetInput.value as ProviderPresetId);
  setText("browse-questions-title", t("browse_questions_title"));
  setText("browse-detail-title", t("browse_detail_title"));
  updateRunButtonUi();
  addTopicTagButton.textContent = t("add_tag");
  topicTagInput.placeholder = t("custom_tag_placeholder");
  setText("qa-platform-dev-label", t("qa_platform_dev"));
  setText("qa-platform-prod-label", t("qa_platform_prod"));
  platformLoginButton.textContent = t("platform_action_login");
  qaPlatformUsernameInput.placeholder = state.currentLang === "zh" ? "你的平台账号" : "your account";
  literatureApiUrlInput.placeholder = "https://example.com/literature/api";
  updateApiKeyVisibilityUi();
  appVersionBadge.textContent = `v${state.appVersion}`;
  renderPlatformPanels();
  const logPlaceholderKey = findMatchingTranslationKey(logs.textContent, [
    "no_run",
    "waiting_events"
  ]);
  if (logPlaceholderKey) {
    logs.textContent = t(logPlaceholderKey);
  }
  updateRuntimeConstraintHint();
  setStatus(state.currentStatus, state.currentStatus !== "idle");
  renderProgressSnapshot(state.lastPipelineProgressEvent);
  setCurrentTab(state.currentTab);
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
  if (isPipelineBusyStatus(state.currentStatus)) {
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
  managedRunBanner.hidden = !state.managedResumeBatchId;
  managedRunModeCurrent.textContent = state.managedResumeBatchId
    ? formatMessage("managed_run_mode_exact_hint", state.managedResumeBatchLabel ?? state.managedResumeBatchId)
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
  managedRunPickInput.value = state.managedResumeBatchId ?? "";
  managedRunPickInput.disabled =
    state.currentStatus === "running" || state.currentStatus === "stopping" || localBatches.length === 0;
}

function clearManagedResumeBatch(logChange = false) {
  state.managedResumeBatchId = null;
  state.managedResumeBatchLabel = null;
  managedRunModeNewInput.checked = true;
  managedRunModeResumeLatestInput.checked = false;
  syncManagedRunModeUi();
  syncRuntimeParameterControlStates();
  if (logChange) {
    appendLog(t("log_cleared_batch_task"));
  }
}

export function normalizeRuntimeParameterInputs(commit = false) {
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
  const content = SETTING_HELP_CONTENT[state.currentLang][helpKey];
  if (!content) {
    return;
  }

  await message(content.body, {
    title: content.title,
    kind: "info"
  });
}

function isPipelineBusyStatus(statusValue: typeof state.currentStatus): boolean {
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
  runButton.dataset.intent = state.currentStatus === "running" || state.currentStatus === "stopping" ? "stop" : "run";
  if (state.currentStatus === "running") {
    runButton.textContent = t("stop_run");
  } else if (state.currentStatus === "stopping") {
    runButton.textContent = t("stop_requested");
  } else if (shouldShowContinueRunButton()) {
    runButton.textContent = t("continue_run");
  } else {
    runButton.textContent = t("run_pipeline");
  }

  runButton.disabled =
    state.currentStatus === "previewing" ||
    state.currentStatus === "updating" ||
    state.currentStatus === "stopping" ||
    (state.currentStatus !== "running" && !isRunReady());
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
  state.browsePlatformStatusRequestId += 1;
  state.browsePlatformStatusLoading = false;
  state.browsePlatformStatusMap = new Map();
}

function syncBrowsePlatformStatusCacheToCurrentBatches() {
  const validIds = new Set(localBrowseBatches().map((batch) => batch.id));
  state.browsePlatformStatusMap = new Map(
    [...state.browsePlatformStatusMap.entries()].filter(([batchId]) => validIds.has(batchId))
  );
}

async function syncBrowseBatchPlatformStatuses(
  batchIds: string[] = state.browseBatches.map((batch) => batch.id),
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

  const requestId = ++state.browsePlatformStatusRequestId;
  state.browsePlatformStatusLoading = true;
  if (!silent) {
    renderBrowseView();
  }

  try {
    const response = await invoke<QaBatchPlatformStatusResponse>("get_qa_batch_platform_statuses", {
      ...auth,
      batchIds: normalizedBatchIds
    });
    if (requestId !== state.browsePlatformStatusRequestId) {
      return;
    }

    const nextMap = new Map(state.browsePlatformStatusMap);
    for (const item of response.items) {
      nextMap.set(item.externalBatchId, item);
    }
    state.browsePlatformStatusMap = nextMap;
    syncBrowsePlatformStatusCacheToCurrentBatches();
    state.platformHealthState = {
      kind: "success",
      response: {
        reachable: true,
        message: "ok",
        endpoints: response.endpoints
      }
    };
  } catch (error) {
    if (requestId !== state.browsePlatformStatusRequestId) {
      return;
    }
    if (!silent) {
      appendLog(`${t("browse_platform_status_sync_failed")}: ${String(error)}`);
    }
  } finally {
    if (requestId === state.browsePlatformStatusRequestId) {
      state.browsePlatformStatusLoading = false;
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

  return state.currentLang === "zh"
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

  return state.currentLang === "zh"
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
    state.lastPipelineProgressEvent === null
      ? payload
      : {
          ...state.lastPipelineProgressEvent,
          ...payload,
          runtimeKind: payload.runtimeKind ?? state.lastPipelineProgressEvent.runtimeKind ?? null,
          retryAttempt: payload.retryAttempt ?? state.lastPipelineProgressEvent.retryAttempt ?? null,
          retryLimit: payload.retryLimit ?? state.lastPipelineProgressEvent.retryLimit ?? null,
          attemptNumber: payload.attemptNumber ?? state.lastPipelineProgressEvent.attemptNumber ?? null,
          attemptLimit: payload.attemptLimit ?? state.lastPipelineProgressEvent.attemptLimit ?? null,
          errorMessage: payload.errorMessage ?? state.lastPipelineProgressEvent.errorMessage ?? null,
          shardIndex: payload.shardIndex ?? state.lastPipelineProgressEvent.shardIndex ?? null,
          shardCount: payload.shardCount ?? state.lastPipelineProgressEvent.shardCount ?? null,
          shardItemCompleted:
            payload.shardItemCompleted ?? state.lastPipelineProgressEvent.shardItemCompleted ?? null,
          shardItemTotal: payload.shardItemTotal ?? state.lastPipelineProgressEvent.shardItemTotal ?? null,
          totalGenerated: payload.totalGenerated ?? state.lastPipelineProgressEvent.totalGenerated ?? null,
          targetCount: payload.targetCount ?? state.lastPipelineProgressEvent.targetCount ?? null,
          batchIndex: payload.batchIndex ?? state.lastPipelineProgressEvent.batchIndex ?? null,
          batchCountInShard:
            payload.batchCountInShard ?? state.lastPipelineProgressEvent.batchCountInShard ?? null,
          batchSize: payload.batchSize ?? state.lastPipelineProgressEvent.batchSize ?? null,
          durationMs: payload.durationMs ?? state.lastPipelineProgressEvent.durationMs ?? null,
          backoffSecs: payload.backoffSecs ?? state.lastPipelineProgressEvent.backoffSecs ?? null,
          subtopic: payload.subtopic ?? state.lastPipelineProgressEvent.subtopic ?? null,
          axis: payload.axis ?? state.lastPipelineProgressEvent.axis ?? null,
          questionType: payload.questionType ?? state.lastPipelineProgressEvent.questionType ?? null,
          difficulty: payload.difficulty ?? state.lastPipelineProgressEvent.difficulty ?? null,
          audience: payload.audience ?? state.lastPipelineProgressEvent.audience ?? null
        };
  state.lastPipelineProgressEvent = mergedPayload;
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
  state.currentStatus = nextStatus;
  status.textContent = t(`status_${nextStatus}`);
  status.dataset.busy = busy ? "true" : "false";
  checkUpdateButton.disabled = busy;
  setControlsLocked(isPipelineBusyStatus(nextStatus));
  updateRunButtonUi();
  updateCheckButtonUi();
}

export function appendLog(line: string) {
  const now = new Date().toLocaleTimeString();
  const next = `[${now}] ${line}`;
  logs.textContent = matchesAnyTranslation(logs.textContent, ["no_run", "waiting_events"])
    ? next
    : `${logs.textContent}\n${next}`;
  logs.scrollTop = logs.scrollHeight;
}

function resetTelemetry() {
  state.lastPipelineProgressEvent = null;
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
    topicTags: [...state.topicTags],
    qaMode: currentQaMode(),
    outputLanguage: state.currentLang,
    cotSectionHeaders: normalizeCotSectionHeaders(cotSectionHeadersInput.value.split(/\r?\n/), state.currentLang),
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
    managedRunBatchId: state.managedResumeBatchId,
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
  state.topicTags = [...request.topicTags];
  qaModeNormalInput.checked = (request.qaMode ?? "normal") !== "cot";
  qaModeCotInput.checked = (request.qaMode ?? "normal") === "cot";
  cotSectionHeadersInput.value = formatCotSectionHeaders(request.cotSectionHeaders, state.currentLang);
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
  state.managedResumeBatchId = request.managedRunMode === "resume-batch" ? request.managedRunBatchId ?? null : null;
  state.managedResumeBatchLabel = null;
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
    state.appUpdateLastError = event.payload.message;
  } else if (event.payload.status === "completed") {
    state.appUpdateLastError = null;
  }
  appendLog(event.payload.message);
  updateCheckButtonUi();
});

void listen<{ step: string; chunkIndex: number; totalChunks: number; status: string; itemCount: number; message: string }>("paper-qa-progress", (event) => {
  const p = event.payload;
  state.paperQaProgressPercent = p.totalChunks > 0 ? Math.round(((p.chunkIndex + (p.step === "qa" ? 1 : 0.5)) / p.totalChunks) * 100) : 0;
  state.paperQaProgressMessage = p.message;
  state.paperQaLogLines.push(p.message);
  if (state.paperQaLogLines.length > 50) state.paperQaLogLines.shift();
  renderPaperQaPanel();
});

void listen<{ message: string }>("paper-qa-log", (event) => {
  state.paperQaLogLines.push(event.payload.message);
  if (state.paperQaLogLines.length > 50) state.paperQaLogLines.shift();
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
    const request = collectRequest();

    // Store password in OS keychain instead of config JSON
    const pw = request.qaPlatformPassword;
    const un = request.qaPlatformUsername;
    const url = request.qaPlatformUrl;
    request.qaPlatformPassword = null;

    await invoke("save_local_pipeline_config", {
      profileName: DEFAULT_PROFILE_NAME,
      request
    });

    // Restore password on the in-memory request object and persist to keychain
    if (pw && un && url) {
      request.qaPlatformPassword = pw;
      void invoke("store_platform_password", {
        platformUrl: url,
        username: un,
        password: pw
      }).catch(() => { /* keychain unavailable — non-blocking */ });
    }

    if (!silent) {
      appendLog(t("log_saved_config"));
    }
  } catch (error) {
    appendLog(`${t("log_save_failed")}: ${String(error)}`);
  }
}

async function restorePlatformPasswordFromKeychain() {
  const url = currentQaPlatformUrl();
  const username = qaPlatformUsernameInput.value.trim();
  if (!url || !username) return;
  try {
    const pw = await invoke<string | null>("load_platform_password", {
      platformUrl: url,
      username,
    });
    if (pw) {
      qaPlatformPasswordInput.value = pw;
    }
  } catch { /* keychain unavailable — ignored */ }
}

function scheduleAutoSave() {
  if (!state.autoSaveEnabled) {
    return;
  }

  if (state.autoSaveTimer !== null) {
    window.clearTimeout(state.autoSaveTimer);
  }

  state.autoSaveTimer = window.setTimeout(() => {
    state.autoSaveTimer = null;
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
  const shouldSyncCotHeaders = isDefaultCotSectionHeaderText(cotSectionHeadersInput.value, state.currentLang);
  state.currentLang = langSelect.value === "zh" ? "zh" : "en";
  window.localStorage.setItem(LANG_STORAGE_KEY, state.currentLang);
  if (shouldSyncCotHeaders) {
    cotSectionHeadersInput.value = formatCotSectionHeaders(defaultCotSectionHeadersForLang(state.currentLang), state.currentLang);
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

  if (state.topicTags.includes(tag)) {
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
    state.topicFieldModalPrimaryId = primaryButton.dataset.fieldPrimary;
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
  for (const tag of state.pendingTopicFieldTags) {
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
    state.managedResumeBatchId = null;
    state.managedResumeBatchLabel = null;
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

  // Detect platform model by looking it up in state.platformGenerateModels
  const modelId = Number(modelInput.value);
  const pm = state.platformGenerateModels.find(m => m.id === modelId);
  if (pm && state.platformLoginState.kind === "success") {
    state.selectedPlatformModelId = modelId;
    batchSizeInput.value = String(pm.batchSize);
    maxInFlightInput.value = String(pm.maxInFlight);
  } else {
    state.selectedPlatformModelId = null;
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
  state.apiKeyVisible = !state.apiKeyVisible;
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
    state.currentLang === "zh"
      ? `当前版本：${response.currentVersion}`
      : `Current version: ${response.currentVersion}`,
    state.currentLang === "zh"
      ? `最新版本：${response.version ?? "unknown"}`
      : `Latest version: ${response.version ?? "unknown"}`
  ];

  if (response.date) {
    lines.push(
      state.currentLang === "zh"
        ? `发布时间：${response.date}`
        : `Release date: ${response.date}`
    );
  }

  if (response.body) {
    const notes = response.body.trim();
    if (notes) {
      lines.push("");
      lines.push(state.currentLang === "zh" ? "更新说明：" : "Release notes:");
      lines.push(notes);
    }
  }

  lines.push("");
  lines.push(state.currentLang === "zh" ? "现在安装这个更新吗？" : "Install this update now?");
  return lines.join("\n");
}

function updateCheckButtonUi() {
  if (state.pendingAppUpdate?.updateAvailable) {
    checkUpdateButton.textContent = state.appUpdateLastError ? t("action_retry_update") : t("action_install_update");
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
    state.pendingAppUpdate?.manualDownloadUrl?.trim() || state.appUpdateManualDownloadUrl?.trim() || "";
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
      state.browseDetailData = null;
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
    if (batchId === state.browseSelectedBatchId && state.browsePageData) {
      state.browseView = "questions";
      renderBrowseView();
      return;
    }

    state.browseDetailData = null;
    void loadBrowseQaPage(batchId, 1);
    return;
  }

  const qaButton = target.closest<HTMLElement>("[data-qa-id]");
  const qaId = qaButton?.dataset.qaId;
  if (qaId) {
    if (!state.browseSelectedBatchId) {
      return;
    }

    if (qaId === state.browseDetailData?.item.id && state.browseView === "detail") {
      return;
    }

    void loadBrowseDetail(state.browseSelectedBatchId, qaId);
    return;
  }

  if (state.browseView === "review" && state.browseSelectedBatchId) {
    const reviewItem = currentBrowseReviewItem();
    if (!reviewItem) {
      return;
    }
    const button = target.closest<HTMLButtonElement>("button");
    if (!button || button.disabled) {
      return;
    }
    if (button.id === "browse-review-save") {
      void saveBrowseReview(state.browseSelectedBatchId, reviewItem.id);
      return;
    }
    if (button.id === "browse-review-keep") {
      void saveBrowseReview(state.browseSelectedBatchId, reviewItem.id, "kept");
      return;
    }
    if (button.id === "browse-review-discard") {
      void saveBrowseReview(state.browseSelectedBatchId, reviewItem.id, "discarded");
      return;
    }
    if (button.id === "browse-review-prev" && state.browseReviewIndex > 0) {
      state.browseReviewIndex -= 1;
      renderBrowseView();
      return;
    }
    if (button.id === "browse-review-next" && state.browseReviewIndex < state.browseReviewItems.length - 1) {
      state.browseReviewIndex += 1;
      renderBrowseView();
      return;
    }
  }

  if (!state.browsePageData || !state.browseSelectedBatchId) {
    return;
  }

  const button = target.closest<HTMLButtonElement>("button");
  if (!button || button.disabled) {
    return;
  }

  if (button.id === "browse-prev-page" && state.browsePageData.page > 1) {
    void loadBrowseQaPage(state.browseSelectedBatchId, state.browsePageData.page - 1);
  }

  if (button.id === "browse-next-page" && state.browsePageData.page < state.browsePageData.totalPages) {
    void loadBrowseQaPage(state.browseSelectedBatchId, state.browsePageData.page + 1);
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
  state.browseReviewDrafts.set(item.id, target.value);
  const saveButton = browseContent.querySelector<HTMLButtonElement>("#browse-review-save");
  if (saveButton) {
    const dirty = target.value.trim() !== item.effectiveQuestion.trim();
    saveButton.disabled = !dirty || state.browseReviewSaving;
    saveButton.classList.toggle("browse-mini-button-muted", !dirty || state.browseReviewSaving);
    saveButton.textContent = t(state.browseReviewSaving ? "browse_review_saving" : "browse_review_save");
  }
});

browseBackButton.addEventListener("click", () => {
  state.browseErrorMessage = null;
  if (state.browseView === "detail") {
    state.browseView = "questions";
  } else if (state.browseView === "review") {
    state.browseView = "batches";
  } else if (state.browseView === "questions") {
    state.browseView = "batches";
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
      state.modelTrialSelectedSessionId = sessionId;
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
    state.modelTrialSelectedConfigId = Number(target.value) || null;
    state.modelTrialNoticeMessage = null;
    state.modelTrialErrorMessage = null;
    renderPlatformPanels();
    return;
  }

  if (target instanceof HTMLSelectElement && target.id === "model-trial-batch-select") {
    const batchId = target.value;
    if (!batchId) {
      state.modelTrialSelectedBatchId = null;
      state.modelTrialLocalQuestions = [];
      state.modelTrialSelectedQuestionId = null;
      state.modelTrialLocalQuestionDetail = null;
      renderPlatformPanels();
      return;
    }
    void loadModelTrialLocalQuestions(batchId);
    return;
  }

  if (target instanceof HTMLSelectElement && target.id === "model-trial-question-select") {
    const qaId = target.value;
    state.modelTrialSelectedQuestionId = qaId || null;
    state.modelTrialLocalQuestionDetail = null;
    if (state.modelTrialSelectedBatchId && qaId) {
      const selectedQuestion = currentModelTrialSelectedQuestion();
      if (selectedQuestion && !state.modelTrialComposer.trim()) {
        state.modelTrialComposer = selectedQuestion.question;
      }
      void loadModelTrialLocalQuestionDetail(state.modelTrialSelectedBatchId, qaId);
      return;
    }
    state.modelTrialNoticeMessage = null;
    state.modelTrialErrorMessage = null;
    renderPlatformPanels();
  }
});

modelTrialPanel.addEventListener("input", (event) => {
  const target = event.target;
  if (target instanceof HTMLTextAreaElement && target.id === "model-trial-composer") {
    state.modelTrialComposer = target.value;
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
    if (state.pendingAppUpdate?.updateAvailable) {
      const shouldInstall = window.confirm(buildUpdatePrompt(state.pendingAppUpdate));
      if (!shouldInstall) {
        appendLog(t("log_update_declined"));
        setStatus("idle", false);
        return;
      }

      state.appUpdateLastError = null;
      updateCheckButtonUi();
      await startInstallPendingUpdate(state.pendingAppUpdate);
      return;
    }

    const response = await invoke<AppUpdateCheckResponse>("check_for_app_update");
    state.appUpdateManualDownloadUrl = response.manualDownloadUrl ?? state.appUpdateManualDownloadUrl;
    if (!response.configured) {
      state.pendingAppUpdate = null;
      state.appUpdateLastError = null;
      appendLog(t("log_update_not_configured"));
      setStatus("idle", false);
      return;
    }

    if (response.sourcePath) {
      appendLog(`${t("log_update_source")}: ${response.sourcePath}`);
    }

    if (!response.updateAvailable) {
      state.pendingAppUpdate = null;
      state.appUpdateLastError = null;
      appendLog(`${t("log_update_not_available")} (${response.currentVersion})`);
      await message(`${t("log_update_not_available")} (${response.currentVersion})`, {
        title: t("action_check_update"),
        kind: "info"
      });
      setStatus("idle", false);
      return;
    }

    state.pendingAppUpdate = response;
    state.appUpdateLastError = null;
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
      state.pendingAppUpdate = null;
    }
    const displayMessage = classifyUpdateErrorMessage(errorText);
    state.appUpdateLastError = displayMessage;
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
  if (state.currentStatus === "running") {
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

  if (state.currentStatus === "stopping" || state.currentStatus === "updating" || state.currentStatus === "previewing") {
    return;
  }

  const request = collectRequest();
  const issues = validateRequest(request);
  if (issues.length > 0) {
    state.outputState = { kind: "validation_error", issues };
    renderOutput();
    appendLog(`${t("log_validation_failed")}: ${issues.map((issue) => t(issue)).join(" ")}`);
    return;
  }

  setStatus("running", true);
  state.outputState = { kind: "run_loading" };
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
    state.outputState = { kind: "run_success", response };
    renderOutput();
    state.browseSelectedBatchId = null;
    void loadBrowseBatches();
    appendLog(formatMessage("log_pipeline_completed", response.datasetPath));
  } catch (error) {
    const message = String(error);
    if (isPipelineCancelledMessage(message)) {
      await armResumeBatchForRequest(request);
      state.outputState = { kind: "cancelled", message: t("pipeline_cancelled") };
      renderOutput();
      appendLog(t("log_pipeline_cancelled"));
    } else {
      await armResumeBatchForRequest(request);
      state.outputState = { kind: "error", phase: "run", message };
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
    state.appVersion = metadata.version;
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
  restoreChatSessions();
  restorePaperQaState();
  await restorePlatformPasswordFromKeychain();
  normalizeRuntimeParameterInputs(true);
  state.autoSaveEnabled = true;
  renderRunStats();
  try { renderPlatformPanels(); } catch (e) { appendLog(`renderPlatformPanels: ${String(e)}`); }
  void loadBrowseBatches();
  // Auto-login if platform credentials are saved
  if (currentQaPlatformUrl() && hasQaPlatformCredentials()) {
    state.platformLoginState = { kind: "loading" };
    try { renderPlatformPanels(); } catch (e) { appendLog(`renderPlatformPanels(auth): ${String(e)}`); }
    try {
      const response = await invoke<PlatformLoginResponse>("login_platform", {
        platformUrl: currentQaPlatformUrl(),
        username: qaPlatformUsernameInput.value.trim(),
        password: qaPlatformPasswordInput.value.trim()
      });
      state.platformLoginState = { kind: "success", response };
      state.platformHealthState = {
        kind: "success",
        response: {
          reachable: true,
          message: "ok",
          endpoints: response.endpoints
        }
      };
    } catch {
      state.platformLoginState = { kind: "idle" };
    }
    try { renderPlatformPanels(); } catch (e) { appendLog(`renderPlatformPanels(auth): ${String(e)}`); }
  }
  // Pre-render all lazy panels so they are populated before the user clicks them
  if (state.chatSessions.length === 0) createChatSession();
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
    state.paperQaSelectedFileId = state.paperQaSelectedFileId === fId ? null : (fId ?? null);
    renderPaperQaPanel();
    return;
  }
});

// Paper QA: Tauri native drag & drop (provides real file paths)
void listen("tauri://drag-drop", (event: { payload: { type: string; paths: string[] } }) => {
  if (event.payload.type !== "drop") return;
  if (state.currentTab !== "paper-qa") return;
  const pdfs = (event.payload.paths ?? []).filter((p: string) => p.toLowerCase().endsWith(".pdf"));
  if (pdfs.length > 0) {
    addPaperFiles(pdfs);
  }
});

// Paper QA: CoT ratio slider
document.querySelector("#paper-qa-cot-ratio")?.addEventListener("input", (event) => {
  const slider = event.target as HTMLInputElement;
  state.paperQaCotRatio = parseFloat(slider.value);
  const valEl = document.querySelector("#paper-qa-cot-ratio-value");
  if (valEl) valEl.textContent = String(state.paperQaCotRatio);
});
