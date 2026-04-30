import { invoke } from "@tauri-apps/api/core";
import type {
  QaBatchSummary,
  QaRecordSummary,
  QaRecordDetail,
  QaRecordPage,
  QaRecordReview,
  SaveBatchReviewItemResponse,
  BrowseView,
  ReviewStatus,
  PlatformImportBatchSummary,
  PlatformImportBatchItem,
  PlatformImportBatchDetail,
  QaBatchUploadResponse,
  QaBatchPlatformStatusResponse,
  PlatformBatchStatusKind,
  PipelineFormRequest,
} from "./types";
import { state } from "./state";
import {
  defaultCotSectionHeadersForLang,
  normalizeCotSectionHeaders,
} from "./constants";
import { t } from "./translations";
import {
  escapeHtml,
  escapeRegExp,
  formatCount,
  displayValue,
  formatPlatformTime,
  parseTimestampMs,
  parsePlatformMetadataJson,
  metadataString,
  qaModeLabel,
  batchStatusLabel,
  reviewStatusLabel,
  reviewStatusBadgeClass,
  browseReviewSummaryLabel,
  browseResumeActionLabel,
  batchPlatformStatusLabel,
  isRemoteVirtualBrowseBatch,
  currentBrowseBatchPlatformStatus,
  browseBatchPlatformBadgeHtml,
  canResumeBrowseBatch,
} from "./utils";
import { currentPlatformAuthPayload, renderPlatformPanels } from "./platform";
import { appendLog, setCurrentTab, collectRequest, applyRequest, persistCurrentConfig, syncManagedRunModeUi, renderManagedRunPicker } from "./main";

// ---- Constants (used only by browse QA) ----
const PLATFORM_REMOTE_VIRTUAL_BATCH_ID = -1;
const PLATFORM_REMOTE_VIRTUAL_BATCH_SOURCE = "remote-server";
const PLATFORM_REMOTE_VIRTUAL_BATCH_SYNTHETIC_ID = "platform:remote-server";

// CoT section translation keys
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

// ---- DOM element references (owned by main.ts, assigned at init) ----
export let browseContent: HTMLElement | null;
export let browseBackButton: HTMLButtonElement | null;
export let browseViewTitle: HTMLElement | null;
export let browseViewMeta: HTMLElement | null;

export function initBrowseDomRefs(refs: {
  browseContent: HTMLElement | null;
  browseBackButton: HTMLButtonElement | null;
  browseViewTitle: HTMLElement | null;
  browseViewMeta: HTMLElement | null;
}) {
  browseContent = refs.browseContent;
  browseBackButton = refs.browseBackButton;
  browseViewTitle = refs.browseViewTitle;
  browseViewMeta = refs.browseViewMeta;
}

// ---- Helper / conversion functions ----

export function localBrowseBatches(): QaBatchSummary[] {
  return state.browseBatches.filter((batch) => !isRemoteVirtualBrowseBatch(batch.id));
}

export function platformBatchQaMode(
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

export function remoteVirtualBatchPrompt(summary: PlatformImportBatchSummary): string {
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

export function remoteVirtualBatchToBrowseSummary(summary: PlatformImportBatchSummary): QaBatchSummary {
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

export function mergeBrowseBatches(localBatches: QaBatchSummary[], remoteBatch: QaBatchSummary | null): QaBatchSummary[] {
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

export function platformImportItemToQaRecordSummary(item: PlatformImportBatchItem): QaRecordSummary {
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

export function platformImportItemToQaRecordDetail(
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

export function remoteVirtualBrowsePageFromDetail(
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

// ---- Current state accessors ----

export function currentBrowseBatch(): QaBatchSummary | null {
  return (
    state.browseBatches.find((batch) => batch.id === state.browseSelectedBatchId) ??
    state.browsePageData?.batch ??
    state.browseDetailData?.batch ??
    null
  );
}

export function currentBrowseReviewItem(): QaRecordSummary | null {
  return state.browseReviewItems[state.browseReviewIndex] ?? null;
}

export function currentBrowseReviewDraft(): string {
  const item = currentBrowseReviewItem();
  if (!item) {
    return "";
  }
  return state.browseReviewDrafts.get(item.id) ?? item.effectiveQuestion;
}

export function moveToNextBrowseReviewItem() {
  if (state.browseReviewIndex < state.browseReviewItems.length - 1) {
    state.browseReviewIndex += 1;
  }
}

export function updateBrowseBatchReviewSummary(
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

export function applyBrowseReviewUpdate(
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

export function clearBrowseRemoteVirtualBatch() {
  state.browseRemoteVirtualBatch = null;
  state.browseRemoteVirtualBatchDetail = null;
}

// ---- Formatting helpers ----

export function formatBrowsePageLabel(page: number, totalPages: number): string {
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

// ---- Render functions ----

export function renderBrowseView() {
  if (!browseBackButton || !browseViewTitle || !browseViewMeta || !browseContent) return;

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

export function renderBrowseBatches(): string {
  if (!state.browseBatches.length) {
    return `<div class="empty-state">${escapeHtml(t("browse_batches_empty"))}</div>`;
  }

  const qaPlatformUrl = document.querySelector<HTMLInputElement>("#qa-platform-username") ? true : false;
  const hasUploadUrl = Boolean(qaPlatformUrl);

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

export function renderBrowseQaList(): string {
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

export function renderBrowseDetail(): string {
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
  const cards: Array<{ label: string; value: string; wide?: boolean; multiline?: boolean }> = [
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

  const answerCards: Array<{ label: string; value: string; wide?: boolean; multiline?: boolean }> =
    cotSections.length > 0
      ? cotSections.map(({ label, value }) => ({ label, value, wide: true, multiline: true }))
      : [{ label: t("browse_answer"), value: item.answer, wide: true, multiline: true }];

  return `<div class="browse-detail">${[...cards, ...answerCards]
    .map(
      (c) => `
        <article class="result-card${c.wide ? " wide" : ""}">
          <p class="result-card-label">${escapeHtml(c.label)}</p>
          <p class="result-card-value${c.multiline ? " multiline" : ""}">${escapeHtml(displayValue(c.value))}</p>
        </article>
      `
    )
    .join("")}</div>`;
}

export function renderBrowseReview(): string {
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

// ---- Browse operations ----

export async function deleteBrowseBatch(batchId: string) {
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

export async function uploadBrowseBatch(batchId: string) {
  if (isRemoteVirtualBrowseBatch(batchId)) {
    return;
  }
  if (state.browseUploadingBatchId) {
    return;
  }

  const qaPlatformUsernameInput = document.querySelector<HTMLInputElement>("#qa-platform-username");
  const qaPlatformPasswordInput = document.querySelector<HTMLInputElement>("#qa-platform-password");

  if (!qaPlatformUsernameInput?.value.trim() || !qaPlatformPasswordInput?.value.trim()) {
    window.alert(t("browse_platform_credentials_missing"));
    setCurrentTab("settings");
    qaPlatformUsernameInput?.focus();
    return;
  }

  state.browseUploadingBatchId = batchId;
  renderBrowseView();
  try {
    const qaPlatformUrlInput = document.querySelector<HTMLInputElement>("#qa-platform-dev");
    const host = (qaPlatformUrlInput as HTMLInputElement)?.checked ? "127.0.0.1" : "182.92.166.143";
    const platformUrl = `http://${host}:8100`;

    const response = await invoke<QaBatchUploadResponse>("upload_qa_batch", {
      batchId,
      platformUrl,
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
          normalizedPlatformUrl: platformUrl,
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

export async function resumeBrowseBatch(batchId: string) {
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

// ---- Load functions ----

export async function loadRemoteVirtualBrowseBatchSummary(): Promise<QaBatchSummary | null> {
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

export async function ensureRemoteVirtualBrowseBatchDetail(): Promise<PlatformImportBatchDetail> {
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

export async function loadBrowseBatches() {
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

export async function loadBrowseQaPage(batchId: string, page: number) {
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

export async function loadBrowseDetail(batchId: string, qaId: string) {
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

export async function loadBrowseReview(batchId: string) {
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

export async function saveBrowseReview(
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

// ---- Platform status ----

export function clearBrowsePlatformStatuses() {
  state.browsePlatformStatusRequestId += 1;
  state.browsePlatformStatusLoading = false;
  state.browsePlatformStatusMap = new Map();
}

export function syncBrowsePlatformStatusCacheToCurrentBatches() {
  const validIds = new Set(localBrowseBatches().map((batch) => batch.id));
  state.browsePlatformStatusMap = new Map(
    [...state.browsePlatformStatusMap.entries()].filter(([batchId]) => validIds.has(batchId))
  );
}

export async function syncBrowseBatchPlatformStatuses(
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

// ---- Event handlers ----

export function initBrowseEventHandlers() {
  if (!browseContent || !browseBackButton) return;

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

    const pButton = target.closest<HTMLButtonElement>("button");
    if (!pButton || pButton.disabled) {
      return;
    }

    if (pButton.id === "browse-prev-page" && state.browsePageData.page > 1) {
      void loadBrowseQaPage(state.browseSelectedBatchId, state.browsePageData.page - 1);
    }

    if (pButton.id === "browse-next-page" && state.browsePageData.page < state.browsePageData.totalPages) {
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
    const saveButton = browseContent!.querySelector<HTMLButtonElement>("#browse-review-save");
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
}
