import { state } from "./state";
import { t } from "./translations";
import { CUSTOM_MODEL_VALUE } from "./constants";
import type {
  ProviderPresetId,
  ReviewStatus,
  PlatformBatchStatusKind,
  PlatformImportBatchStatus,
  QaBatchSummary,
  ValidationIssueKey,
} from "./types";

// Replicated from main.ts so moved helpers can reference it.
// main.ts keeps its own copy; the two MUST hold the same value.
const PLATFORM_REMOTE_VIRTUAL_BATCH_SYNTHETIC_ID = "platform:remote-server";

// ---------------------------------------------------------------------------
// Pure formatting / string utilities
// ---------------------------------------------------------------------------

export function escapeHtml(value: string): string {
  if (value == null || typeof value !== "string") return "";
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function formatCount(value: number): string {
  return new Intl.NumberFormat(state.currentLang === "zh" ? "zh-CN" : "en-US").format(value);
}

export function formatDuration(ms: number | null): string {
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

export function formatRate(itemsPerMinute: number | null): string {
  if (itemsPerMinute === null || !Number.isFinite(itemsPerMinute) || itemsPerMinute <= 0) {
    return t("stats_not_available");
  }

  return state.currentLang === "zh"
    ? `${formatCount(Math.round(itemsPerMinute))} 条/分钟`
    : `${formatCount(Math.round(itemsPerMinute))} items/min`;
}

export function displayValue(value: string): string {
  return value.trim() ? value : t("empty_value");
}

export function formatPlatformTime(value: string | null | undefined): string {
  if (!value) {
    return t("empty_value");
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return new Intl.DateTimeFormat(state.currentLang === "zh" ? "zh-CN" : "en-US", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  }).format(date);
}

export function parseTimestampMs(value: string | null | undefined): number | null {
  if (!value) {
    return null;
  }
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : null;
}

export function parsePlatformMetadataJson(value: string | null | undefined): Record<string, unknown> {
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

export function metadataString(metadata: Record<string, unknown>, ...keys: string[]): string {
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

// ---------------------------------------------------------------------------
// Label helpers (pure, rely on `t` / `formatCount`)
// ---------------------------------------------------------------------------

export function currentPresetLabel(presetId: ProviderPresetId): string {
  return t(`preset_${presetId}`);
}

export function qaModeLabel(qaMode: string | null | undefined): string {
  return qaMode === "cot" ? t("qa_mode_cot") : t("qa_mode_normal");
}

export function batchStatusLabel(status: string | null | undefined): string {
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

export function reviewStatusLabel(status: ReviewStatus): string {
  switch (status) {
    case "kept":
      return t("browse_review_status_kept");
    case "discarded":
      return t("browse_review_status_discarded");
    default:
      return t("browse_review_status_unreviewed");
  }
}

export function reviewStatusBadgeClass(status: ReviewStatus): string {
  switch (status) {
    case "kept":
      return "kept";
    case "discarded":
      return "discarded";
    default:
      return "unreviewed";
  }
}

export function browseReviewSummaryLabel(batch: QaBatchSummary): string {
  const total = batch.generatedCount || batch.totalCount;
  return `${t("browse_review_progress")} ${formatCount(batch.reviewedCount)} / ${formatCount(total)} · ${t("browse_review_kept")} ${formatCount(batch.reviewKeptCount)} · ${t("browse_review_discarded")} ${formatCount(batch.discardedCount)}`;
}

export function changeTypeLabel(type: string): string {
  if (type === "added") return state.currentLang === "zh" ? "新增" : "Added";
  if (type === "updated") return state.currentLang === "zh" ? "更新" : "Updated";
  if (type === "deprecated") return state.currentLang === "zh" ? "弃用" : "Deprecated";
  if (type === "status_changed") return state.currentLang === "zh" ? "状态变更" : "Changed";
  return type;
}

export function browseResumeActionLabel(batch: QaBatchSummary): string {
  return batch.status === "prepared"
    ? t("browse_action_load_generate")
    : t("browse_action_continue_run");
}

// ---------------------------------------------------------------------------
// Browse / platform helpers (used by both utils and main)
// ---------------------------------------------------------------------------

export function batchPlatformStatusLabel(status: PlatformBatchStatusKind | null | undefined): string {
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

export function isRemoteVirtualBrowseBatch(batchId: string | null | undefined): boolean {
  return batchId === PLATFORM_REMOTE_VIRTUAL_BATCH_SYNTHETIC_ID;
}

export function currentBrowseBatchPlatformStatus(batchId: string): PlatformImportBatchStatus | null {
  return state.browsePlatformStatusMap.get(batchId) ?? null;
}

export function browseBatchPlatformBadgeHtml(batchId: string): string {
  const status = currentBrowseBatchPlatformStatus(batchId);
  if (!status || status.batchStatus === "missing") {
    return "";
  }
  const label =
    status.batchStatus === "uploaded" ? t("browse_uploaded_badge") : batchPlatformStatusLabel(status.batchStatus);
  return ` <span class="browse-inline-badge">${escapeHtml(label)}</span>`;
}

export function canResumeBrowseBatch(batch: QaBatchSummary): boolean {
  return !isRemoteVirtualBrowseBatch(batch.id) && batch.status !== "completed";
}

// ---------------------------------------------------------------------------
// Model-value helper (needs DOM refs as params)
// ---------------------------------------------------------------------------

export function currentModelValue(
  modelSelect: HTMLSelectElement | null,
  customInput: HTMLInputElement | null,
): string {
  if (!modelSelect || !customInput) return "";
  return modelSelect.value === CUSTOM_MODEL_VALUE ? customInput.value.trim() : modelSelect.value.trim();
}

// ---------------------------------------------------------------------------
// Result-card rendering helpers (need container element as param)
// ---------------------------------------------------------------------------

export function renderEmptyCard(container: HTMLElement | null, message: string): void {
  if (!container) return;
  container.innerHTML = `<div class="empty-state">${escapeHtml(message)}</div>`;
}

export function renderValidationIssues(container: HTMLElement | null, issues: ValidationIssueKey[]): void {
  if (!container) return;
  container.innerHTML = `
    <article class="result-card wide">
      <p class="result-card-label">${escapeHtml(t("validation_issues"))}</p>
      <ul class="validation-list">
        ${issues.map((issue) => `<li class="validation-item">${escapeHtml(t(issue))}</li>`).join("")}
      </ul>
    </article>
  `;
}

export function renderCards(
  container: HTMLElement | null,
  cards: Array<{ labelKey: string; value: string; wide?: boolean }>,
): void {
  if (!container) return;
  container.innerHTML = cards
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

export function renderActionButtons(
  container: HTMLElement | null,
  actions: Array<{ key: string; action: string }>,
): void {
  if (!container) return;
  if (!actions.length) {
    container.innerHTML = "";
    return;
  }

  container.innerHTML = `
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
