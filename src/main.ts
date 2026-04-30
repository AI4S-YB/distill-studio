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
import {
  renderPaperQaPanel,
  addPaperFiles,
  removePaperFile,
  handlePaperQaConvert,
  handlePaperQaGenerate,
  handlePaperQaSaveBatch,
  persistPaperQaState,
  restorePaperQaState,
} from "./paper-qa";
import {
  getCurrentSession,
  createChatSession,
  switchChatSession,
  deleteChatSession,
  persistChatSessions,
  restoreChatSessions,
  initChatQaDomRefs,
  initChatQaListeners,
  initChatQaEventHandlers,
  renderChatQaPanel,
} from "./chat-qa";
import {
  localBrowseBatches,
  platformBatchQaMode,
  remoteVirtualBatchPrompt,
  remoteVirtualBatchToBrowseSummary,
  mergeBrowseBatches,
  platformImportItemToQaRecordSummary,
  platformImportItemToQaRecordDetail,
  remoteVirtualBrowsePageFromDetail,
  currentBrowseBatch,
  currentBrowseReviewItem,
  currentBrowseReviewDraft,
  moveToNextBrowseReviewItem,
  updateBrowseBatchReviewSummary,
  applyBrowseReviewUpdate,
  clearBrowseRemoteVirtualBatch,
  formatBrowsePageLabel,
  renderBrowseView,
  renderBrowseBatches,
  renderBrowseQaList,
  renderBrowseDetail,
  renderBrowseReview,
  deleteBrowseBatch,
  uploadBrowseBatch,
  resumeBrowseBatch,
  loadRemoteVirtualBrowseBatchSummary,
  ensureRemoteVirtualBrowseBatchDetail,
  loadBrowseBatches,
  loadBrowseQaPage,
  loadBrowseDetail,
  loadBrowseReview,
  saveBrowseReview,
  clearBrowsePlatformStatuses,
  syncBrowsePlatformStatusCacheToCurrentBatches,
  syncBrowseBatchPlatformStatuses,
  initBrowseDomRefs,
  initBrowseEventHandlers,
} from "./browse-qa";
import {
  renderRecentUpdatesPanel,
  loadRecentUpdatesData,
} from "./recent-updates";
import {
  renderPlatformPanels,
  renderQaEvaluatePanel,
  currentPlatformAuthPayload,
  resetPlatformIntegrationState,
  refreshPlatformHealth,
  refreshPlatformLogin,
  loadModelTrialWorkspace,
  loadModelTrialSessionDetail,
  loadModelTrialLocalBatches,
  loadModelTrialLocalQuestions,
  loadModelTrialLocalQuestionDetail,
  createModelTrialSession,
  sendModelTrialMessage,
  deleteModelTrialSession,
  openPlatformArea,
  restorePlatformPasswordFromKeychain,
  currentQaPlatformUrl,
  hasQaPlatformCredentials,
  currentManagedOutputRoot,
  currentModelTrialSelectedQuestion,
} from "./platform";
import {
  currentTopicFieldNode,
  currentQaMode,
  currentManagedRunMode,
  shouldShowContinueRunButton,
  composeEffectivePrompt,
  batchMatchesRequest,
  findLatestResumableBatchForRequest,
  armResumeBatchForRequest,
  clearManagedResumeBatchOnUserEdit,
  applyQaModeDefaults,
  syncStickyOffsets,
  normalizeTopicTag,
  renderTopicFieldModal,
  renderTopicTags,
  togglePendingTopicFieldTag,
  openTopicFieldModal,
  closeTopicFieldModal,
  addTopicTag,
  removeTopicTag,
  resetRunStats,
  beginRunStats,
  stopRunStatsTicker,
  startRunStatsTicker,
  updateRunStatsFromEvent,
  renderRunStats,
  renderSetupSummary,
  syncManagedRunModeUi,
  renderManagedRunPicker,
  normalizeRuntimeParameterInputs,
  clearManagedResumeBatch,
  syncRuntimeParameterInputBounds,
  syncRuntimeParameterControlStates,
  isPipelineBusyStatus,
  runReadinessMissingKeys,
  hasModelSettingsReady,
  isRunReady,
  updateRunButtonUi,
  collectRequest,
  validateRequest,
  applyRequest,
  scheduleAutoSave,
} from "./topic-pipeline";
import {
  renderFeedback2Panel,
  updateCheckButtonUi,
  renderPasswordChangeForm,
  showSettingHelp,
  initSettingsEventHandlers,
} from "./settings";

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
initBrowseDomRefs({
  browseContent: browseContent!,
  browseBackButton: browseBackButton!,
  browseViewTitle: browseViewTitle!,
  browseViewMeta: browseViewMeta!,
});
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
initChatQaDomRefs({
  chatQaPanel: chatQaPanel!,
  chatQaSessionsBar: chatQaSessionsBar!,
  chatQaModelInfo: chatQaModelInfo!,
  chatQaMessages: chatQaMessages!,
  chatQaInput: chatQaInput!,
  chatQaSendButton: chatQaSendButton!,
  chatQaError: chatQaError!,
});
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

function updateApiKeyVisibilityUi() {
  apiKeyInput.type = state.apiKeyVisible ? "text" : "password";
  toggleApiKeyVisibilityButton.textContent = t(state.apiKeyVisible ? "hide_secret" : "show_secret");
}

export function setCurrentTab(tab: UiTab) {
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

export function setText(id: string, value: string) {
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

export function setStatus(nextStatus: "idle" | "previewing" | "running" | "stopping" | "updating", busy = false) {
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
initChatQaListeners();

export async function persistCurrentConfig(silent = true) {
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

initBrowseEventHandlers();

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

initSettingsEventHandlers(feedback2Panel, checkUpdateButton, exportLogsButton);

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

// ---- Chat QA event handlers ----

initChatQaEventHandlers();

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
