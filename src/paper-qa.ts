import { invoke } from "@tauri-apps/api/core";
import type { PaperFile, PaperChunk, PaperQaGenerateResponse } from "./state";
import type { QaBatchSummary } from "./types";
import { PAPER_QA_STORAGE_KEY } from "./constants";
import { state } from "./state";
import { t } from "./translations";
import { escapeHtml } from "./utils";
import { resolveLLMProvider } from "./provider";
import { appendLog } from "./main";

export function renderPaperQaPanel() {
  // Error/success banners
  const errBanner = document.querySelector<HTMLElement>("#paper-qa-error-banner");
  const okBanner = document.querySelector<HTMLElement>("#paper-qa-success-banner");
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
  const stats = document.querySelector<HTMLElement>("#paper-qa-stats");
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
  const progressEl = document.querySelector<HTMLElement>("#paper-qa-progress");
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
  const logEl = document.querySelector<HTMLElement>("#paper-qa-log");
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

export function addPaperFiles(filesOrPaths: FileList | File[] | string[]) {
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

export function removePaperFile(id: string) {
  state.paperFiles = state.paperFiles.filter(f => f.id !== id);
  if (state.paperFiles.length === 0) {
    state.paperQaResult = null;
  }
  state.paperQaErrorMessage = null;
  state.paperQaSelectedFileId = null;
  renderPaperQaPanel();
}

export async function handlePaperQaConvert() {
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

export async function handlePaperQaGenerate() {
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

export async function handlePaperQaSaveBatch() {
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

export function persistPaperQaState() {
  try {
    const data = JSON.stringify({
      files: state.paperFiles,
      result: state.paperQaResult,
      cotRatio: state.paperQaCotRatio,
    });
    window.localStorage.setItem(PAPER_QA_STORAGE_KEY, data);
  } catch { /* quota exceeded — silently skip */ }
}

export function restorePaperQaState() {
  try {
    const raw = window.localStorage.getItem(PAPER_QA_STORAGE_KEY);
    if (!raw) return;
    const data = JSON.parse(raw);
    if (Array.isArray(data.files)) state.paperFiles = data.files;
    if (data.result) state.paperQaResult = data.result;
    if (typeof data.cotRatio === "number") state.paperQaCotRatio = data.cotRatio;
  } catch { /* corrupted data — ignore */ }
}
