import type {
  Lang,
  UiTab,
  OutputState,
  PipelineProgressEvent,
  QaBatchSummary,
  QaRecordPage,
  QaRecordDetail,
  BrowseView,
  PlatformImportBatchStatus,
  PlatformImportBatchDetail,
  QaRecordSummary,
  AppUpdateCheckResponse,
  PlatformHealthResponse,
  PlatformLoginResponse,
  TrialLlmConfigOption,
  TrialSessionSummary,
  TrialSessionDetail,
  RunStatsSnapshot,
} from "./types";
import { LANG_STORAGE_KEY, DEFAULT_MANUAL_UPDATE_URL, RESEARCH_FIELD_TAXONOMY } from "./constants";

declare const __APP_VERSION__: string;

// ---- Inline types (moved from main.ts) ----

export type PlatformNews = {
  id: number;
  title: string;
  content: string;
  isPublished: boolean;
  createdAt: string;
  createdByName: string | null;
};

export type DashboardOverview = {
  todayQas: number;
  weekQas: number;
  todayReviews?: number;
  weekReviews?: number;
  availableModels?: number;
};

export type ChangePasswordResponse = {
  success: boolean;
};

export type ModelChangelogEntry = {
  id: number;
  modelName: string;
  changeType: string;
  description: string;
  createdAt: string;
};

export type PlatformGenerateModel = {
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

export type FeedbackResponse = {
  id: number;
  createdAt: string;
};

export type ExportsStatsDaily = {
  period: string;
  importCount: number;
  reviewCount?: number;
};

export type ExportsStatsWeekly = {
  period: string;
  periodStart: string;
  periodEnd: string;
  importCount: number;
  reviewCount?: number;
};

export type ExportsStatsData = {
  daily: ExportsStatsDaily[];
  weekly: ExportsStatsWeekly[];
};

export type PaperFileStatus = "pending" | "converting" | "converted" | "chunked" | "error";

export type PaperChunk = {
  id: string;
  text: string;
  sectionType: string;
  charCount: number;
};

export type PaperQaItem = {
  id: string;
  qaType: string;
  instruction: string;
  reasoning?: string | null;
  output: string;
  paperTitle: string;
  chunkId: string;
  sectionType: string;
};

export type PaperQaStats = {
  total: number;
  cotCount: number;
  qaCount: number;
  cotRatio: number;
  qaRatio: number;
};

export type PaperQaGenerateResponse = {
  items: PaperQaItem[];
  stats: PaperQaStats;
  warnings?: string[];
};

export type PaperFile = {
  id: string;
  name: string;
  path: string;
  status: PaperFileStatus;
  mdText: string | null;
  chunks: PaperChunk[] | null;
  error: string | null;
};

export type ChatSession = {
  id: string;
  name: string;
  messages: { role: "user" | "assistant"; content: string }[];
  createdAt: number;
};

export type ChatUploadResponse = {
  batch_id: number | null;
  external_batch_id: string;
  existing_batch: boolean | null;
  import_status: string | null;
  parse_queued: boolean | null;
};

// ---- State object ----

const _storedLang = window.localStorage.getItem(LANG_STORAGE_KEY);

export const state = {
  storedLang: _storedLang,
  currentLang: (
    _storedLang === "zh" || _storedLang === "en"
      ? _storedLang
      : navigator.language.toLowerCase().startsWith("zh")
        ? "zh"
        : "en"
  ) as Lang,
  currentTab: "topic" as UiTab,
  currentStatus: "idle" as "idle" | "previewing" | "running" | "stopping" | "updating",
  outputState: { kind: "idle" } as OutputState,
  topicTags: [] as string[],
  topicFieldModalPrimaryId: RESEARCH_FIELD_TAXONOMY[0]?.id ?? null as string | null,
  pendingTopicFieldTags: [] as string[],
  apiKeyVisible: false,
  autoSaveTimer: null as number | null,
  autoSaveEnabled: false,
  lastPipelineProgressEvent: null as PipelineProgressEvent | null,
  browseBatches: [] as QaBatchSummary[],
  browsePageData: null as QaRecordPage | null,
  browseDetailData: null as QaRecordDetail | null,
  browseSelectedBatchId: null as string | null,
  browseLoading: false,
  browseView: "batches" as BrowseView,
  browseQuestionsLoading: false,
  browseDetailLoading: false,
  browseReviewLoading: false,
  browseReviewSaving: false,
  browseErrorMessage: null as string | null,
  browseUploadingBatchId: null as string | null,
  browsePlatformStatusLoading: false,
  browsePlatformStatusRequestId: 0,
  browsePlatformStatusMap: new Map<string, PlatformImportBatchStatus>(),
  browseRemoteVirtualBatch: null as QaBatchSummary | null,
  browseRemoteVirtualBatchDetail: null as PlatformImportBatchDetail | null,
  browseReviewItems: [] as QaRecordSummary[],
  browseReviewIndex: 0,
  browseReviewDrafts: new Map<string, string>(),
  managedResumeBatchId: null as string | null,
  managedResumeBatchLabel: null as string | null,
  appVersion: __APP_VERSION__,
  pendingAppUpdate: null as AppUpdateCheckResponse | null,
  appUpdateLastError: null as string | null,
  appUpdateManualDownloadUrl: DEFAULT_MANUAL_UPDATE_URL as string | null,
  platformHealthState: { kind: "idle" } as
    | { kind: "idle" }
    | { kind: "loading" }
    | { kind: "success"; response: PlatformHealthResponse }
    | { kind: "error"; message: string },
  platformLoginState: { kind: "idle" } as
    | { kind: "idle" }
    | { kind: "loading" }
    | { kind: "success"; response: PlatformLoginResponse }
    | { kind: "error"; message: string },
  modelTrialWorkspaceLoading: false,
  modelTrialDetailLoading: false,
  modelTrialCreating: false,
  modelTrialSending: false,
  modelTrialDeletingSessionId: null as number | null,
  modelTrialConfigs: [] as TrialLlmConfigOption[],
  modelTrialSessions: [] as TrialSessionSummary[],
  modelTrialDetail: null as TrialSessionDetail | null,
  modelTrialSelectedConfigId: null as number | null,
  modelTrialSelectedSessionId: null as number | null,
  modelTrialComposer: "",
  modelTrialErrorMessage: null as string | null,
  modelTrialNoticeMessage: null as string | null,
  modelTrialLocalBatches: [] as QaBatchSummary[],
  modelTrialSelectedBatchId: null as string | null,
  modelTrialLocalQuestions: [] as QaRecordSummary[],
  modelTrialSelectedQuestionId: null as string | null,
  modelTrialLocalQuestionDetail: null as QaRecordDetail | null,
  modelTrialSources: [] as import("./types").TrialSourceItem[],
  modelTrialLocalQuestionsLoading: false,
  runStatsTimer: null as number | null,

  // v0.1.8: Recent updates & feedback
  platformNewsState: { kind: "idle" } as
    | { kind: "idle" }
    | { kind: "loading" }
    | { kind: "success"; items: PlatformNews[] }
    | { kind: "error"; message: string },

  dashboardOverviewState: { kind: "idle" } as
    | { kind: "idle" }
    | { kind: "loading" }
    | { kind: "success"; data: DashboardOverview }
    | { kind: "error"; message: string },

  modelChangelogState: { kind: "idle" } as
    | { kind: "idle" }
    | { kind: "loading" }
    | { kind: "success"; items: ModelChangelogEntry[] }
    | { kind: "error"; message: string },

  exportsStatsState: { kind: "idle" } as
    | { kind: "idle" }
    | { kind: "loading" }
    | { kind: "success"; data: ExportsStatsData }
    | { kind: "error"; message: string },

  platformGenerateModels: [] as PlatformGenerateModel[],
  selectedPlatformModelId: null as number | null,

  // Paper QA state
  paperFiles: [] as PaperFile[],
  paperQaResult: null as PaperQaGenerateResponse | null,
  paperQaCotRatio: 0.4,
  paperQaConverting: false,
  paperQaGenerating: false,
  paperQaUploading: false,
  paperQaErrorMessage: null as string | null,
  paperQaUploadMessage: null as string | null,
  paperQaSelectedFileId: null as string | null,
  paperQaProgressMessage: "",
  paperQaProgressPercent: 0,
  paperQaLogLines: [] as string[],

  feedback2FormState: { kind: "idle" } as
    | { kind: "idle" }
    | { kind: "submitting" }
    | { kind: "success" }
    | { kind: "error"; message: string },

  passwordChangeState: { kind: "idle" } as
    | { kind: "idle" }
    | { kind: "submitting" }
    | { kind: "success" }
    | { kind: "error"; message: string },

  // Chat state
  chatSessions: [] as ChatSession[],
  currentChatSessionId: null as string | null,
  sessionCounter: 0,
  chatSending: false,
  chatError: null as string | null,

  sessionUploadStates: {} as Record<string,
    | { kind: "idle" }
    | { kind: "uploading" }
    | { kind: "success"; batchId: number }
    | { kind: "error"; message: string }
  >,

  recentUpdatesLastRefreshTime: null as number | null,
  recentUpdatesRefreshTimer: null as number | null,
  runStats: {
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
  } as RunStatsSnapshot,
};
