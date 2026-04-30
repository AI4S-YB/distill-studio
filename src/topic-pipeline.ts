import { invoke } from "@tauri-apps/api/core";
import type {
  QaBatchSummary,
  PipelineFormRequest,
  PipelineProgressEvent,
  PipelineResponse,
  ResearchFieldNode,
  OutputState,
  ValidationIssueKey,
  ProviderPresetId,
  ProviderPresetConfigKey,
  ManagedOutputRootResponse,
} from "./types";
import {
  RESEARCH_FIELD_TAXONOMY,
  DEFAULT_COT_TARGET_COUNT,
  DEFAULT_COT_SHARD_SIZE,
  DEFAULT_COT_BATCH_SIZE,
  DEFAULT_COT_MAX_IN_FLIGHT,
  MANAGED_OUTPUT_DIR,
  DEFAULT_PROFILE_NAME,
  CUSTOM_MODEL_VALUE,
} from "./constants";
import { state } from "./state";
import { t, topicTagLabel, formatCountTemplate } from "./translations";
import {
  escapeHtml,
  formatCount,
  formatDuration,
  formatRate,
  currentPresetLabel,
  currentModelValue,
} from "./utils";
import {
  resolveLLMProvider,
  currentPlatformGenerateModel,
  detectProviderPreset,
  syncProviderFieldVisibility,
  syncModelOptions,
} from "./provider";
import { formatCotSectionHeaders, defaultCotSectionHeadersForLang, normalizeCotSectionHeaders } from "./constants";

// ---- Topic field / research field taxonomy ----

export function currentTopicFieldNode(): ResearchFieldNode | null {
  if (!state.topicFieldModalPrimaryId) {
    return RESEARCH_FIELD_TAXONOMY[0] ?? null;
  }

  return RESEARCH_FIELD_TAXONOMY.find((node) => node.id === state.topicFieldModalPrimaryId) ?? RESEARCH_FIELD_TAXONOMY[0] ?? null;
}

// ---- QA mode ----

export function currentQaMode(): "normal" | "cot" {
  const cotInput = document.querySelector<HTMLInputElement>("#qa-mode-cot");
  return cotInput?.checked ? "cot" : "normal";
}

export function currentManagedRunMode(): "new" | "resume-latest" {
  if (state.managedResumeBatchId) {
    return "resume-batch";
  }
  return "new";
}

export function shouldShowContinueRunButton(): boolean {
  return state.managedResumeBatchId !== null;
}

// ---- Batch matching / resume ----

export function composeEffectivePrompt(prompt: string, tags: string[]): string {
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

export function batchMatchesRequest(batch: QaBatchSummary, request: PipelineFormRequest): boolean {
  return (
    batch.status !== "completed" &&
    batch.prompt.trim() === composeEffectivePrompt(request.prompt, request.topicTags).trim() &&
    (batch.qaMode ?? "normal") === request.qaMode &&
    (batch.provider ?? "") === request.provider &&
    (batch.model ?? "") === request.model
  );
}

export function findLatestResumableBatchForRequest(request: PipelineFormRequest): QaBatchSummary | null {
  return (
    state.browseBatches.find((batch) => batchMatchesRequest(batch, request)) ??
    null
  );
}

export async function armResumeBatchForRequest(request: PipelineFormRequest) {
  const { loadBrowseBatches } = await import("./browse-qa");
  await loadBrowseBatches();
  const batch = findLatestResumableBatchForRequest(request);
  state.managedResumeBatchId = batch?.id ?? null;
  state.managedResumeBatchLabel = batch ? batch.topicName || batch.name || batch.id : null;
  syncManagedRunModeUi();
  updateRunButtonUi();
}

export function clearManagedResumeBatchOnUserEdit() {
  if (!state.managedResumeBatchId || isPipelineBusyStatus(state.currentStatus)) {
    return;
  }
  clearManagedResumeBatch(false);
  updateRunButtonUi();
}

export function applyQaModeDefaults(qaMode: "normal" | "cot") {
  if (qaMode !== "cot") {
    return;
  }

  const cotHeadersInput = document.querySelector<HTMLTextAreaElement>("#cot-section-headers");
  const targetCount = document.querySelector<HTMLInputElement>("#target-count");
  const shardSize = document.querySelector<HTMLInputElement>("#shard-size");
  const batchSize = document.querySelector<HTMLInputElement>("#batch-size");
  const maxInFlight = document.querySelector<HTMLInputElement>("#max-in-flight");

  if (cotHeadersInput) {
    cotHeadersInput.value = formatCotSectionHeaders(defaultCotSectionHeadersForLang(state.currentLang), state.currentLang);
  }
  if (targetCount) targetCount.value = String(DEFAULT_COT_TARGET_COUNT);
  if (shardSize) shardSize.value = String(DEFAULT_COT_SHARD_SIZE);
  if (batchSize) batchSize.value = String(DEFAULT_COT_BATCH_SIZE);
  if (maxInFlight) maxInFlight.value = String(DEFAULT_COT_MAX_IN_FLIGHT);
  normalizeRuntimeParameterInputs(true);
  renderSetupSummary();
}

export function syncStickyOffsets() {
  const topbar = document.querySelector<HTMLElement>(".topbar");
  if (!topbar) return;
  const rootStyle = getComputedStyle(document.documentElement);
  const stickyTop = Number.parseFloat(rootStyle.getPropertyValue("--sticky-top")) || 14;
  const appShell = document.querySelector<HTMLElement>(".app-shell");
  const shellGap = appShell ? Number.parseFloat(getComputedStyle(appShell).gap) || 16 : 16;
  const topbarOffset = Math.ceil(stickyTop + topbar.getBoundingClientRect().height + shellGap);
  document.documentElement.style.setProperty("--topbar-offset", `${topbarOffset}px`);
}

export function normalizeTopicTag(tag: string): string {
  return tag.trim().replace(/\s+/g, " ");
}

// ---- Topic field modal ----

export function renderTopicFieldModal() {
  const primaryNode = currentTopicFieldNode();

  const primaryList = document.querySelector<HTMLElement>("#topic-field-primary-list");
  const detailList = document.querySelector<HTMLElement>("#topic-field-detail-list");
  const pendingList = document.querySelector<HTMLElement>("#topic-field-pending-list");
  const selectedCount = document.querySelector<HTMLElement>("#topic-field-selected-count");
  const confirmButton = document.querySelector<HTMLButtonElement>("#confirm-topic-field-selection");

  if (primaryList) {
    primaryList.innerHTML = RESEARCH_FIELD_TAXONOMY.map((node) => {
      const active = node.id === primaryNode?.id;
      return `<button class="field-primary-button${active ? " active" : ""}" type="button" data-field-primary="${escapeHtml(node.id)}">${escapeHtml(topicTagLabel(node.id, "short"))}</button>`;
    }).join("");
  }

  if (detailList) {
    if (!primaryNode?.children?.length) {
      detailList.innerHTML = `<div class="empty-state compact">${escapeHtml(t("topic_field_empty"))}</div>`;
    } else {
      detailList.innerHTML = primaryNode.children
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
  }

  if (pendingList) {
    if (state.pendingTopicFieldTags.length === 0) {
      pendingList.innerHTML = `<p class="empty-inline">${escapeHtml(t("no_tags"))}</p>`;
    } else {
      pendingList.innerHTML = state.pendingTopicFieldTags
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
  }

  if (selectedCount) {
    selectedCount.textContent = formatCountTemplate("topic_field_selected_count", state.pendingTopicFieldTags.length);
  }
  if (confirmButton) {
    confirmButton.disabled = state.pendingTopicFieldTags.length === 0;
  }
}

// ---- Topic tags ----

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

export function renderTopicTags() {
  const selectedTags = document.querySelector<HTMLElement>("#selected-topic-tags");
  const suggestions = document.querySelector<HTMLElement>("#topic-tag-suggestions");
  const modal = document.querySelector<HTMLElement>("#topic-field-modal");

  if (selectedTags) {
    if (state.topicTags.length === 0) {
      selectedTags.innerHTML = `<p class="empty-inline">${escapeHtml(t("no_tags"))}</p>`;
    } else {
      selectedTags.innerHTML = state.topicTags
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
  }

  if (suggestions) {
    suggestions.innerHTML = QUICK_TOPIC_TAG_IDS.map((tag) => {
      const active = state.topicTags.includes(tag);
      return `<button class="tag-chip${active ? " active" : ""}" type="button" data-suggested-tag="${tag}">${escapeHtml(topicTagLabel(tag, "short"))}</button>`;
    }).join("");
  }

  if (modal && !modal.hidden) {
    renderTopicFieldModal();
  }
}

export function togglePendingTopicFieldTag(tag: string) {
  if (state.pendingTopicFieldTags.includes(tag)) {
    state.pendingTopicFieldTags = state.pendingTopicFieldTags.filter((item) => item !== tag);
  } else {
    state.pendingTopicFieldTags = [...state.pendingTopicFieldTags, tag];
  }
  renderTopicFieldModal();
}

export function openTopicFieldModal() {
  if (!state.topicFieldModalPrimaryId) {
    state.topicFieldModalPrimaryId = RESEARCH_FIELD_TAXONOMY[0]?.id ?? null;
  }
  state.pendingTopicFieldTags = [];
  const modal = document.querySelector<HTMLElement>("#topic-field-modal");
  if (modal) modal.hidden = false;
  renderTopicFieldModal();
}

export function closeTopicFieldModal() {
  const modal = document.querySelector<HTMLElement>("#topic-field-modal");
  if (modal) modal.hidden = true;
  state.pendingTopicFieldTags = [];
}

export function addTopicTag(tag: string) {
  const normalized = normalizeTopicTag(tag);
  if (!normalized) return;
  if (!state.topicTags.includes(normalized)) {
    clearManagedResumeBatchOnUserEdit();
    state.topicTags = [...state.topicTags, normalized];
    renderTopicTags();
    renderSetupSummary();
    scheduleAutoSave();
  }
}

export function removeTopicTag(tag: string) {
  clearManagedResumeBatchOnUserEdit();
  state.topicTags = state.topicTags.filter((item) => item !== tag);
  renderTopicTags();
  renderSetupSummary();
  scheduleAutoSave();
}

// ---- Run stats ----

export function resetRunStats() {
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

export function beginRunStats(request: PipelineFormRequest) {
  const startedAtMs = Date.now();
  state.runStats = {
    startedAtMs,
    lastUpdatedAtMs: startedAtMs,
    generatedCount: 0,
    targetCount: request.targetCount,
    shardIndex: null,
    shardCount: request.shardSize > 0 ? Math.ceil(request.targetCount / request.shardSize) : null,
    completedBatchCount: 0,
    estimatedBatchCount: request.batchSize > 0 ? Math.ceil(request.targetCount / request.batchSize) : null,
    completedShardCount: 0,
    skippedShardCount: 0,
    retryCount: 0,
    failedBatchCount: 0,
    samples: [{ atMs: startedAtMs, generatedCount: 0 }]
  };
}

export function stopRunStatsTicker() {
  if (state.runStatsTimer !== null) {
    window.clearInterval(state.runStatsTimer);
    state.runStatsTimer = null;
  }
}

export function startRunStatsTicker() {
  stopRunStatsTicker();
  state.runStatsTimer = window.setInterval(() => {
    renderRunStats();
  }, 1000);
}

export function updateRunStatsFromEvent(payload: PipelineProgressEvent) {
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

export function renderRunStats() {
  const grid = document.querySelector<HTMLElement>("#run-stats-grid");
  if (!grid) return;

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
    remainingCount !== null && currentRatePerMinute !== null && currentRatePerMinute > 0 && remainingCount > 0
      ? (remainingCount / currentRatePerMinute) * 60_000
      : remainingCount === 0 ? 0 : null;

  const generatedProgress =
    totalTarget !== null
      ? `${formatCount(totalGenerated)} / ${formatCount(totalTarget)}`
      : totalGenerated > 0 ? formatCount(totalGenerated) : t("stats_idle");
  const shardCompleted = state.runStats.completedShardCount + state.runStats.skippedShardCount;
  const shardProgress =
    state.runStats.shardCount !== null
      ? `${formatCount(shardCompleted)} / ${formatCount(state.runStats.shardCount)}`
      : state.runStats.shardIndex !== null ? formatCount(state.runStats.shardIndex) : t("stats_idle");

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

  grid.innerHTML = cards
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

// ---- Pipeline form collection / validation / application ----

function readNumber(input: HTMLInputElement): number {
  const parsed = Number.parseInt(input.value, 10);
  return Number.isFinite(parsed) ? parsed : 0;
}

function readOptionalInteger(input: HTMLInputElement): number | null {
  const value = input.value.trim();
  if (!value) return null;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : null;
}

export function normalizeRuntimeParameterInputs(commit = false) {
  const targetCount = document.querySelector<HTMLInputElement>("#target-count");
  const planLimit = document.querySelector<HTMLInputElement>("#plan-limit");
  const shardSize = document.querySelector<HTMLInputElement>("#shard-size");
  const batchSize = document.querySelector<HTMLInputElement>("#batch-size");
  const maxInFlight = document.querySelector<HTMLInputElement>("#max-in-flight");
  const maxRetries = document.querySelector<HTMLInputElement>("#max-retries");
  const timeout = document.querySelector<HTMLInputElement>("#request-timeout-secs");

  if (commit) {
    // Parse and clamp values
    if (targetCount) targetCount.value = String(Math.max(1, readNumber(targetCount)));
    if (planLimit) planLimit.value = String(Math.max(1, readNumber(planLimit)));
    if (shardSize) shardSize.value = String(Math.max(1, readNumber(shardSize)));
    if (batchSize) batchSize.value = String(Math.max(1, readNumber(batchSize)));
    if (maxInFlight) maxInFlight.value = String(Math.max(1, readNumber(maxInFlight)));
    if (maxRetries) maxRetries.value = String(Math.max(0, readNumber(maxRetries)));
    if (timeout) timeout.value = String(Math.max(1, readNumber(timeout)));
  }
}

export function syncRuntimeParameterInputBounds() {
  const targetCount = document.querySelector<HTMLInputElement>("#target-count");
  const planLimit = document.querySelector<HTMLInputElement>("#plan-limit");
  const shardSize = document.querySelector<HTMLInputElement>("#shard-size");
  const batchSize = document.querySelector<HTMLInputElement>("#batch-size");
  const maxInFlight = document.querySelector<HTMLInputElement>("#max-in-flight");
  const maxRetries = document.querySelector<HTMLInputElement>("#max-retries");
  const timeout = document.querySelector<HTMLInputElement>("#request-timeout-secs");

  if (targetCount) { targetCount.min = "1"; targetCount.max = "100000"; }
  if (planLimit) { planLimit.min = "1"; planLimit.max = "100"; }
  if (shardSize) { shardSize.min = "1"; shardSize.max = "10000"; }
  if (batchSize) { batchSize.min = "1"; batchSize.max = "500"; }
  if (maxInFlight) { maxInFlight.min = "1"; maxInFlight.max = "500"; }
  if (maxRetries) { maxRetries.min = "0"; maxRetries.max = "10"; }
  if (timeout) { timeout.min = "1"; timeout.max = "3600"; }
}

export function syncRuntimeParameterControlStates() {
  const isCot = currentQaMode() === "cot";
  const isBusy = isPipelineBusyStatus(state.currentStatus);

  const targetCount = document.querySelector<HTMLInputElement>("#target-count");
  const planLimit = document.querySelector<HTMLInputElement>("#plan-limit");
  const shardSize = document.querySelector<HTMLInputElement>("#shard-size");
  const batchSize = document.querySelector<HTMLInputElement>("#batch-size");
  const maxInFlight = document.querySelector<HTMLInputElement>("#max-in-flight");
  const maxRetries = document.querySelector<HTMLInputElement>("#max-retries");
  const timeout = document.querySelector<HTMLInputElement>("#request-timeout-secs");

  const disabled = isCot || isBusy;
  if (targetCount) targetCount.disabled = disabled;
  if (planLimit) planLimit.disabled = disabled;
  if (shardSize) shardSize.disabled = disabled;
  if (batchSize) batchSize.disabled = disabled;
  if (maxInFlight) maxInFlight.disabled = disabled;
  if (maxRetries) maxRetries.disabled = disabled;
  if (timeout) timeout.disabled = disabled;
}

export function syncManagedRunModeUi() {
  const input = document.querySelector<HTMLInputElement>("#managed-run-mode-resume-latest");
  if (!input) return;

  input.checked = state.managedResumeBatchId !== null;

  const banner = document.querySelector<HTMLElement>("#managed-run-banner");
  const modeCurrent = document.querySelector<HTMLElement>("#managed-run-mode-current");
  const clearButton = document.querySelector<HTMLButtonElement>("#clear-managed-resume-batch");

  if (banner) banner.hidden = !state.managedResumeBatchId;
  if (modeCurrent) {
    modeCurrent.textContent = state.managedResumeBatchId
      ? state.managedResumeBatchLabel ?? state.managedResumeBatchId
      : t("new_run_label");
  }
  if (clearButton) clearButton.disabled = !state.managedResumeBatchId;
}

export function renderManagedRunPicker() {
  const pickInput = document.querySelector<HTMLSelectElement>("#managed-run-pick");
  if (!pickInput) return;

  const incompleteBatches = state.browseBatches.filter((batch) => batch.status !== "completed");
  pickInput.innerHTML = `<option value="">${escapeHtml(t("new_run_label"))}</option>${
    incompleteBatches.map((batch) => `
      <option value="${escapeHtml(batch.id)}" ${batch.id === state.managedResumeBatchId ? "selected" : ""}>
        ${escapeHtml(batch.topicName || batch.name || batch.id)}
      </option>
    `).join("")
  }`;
}

export function clearManagedResumeBatch(logChange = false) {
  state.managedResumeBatchId = null;
  state.managedResumeBatchLabel = null;
  syncManagedRunModeUi();
  if (logChange) {
    // Log function is imported from main.ts lazily
    import("./main").then(({ appendLog }) => {
      appendLog(t("log_cleared_managed_resume"));
    });
  }
}

export function collectRequest(): PipelineFormRequest {
  normalizeRuntimeParameterInputs(true);
  const resolved = resolveLLMProvider();

  const promptInput = document.querySelector<HTMLTextAreaElement>("#prompt");
  const cotSectionHeadersInput = document.querySelector<HTMLTextAreaElement>("#cot-section-headers");
  const targetCount = document.querySelector<HTMLInputElement>("#target-count");
  const planLimit = document.querySelector<HTMLInputElement>("#plan-limit");
  const shardSize = document.querySelector<HTMLInputElement>("#shard-size");
  const batchSize = document.querySelector<HTMLInputElement>("#batch-size");
  const maxInFlight = document.querySelector<HTMLInputElement>("#max-in-flight");
  const maxRetries = document.querySelector<HTMLInputElement>("#max-retries");
  const timeout = document.querySelector<HTMLInputElement>("#request-timeout-secs");
  const resumeInput = document.querySelector<HTMLInputElement>("#resume");
  const providerInput = document.querySelector<HTMLSelectElement>("#provider");
  const baseUrlInput = document.querySelector<HTMLInputElement>("#base-url");
  const apiKeyInput = document.querySelector<HTMLInputElement>("#api-key");
  const outputRootInput = document.querySelector<HTMLInputElement>("#output-root");
  const qaPlatformUsernameInput = document.querySelector<HTMLInputElement>("#qa-platform-username");
  const qaPlatformPasswordInput = document.querySelector<HTMLInputElement>("#qa-platform-password");
  const literatureApiUrlInput = document.querySelector<HTMLInputElement>("#literature-api-url");
  const literatureApiAuthInput = document.querySelector<HTMLInputElement>("#literature-api-auth");

  const request: PipelineFormRequest = {
    prompt: promptInput?.value.trim() ?? "",
    topicTags: [...state.topicTags],
    qaMode: currentQaMode(),
    outputLanguage: state.currentLang,
    cotSectionHeaders: normalizeCotSectionHeaders(cotSectionHeadersInput?.value.split(/\r?\n/) ?? [""], state.currentLang),
    targetCount: targetCount ? readNumber(targetCount) : 1,
    planLimit: planLimit ? readNumber(planLimit) : 5,
    outputDir: MANAGED_OUTPUT_DIR,
    managedOutputRoot: outputRootInput?.value.trim() || null,
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
      : (providerInput?.value === "openai-compatible" ? 2400 : 800),
    shardSize: shardSize ? readNumber(shardSize) : DEFAULT_COT_SHARD_SIZE,
    batchSize: batchSize ? readNumber(batchSize) : DEFAULT_COT_BATCH_SIZE,
    maxInFlight: maxInFlight ? readNumber(maxInFlight) : DEFAULT_COT_MAX_IN_FLIGHT,
    maxRetries: maxRetries ? readNumber(maxRetries) : 0,
    requestTimeoutSecs: timeout ? readNumber(timeout) : 120,
    resume: resumeInput?.checked ?? false,
    managedRunMode: currentManagedRunMode(),
    managedRunBatchId: state.managedResumeBatchId,
    qaPlatformUrl: null,
    qaPlatformUsername: qaPlatformUsernameInput?.value.trim() || null,
    qaPlatformPassword: qaPlatformPasswordInput?.value.trim() || null,
    literatureApiUrl: literatureApiUrlInput?.value.trim() || null,
    literatureApiAuthToken: literatureApiAuthInput?.value.trim() || null,
  };

  return request;
}

export function validateRequest(request: PipelineFormRequest): ValidationIssueKey[] {
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

export function applyRequest(request: PipelineFormRequest) {
  const promptInput = document.querySelector<HTMLTextAreaElement>("#prompt");
  const cotSectionHeadersInput = document.querySelector<HTMLTextAreaElement>("#cot-section-headers");
  const targetCount = document.querySelector<HTMLInputElement>("#target-count");
  const planLimit = document.querySelector<HTMLInputElement>("#plan-limit");
  const outputRootInput = document.querySelector<HTMLInputElement>("#output-root");
  const providerInput = document.querySelector<HTMLSelectElement>("#provider");
  const baseUrlInput = document.querySelector<HTMLInputElement>("#base-url");
  const apiKeyInput = document.querySelector<HTMLInputElement>("#api-key");
  const qaPlatformDevInput = document.querySelector<HTMLInputElement>("#qa-platform-dev");
  const qaPlatformProdInput = document.querySelector<HTMLInputElement>("#qa-platform-prod");
  const qaPlatformUsernameInput = document.querySelector<HTMLInputElement>("#qa-platform-username");
  const qaPlatformPasswordInput = document.querySelector<HTMLInputElement>("#qa-platform-password");
  const literatureApiUrlInput = document.querySelector<HTMLInputElement>("#literature-api-url");
  const literatureApiAuthInput = document.querySelector<HTMLInputElement>("#literature-api-auth");
  const shardSize = document.querySelector<HTMLInputElement>("#shard-size");
  const batchSize = document.querySelector<HTMLInputElement>("#batch-size");
  const maxInFlight = document.querySelector<HTMLInputElement>("#max-in-flight");
  const maxRetries = document.querySelector<HTMLInputElement>("#max-retries");
  const timeout = document.querySelector<HTMLInputElement>("#request-timeout-secs");
  const resumeInput = document.querySelector<HTMLInputElement>("#resume");
  const managedRunModeNewInput = document.querySelector<HTMLInputElement>("#managed-run-mode-new");
  const managedRunModeResumeLatestInput = document.querySelector<HTMLInputElement>("#managed-run-mode-resume-latest");
  const providerPresetInput = document.querySelector<HTMLSelectElement>("#provider-preset");
  const qaModeNormalInput = document.querySelector<HTMLInputElement>("#qa-mode-normal");
  const qaModeCotInput = document.querySelector<HTMLInputElement>("#qa-mode-cot");

  if (promptInput) promptInput.value = request.prompt;
  state.topicTags = [...request.topicTags];
  if (qaModeNormalInput) qaModeNormalInput.checked = (request.qaMode ?? "normal") !== "cot";
  if (qaModeCotInput) qaModeCotInput.checked = (request.qaMode ?? "normal") === "cot";
  if (cotSectionHeadersInput) {
    cotSectionHeadersInput.value = formatCotSectionHeaders(request.cotSectionHeaders, state.currentLang);
  }
  if (targetCount) targetCount.value = String(request.targetCount);
  if (planLimit) planLimit.value = String(request.planLimit);
  if (request.managedOutputRoot?.trim()) {
    if (outputRootInput) outputRootInput.value = request.managedOutputRoot.trim();
  }
  if (providerInput) providerInput.value = request.provider;
  if (baseUrlInput) baseUrlInput.value = request.baseUrl ?? "";
  if (apiKeyInput) apiKeyInput.value = request.apiKey ?? "";
  const savedUrl = request.qaPlatformUrl ?? "";
  if (qaPlatformDevInput) qaPlatformDevInput.checked = savedUrl.includes("127.0.0.1");
  if (qaPlatformProdInput) qaPlatformProdInput.checked = !savedUrl.includes("127.0.0.1");
  if (qaPlatformUsernameInput) qaPlatformUsernameInput.value = request.qaPlatformUsername ?? "";
  if (qaPlatformPasswordInput) qaPlatformPasswordInput.value = request.qaPlatformPassword ?? "";
  if (literatureApiUrlInput) literatureApiUrlInput.value = request.literatureApiUrl ?? "";
  if (literatureApiAuthInput) literatureApiAuthInput.value = request.literatureApiAuthToken ?? "";
  if (shardSize) shardSize.value = String(request.shardSize);
  if (batchSize) batchSize.value = String(request.batchSize);
  if (maxInFlight) maxInFlight.value = String(request.maxInFlight);
  if (maxRetries) maxRetries.value = String(request.maxRetries);
  if (timeout) timeout.value = String(request.requestTimeoutSecs);
  if (resumeInput) resumeInput.checked = request.resume;
  state.managedResumeBatchId = request.managedRunMode === "resume-batch" ? request.managedRunBatchId ?? null : null;
  state.managedResumeBatchLabel = null;
  if (managedRunModeNewInput) managedRunModeNewInput.checked = (request.managedRunMode ?? "new") === "new";
  if (managedRunModeResumeLatestInput) managedRunModeResumeLatestInput.checked = (request.managedRunMode ?? "new") !== "new";
  const presetId = detectProviderPreset({
    provider: request.provider,
    baseUrl: request.baseUrl
  });
  // resetPlatformIntegrationState imported lazily to avoid circular dependency
  import("./platform").then(({ resetPlatformIntegrationState }) => {
    resetPlatformIntegrationState();
  });
  if (providerPresetInput) providerPresetInput.value = presetId;
  syncProviderFieldVisibility(presetId);
  syncModelOptions(presetId, request.model);
  normalizeRuntimeParameterInputs(true);
  syncManagedRunModeUi();
  renderTopicTags();
  renderSetupSummary();
  updateRunButtonUi();
}

// ---- Run button UI ----

export function isPipelineBusyStatus(statusValue: typeof state.currentStatus): boolean {
  return statusValue === "running" || statusValue === "stopping" || statusValue === "previewing" || statusValue === "updating";
}

export function runReadinessMissingKeys(): string[] {
  const missing: string[] = [];
  const resolved = resolveLLMProvider();
  if (!resolved.model) missing.push("settings_checklist_missing_model");
  if (resolved.mode === "settings") {
    if (!resolved.baseUrl) missing.push("settings_checklist_missing_base_url");
    if (!resolved.apiKey) missing.push("settings_checklist_missing_api_key");
  }
  return missing;
}

export function hasModelSettingsReady(): boolean {
  return runReadinessMissingKeys().length === 0;
}

export function isRunReady(): boolean {
  return hasModelSettingsReady() && !isPipelineBusyStatus(state.currentStatus);
}

export function updateRunButtonUi() {
  const runButton = document.querySelector<HTMLButtonElement>("#run");
  if (!runButton) return;

  if (state.currentStatus === "running") {
    runButton.textContent = t("action_stop");
    runButton.className = "danger";
    runButton.disabled = false;
    return;
  }
  if (state.currentStatus === "stopping") {
    runButton.textContent = t("action_stopping");
    runButton.className = "";
    runButton.disabled = true;
    return;
  }

  const canRun = runReadinessMissingKeys().length === 0;
  runButton.textContent = state.managedResumeBatchId ? t("action_continue") : t("action_run");
  runButton.className = "";
  runButton.disabled = !canRun;
}

// ---- Setup summary ----

export function renderSetupSummary() {
  const resolved = resolveLLMProvider();
  const providerReady = resolved.mode !== "none";
  const modelReady = resolved.model.length > 0;
  const requiresEndpointAuth = resolved.mode === "settings";
  const baseUrlReady = !requiresEndpointAuth || resolved.baseUrl.length > 0;
  const apiKeyReady = !requiresEndpointAuth || resolved.apiKey.length > 0;
  const connectionReady = !requiresEndpointAuth || (baseUrlReady && apiKeyReady);
  const providerPresetInput = document.querySelector<HTMLSelectElement>("#provider-preset");
  const providerInput = document.querySelector<HTMLSelectElement>("#provider");
  const modelInput = document.querySelector<HTMLSelectElement>("#model");
  const customModelInput = document.querySelector<HTMLInputElement>("#custom-model");

  const providerLabel = providerReady
    ? (resolved.mode === "platform"
        ? t("preset_platform")
        : providerPresetInput?.value === "custom"
          ? providerInput?.value.trim() || t("empty_value")
          : currentPresetLabel((providerPresetInput?.value ?? "custom") as ProviderPresetId))
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
  updateRunButtonUi();
}

// ---- Auto-save ----

const AUTO_SAVE_DELAY_MS = 1500;

export function scheduleAutoSave() {
  if (!state.autoSaveEnabled) {
    return;
  }
  if (state.autoSaveTimer !== null) {
    window.clearTimeout(state.autoSaveTimer);
  }
  state.autoSaveTimer = window.setTimeout(() => {
    state.autoSaveTimer = null;
    import("./main").then(({ persistCurrentConfig }) => {
      void persistCurrentConfig(true);
    });
  }, AUTO_SAVE_DELAY_MS);
}
