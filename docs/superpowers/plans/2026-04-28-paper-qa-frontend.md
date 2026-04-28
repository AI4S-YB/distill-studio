# Paper QA Frontend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a "Paper QA" tab panel to the SPA for uploading PDFs, converting them via MinerU, chunking, generating QA pairs, and uploading to platform.

**Architecture:** Changes to `src/main.ts` (frontend) and `src-tauri/src/lib.rs` (one new upload command). Follows existing SPA patterns: global `let` state, template literal HTML, `invoke()` Tauri commands, delegate event handling, `render*Panel()` functions called from `setCurrentTab()`. CSS already exists in `src/styles.css`. Core Rust backend commands already implemented (`convert_pdf_via_mineru`, `chunk_paper_md`, `generate_paper_qa`).

**Tech Stack:** TypeScript, Tauri v2 invoke API, vanilla DOM manipulation, Rust

---

### Task 1: Add translation keys for Paper QA

**Files:**
- Modify: `src/main.ts` — insert keys into both `zh` and `en` objects inside `const translations`

- [ ] **Step 1: Add Chinese translation keys**

Insert after the last `chat_qa_*` key in the `zh` object (near `chat_qa_upload_empty`):

```ts
    paper_qa_tab: "文献问答",
    paper_qa_add: "添加 PDF",
    paper_qa_convert: "转换",
    paper_qa_generate: "生成问答",
    paper_qa_upload: "上传到平台",
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
    paper_qa_uploading: "上传中…",
    paper_qa_upload_done: "上传完成",
    paper_qa_upload_error: "上传失败",
    paper_qa_generating: "生成中…",
    paper_qa_generate_error: "生成失败",
```

- [ ] **Step 2: Add English translation keys**

Insert after the last `chat_qa_*` key in the `en` object:

```ts
    paper_qa_tab: "Paper QA",
    paper_qa_add: "Add PDF",
    paper_qa_convert: "Convert",
    paper_qa_generate: "Generate QA",
    paper_qa_upload: "Upload to Platform",
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
    paper_qa_uploading: "Uploading...",
    paper_qa_upload_done: "Upload complete",
    paper_qa_upload_error: "Upload failed",
    paper_qa_generating: "Generating...",
    paper_qa_generate_error: "Generation failed",
```

- [ ] **Step 3: Run type check to confirm no new errors**

```bash
npx tsc --noEmit 2>&1 | head -20
```
Expected: Only pre-existing errors.

- [ ] **Step 4: Commit**

```bash
git add src/main.ts
git commit -m "feat: add Paper QA translation keys"
```

---

### Task 2: Add UiTab type entry and global state

**Files:**
- Modify: `src/main.ts`

- [ ] **Step 1: Add "paper-qa" to UiTab type**

Locate `type UiTab = "recent-updates" | ...` and append `| "paper-qa"`:

```ts
type UiTab = "recent-updates" | "chat-qa" | "topic" | "settings" | "browse" | "qa-evaluate" | "model-trial" | "feedback2" | "paper-qa";
```

- [ ] **Step 2: Add Paper QA state variables**

Insert after `let platformGenerateModels: PlatformGenerateModel[] = [];`:

```ts
// Paper QA state
type PaperFileStatus = "pending" | "converting" | "converted" | "chunked" | "error";
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
```

- [ ] **Step 3: Run type check**

```bash
npx tsc --noEmit 2>&1 | head -20
```
Expected: `PaperChunk` and `PaperQaGenerateResponse` should resolve from Tauri's type generation.

- [ ] **Step 4: Commit**

```bash
git add src/main.ts
git commit -m "feat: add Paper QA types and global state"
```

---

### Task 3: Add tab button and panel HTML

**Files:**
- Modify: `src/main.ts`

- [ ] **Step 1: Add tab button in the #tabs div**

Insert after the `feedback2` tab button:

```ts
              <button class="tab-button tab-button-plain" type="button" data-tab="paper-qa" id="tab-paper-qa">
                <span class="tab-button-title" id="tab-paper-qa-label">Paper QA</span>
              </button>
```

- [ ] **Step 2: Add panel HTML in the template literal**

Insert after the feedback2 panel's closing `</section>`. The panel includes an error banner, a status message for user feedback (replacing toast), toolbar buttons, and the two-column body:

```ts
            <section class="tab-panel" data-tab-panel="paper-qa" hidden>
              <div class="tab-copy-block">
                <p class="panel-title" id="paper-qa-tab-title">Paper QA</p>
                <p class="panel-copy" id="paper-qa-tab-copy">Convert PDF papers to markdown, chunk them, and generate QA pairs.</p>
              </div>
              <div class="paper-qa-panel" id="paper-qa-panel">
                <div class="platform-inline-banner error" id="paper-qa-error-banner" hidden></div>
                <div class="platform-inline-banner success" id="paper-qa-success-banner" hidden></div>
                <div class="paper-qa-toolbar">
                  <input type="file" id="paper-qa-file-input" accept=".pdf" multiple hidden>
                  <button class="paper-qa-toolbar-button" type="button" id="paper-qa-add-btn">${t("paper_qa_add")}</button>
                  <button class="paper-qa-toolbar-button paper-qa-toolbar-button-primary" type="button" id="paper-qa-convert-btn">${t("paper_qa_convert")}</button>
                  <button class="paper-qa-toolbar-button paper-qa-toolbar-button-primary" type="button" id="paper-qa-generate-btn">${t("paper_qa_generate")}</button>
                  <div class="paper-qa-cot-ratio">
                    <span>${t("paper_qa_cot_ratio")}</span>
                    <input type="range" id="paper-qa-cot-ratio" min="0" max="1" step="0.05" value="0.4">
                    <span class="paper-qa-cot-ratio-value" id="paper-qa-cot-ratio-value">0.4</span>
                  </div>
                  <button class="paper-qa-toolbar-button paper-qa-toolbar-button-secondary" type="button" id="paper-qa-upload-btn">${t("paper_qa_upload")}</button>
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
                    <div id="paper-qa-results">
                      <div class="paper-qa-empty">${t("paper_qa_empty")}</div>
                    </div>
                    <div class="paper-qa-stats" id="paper-qa-stats" hidden></div>
                  </div>
                </div>
              </div>
            </section>
```

- [ ] **Step 3: Run type check**

```bash
npx tsc --noEmit 2>&1 | head -20
```
Expected: Only pre-existing errors.

- [ ] **Step 4: Commit**

```bash
git add src/main.ts
git commit -m "feat: add Paper QA tab button and panel HTML"
```

---

### Task 4: Add renderPaperQaPanel and setCurrentTab integration

**Files:**
- Modify: `src/main.ts`

- [ ] **Step 1: Add to setCurrentTab**

In `setCurrentTab()`, after the `feedback2` branch:

```ts
  if (tab === "paper-qa") {
    try { renderPaperQaPanel(); } catch (e) { appendLog(`renderPaperQaPanel: ${String(e)}`); }
  }
```

- [ ] **Step 2: Write renderPaperQaPanel**

Insert before `setCurrentTab`:

```ts
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
        const statusCls = f.status === "converting" ? "paper-file-status-converting"
          : f.status === "error" ? "paper-file-status-error"
          : f.status === "converted" || f.status === "chunked" ? "paper-file-status-converted"
          : "";
        const statusLabel = f.status === "chunked" ? t("paper_qa_chunked").replace("{n}", String(f.chunks?.length ?? 0))
          : t(`paper_qa_${f.status}`);
        const chunkInfo = (f.status === "converted" || f.status === "chunked") && f.chunks
          ? `<div class="paper-qa-chunk-count">${f.chunks.length} chunks</div>`
          : "";
        const errorInfo = f.status === "error" && f.error
          ? `<div class="paper-file-error-msg">${escapeHtml(f.error)}</div>`
          : "";
        return `
          <div class="paper-file-card" data-file-id="${escapeHtml(f.id)}">
            <span class="paper-file-name" title="${escapeHtml(f.name)}">${escapeHtml(f.name)}</span>
            <span class="paper-file-status ${statusCls}">${statusLabel}</span>
            <button class="paper-file-remove" type="button" data-remove-file="${escapeHtml(f.id)}">&times;</button>
            ${errorInfo}
            ${chunkInfo}
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

  // Button states
  const convertBtn = document.querySelector<HTMLButtonElement>("#paper-qa-convert-btn");
  const generateBtn = document.querySelector<HTMLButtonElement>("#paper-qa-generate-btn");
  const uploadBtn = document.querySelector<HTMLButtonElement>("#paper-qa-upload-btn");
  const statusEl = document.querySelector("#paper-qa-generate-status");

  if (convertBtn) {
    convertBtn.disabled = paperQaConverting || paperQaGenerating || paperFiles.length === 0;
  }
  if (generateBtn) {
    const hasChunked = paperFiles.some(f => f.status === "chunked");
    const hasProvider = (baseUrlInput.value.trim() && apiKeyInput.value.trim()) || isUsingPlatformModel();
    generateBtn.disabled = paperQaConverting || paperQaGenerating || !hasChunked || !hasProvider;
    generateBtn.title = (!hasProvider && hasChunked) ? t("paper_qa_no_provider") : "";
  }
  if (uploadBtn) {
    const auth = currentPlatformAuthPayload();
    uploadBtn.disabled = paperQaUploading || !paperQaResult || paperQaResult.items.length === 0 || !auth;
  }
  if (statusEl) {
    if (paperQaConverting) statusEl.textContent = t("paper_qa_converting");
    else if (paperQaGenerating) statusEl.textContent = t("paper_qa_generating");
    else if (paperQaUploading) statusEl.textContent = t("paper_qa_uploading");
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
```

- [ ] **Step 3: Run type check**

```bash
npx tsc --noEmit 2>&1 | head -30
```
Expected: Only pre-existing errors. Properties like `qaType`, `sectionType`, `cotCount`, `qaCount` come from Tauri's auto-generated bindings for `PaperQaItem` and `PaperQaStats`.

- [ ] **Step 4: Commit**

```bash
git add src/main.ts
git commit -m "feat: add renderPaperQaPanel and setCurrentTab integration"
```

---

### Task 5: Implement add/remove/drag-drop handlers

**Files:**
- Modify: `src/main.ts`

- [ ] **Step 1: Write addPaperFiles and removePaperFile helpers**

Insert after `renderPaperQaPanel`:

```ts
function addPaperFiles(files: FileList | File[]) {
  const pdfFiles = Array.from(files).filter(f => f.name.toLowerCase().endsWith(".pdf"));
  if (pdfFiles.length === 0) return;

  const remaining = 20 - paperFiles.length;
  if (remaining <= 0) {
    paperQaErrorMessage = t("paper_qa_max_files");
    renderPaperQaPanel();
    return;
  }

  const toAdd = pdfFiles.slice(0, remaining);
  if (pdfFiles.length > remaining) {
    paperQaErrorMessage = t("paper_qa_max_files");
  } else {
    paperQaErrorMessage = null;
  }

  for (const file of toAdd) {
    const path = (file as any).path as string | undefined;
    const paperFile: PaperFile = {
      id: crypto.randomUUID(),
      name: file.name,
      path: path ?? "",
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
  renderPaperQaPanel();
}
```

- [ ] **Step 2: Add click delegate entries**

In the global `document.addEventListener("click", ...)` block, before the tab-switching logic:

```ts
  // Paper QA: Add PDF
  if (target.closest("#paper-qa-add-btn")) {
    document.querySelector<HTMLInputElement>("#paper-qa-file-input")?.click();
    return;
  }
  // Paper QA: Convert
  const convBtn = target.closest<HTMLElement>("#paper-qa-convert-btn");
  if (convBtn && !(convBtn as HTMLButtonElement).disabled) {
    void handlePaperQaConvert();
    return;
  }
  // Paper QA: Generate
  const genBtn = target.closest<HTMLElement>("#paper-qa-generate-btn");
  if (genBtn && !(genBtn as HTMLButtonElement).disabled) {
    void handlePaperQaGenerate();
    return;
  }
  // Paper QA: Upload
  const upBtn = target.closest<HTMLElement>("#paper-qa-upload-btn");
  if (upBtn && !(upBtn as HTMLButtonElement).disabled) {
    void handlePaperQaUpload();
    return;
  }
  // Paper QA: Remove file
  const rmBtn = target.closest<HTMLElement>("[data-remove-file]");
  if (rmBtn) {
    const fileId = rmBtn.dataset.removeFile;
    if (fileId) removePaperFile(fileId);
    return;
  }
```

- [ ] **Step 3: Add file input and drag-drop listeners**

Near other `addEventListener` calls at the bottom of main.ts:

```ts
// Paper QA: file input
document.querySelector("#paper-qa-file-input")?.addEventListener("change", (event) => {
  const input = event.target as HTMLInputElement;
  if (input.files?.length) {
    addPaperFiles(input.files);
    input.value = "";
  }
});

// Paper QA: drag & drop
const paperQaPanelEl = document.querySelector("#paper-qa-panel");
paperQaPanelEl?.addEventListener("dragover", (e) => {
  e.preventDefault();
  e.stopPropagation();
});
paperQaPanelEl?.addEventListener("drop", (e) => {
  e.preventDefault();
  e.stopPropagation();
  if (e.dataTransfer?.files?.length) {
    addPaperFiles(e.dataTransfer.files);
  }
});

// Paper QA: CoT ratio slider
document.querySelector("#paper-qa-cot-ratio")?.addEventListener("input", (event) => {
  const slider = event.target as HTMLInputElement;
  paperQaCotRatio = parseFloat(slider.value);
  const valEl = document.querySelector("#paper-qa-cot-ratio-value");
  if (valEl) valEl.textContent = String(paperQaCotRatio);
});
```

- [ ] **Step 4: Run type check**

```bash
npx tsc --noEmit 2>&1 | head -30
```
Expected: Only pre-existing errors.

- [ ] **Step 5: Commit**

```bash
git add src/main.ts
git commit -m "feat: add Paper QA file add/remove and drag-drop handlers"
```

---

### Task 6: Implement convert and generate async handlers

**Files:**
- Modify: `src/main.ts`

- [ ] **Step 1: Write handlePaperQaConvert**

Insert after `removePaperFile`:

```ts
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
```

- [ ] **Step 2: Write handlePaperQaGenerate**

Insert after the convert handler:

```ts
async function handlePaperQaGenerate() {
  if (paperQaConverting || paperQaGenerating) return;
  const chunkedFiles = paperFiles.filter(f => f.status === "chunked" && f.chunks);
  if (chunkedFiles.length === 0) return;

  // Provider resolution — matches pattern at line 7640
  const provider = isUsingPlatformModel() ? "openai-compatible" : providerInput.value;
  const baseUrl = baseUrlInput.value.trim();
  const apiKey = apiKeyInput.value.trim();
  const model = isUsingPlatformModel()
    ? (currentPlatformGenerateModel()?.modelName ?? currentModelValue())
    : currentModelValue();

  if (!baseUrl || !apiKey || !model) {
    paperQaErrorMessage = t("paper_qa_no_provider");
    renderPaperQaPanel();
    return;
  }

  const allChunks = chunkedFiles.flatMap(f => f.chunks!);
  const paperTitle = chunkedFiles.map(f => f.name).join(", ");
  const request = {
    chunks: allChunks,
    paperTitle,
    provider,
    baseUrl,
    apiKey,
    model,
    cotRatio: paperQaCotRatio,
  };

  paperQaGenerating = true;
  paperQaErrorMessage = null;
  paperQaUploadMessage = null;
  renderPaperQaPanel();

  try {
    const result = await invoke<PaperQaGenerateResponse>("generate_paper_qa", { request });
    paperQaResult = result;
  } catch (err) {
    paperQaErrorMessage = t("paper_qa_generate_error") + ": " + String(err);
  }

  paperQaGenerating = false;
  renderPaperQaPanel();
}
```

- [ ] **Step 3: Run type check**

```bash
npx tsc --noEmit 2>&1 | head -30
```
Expected: Only pre-existing errors.

- [ ] **Step 4: Commit**

```bash
git add src/main.ts
git commit -m "feat: add Paper QA convert and generate handlers"
```

---

### Task 7: Add Rust push_paper_qa command and frontend upload handler

**Files:**
- Modify: `src-tauri/src/lib.rs` — add `push_paper_qa` command
- Modify: `src/main.ts` — add `handlePaperQaUpload`

- [ ] **Step 1: Add Rust push_paper_qa command**

Insert before the `#[tauri::command]` on `push_chat_conversations` (line ~2206):

```rust
#[tauri::command]
async fn push_paper_qa(
    platform_url: String,
    username: String,
    password: String,
    batch_name: String,
    external_batch_id: String,
    rows: Vec<PlatformImportRowPayload>,
) -> Result<PaperQaUploadResponse, String> {
    let (endpoints, token, user) =
        platform_login_with_token(&platform_url, &username, &password).await?;
    let application = user
        .applications
        .first()
        .ok_or_else(|| "current platform account has no assigned application".to_string())?;

    let payload = serde_json::json!({
        "name": batch_name,
        "source": QA_PLATFORM_BATCH_SOURCE,
        "external_batch_id": external_batch_id,
        "application_id": application.id,
        "technical_type_code": "direct_qa",
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
        return Err(format!(
            "upload failed with status {}: {}",
            status.as_u16(),
            body.trim()
        ));
    }
    let response_payload = response
        .json::<ApiEnvelope<PlatformImportPushResponseData>>()
        .await
        .map_err(error_to_string)?;
    Ok(PaperQaUploadResponse {
        batch_id: response_payload.data.batch_id,
        external_batch_id,
    })
}
```

- [ ] **Step 2: Add PaperQaUploadResponse struct**

Insert after the existing `ChatUploadResponse` struct:

```rust
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct PaperQaUploadResponse {
    batch_id: Option<i64>,
    external_batch_id: String,
}
```

- [ ] **Step 3: Register the command**

In the `generate_handler![]` macro at the bottom of `lib.rs`, add `push_paper_qa` to the list:

```rust
push_paper_qa,
```

- [ ] **Step 4: Write handlePaperQaUpload in main.ts**

Insert after `handlePaperQaGenerate`:

```ts
async function handlePaperQaUpload() {
  if (paperQaUploading || !paperQaResult?.items.length) return;

  const auth = currentPlatformAuthPayload();
  if (!auth) {
    paperQaErrorMessage = t("paper_qa_no_provider");
    renderPaperQaPanel();
    return;
  }

  paperQaUploading = true;
  paperQaErrorMessage = null;
  paperQaUploadMessage = null;
  renderPaperQaPanel();

  try {
    const rows = paperQaResult.items.map((item) => ({
      id: item.id,
      question: item.instruction,
      answer: item.output,
      context: item.reasoning ?? "",
      difficulty: "medium",
      source: "paper_qa",
      model: item.qaType === "cot" ? "cot" : "direct",
      metadata: {
        paperTitle: item.paperTitle,
        chunkId: item.chunkId,
        sectionType: item.sectionType,
        qaType: item.qaType,
      },
      candidateAnswers: [],
    }));

    const batchName = `Paper QA ${new Date().toISOString().slice(0, 19)}`;
    const externalBatchId = crypto.randomUUID();

    await invoke("push_paper_qa", {
      platformUrl: auth.platformUrl,
      username: auth.username,
      password: auth.password,
      batchName,
      externalBatchId,
      rows,
    });

    paperQaUploadMessage = t("paper_qa_upload_done");
  } catch (err) {
    paperQaErrorMessage = t("paper_qa_upload_error") + ": " + String(err);
  }

  paperQaUploading = false;
  renderPaperQaPanel();
}
```

- [ ] **Step 5: Rust build check**

```bash
cargo check --manifest-path src-tauri/Cargo.toml 2>&1 | tail -10
```
Expected: No errors.

- [ ] **Step 6: TypeScript type check**

```bash
npx tsc --noEmit 2>&1 | head -30
```
Expected: Only pre-existing errors.

- [ ] **Step 7: Commit**

```bash
git add src/main.ts src-tauri/src/lib.rs
git commit -m "feat: add Paper QA platform upload with Rust command"
```

---

### Task 8: Final type check and build verification

**Files:**
- Verify: `src/main.ts`, `src-tauri/src/lib.rs`

- [ ] **Step 1: Full TypeScript type check**

```bash
npx tsc --noEmit 2>&1
```
Expected: Only pre-existing errors (compare count before starting).

- [ ] **Step 2: Full Rust cargo check**

```bash
cargo check --manifest-path src-tauri/Cargo.toml 2>&1 | tail -5
```
Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add src/main.ts src-tauri/src/lib.rs
git commit -m "chore: final Paper QA type check cleanup"
```

---

### Task 9: Manual verification checklist

- [ ] **1. Tab appears** — `npm run tauri:dev`, sidebar shows "Paper QA" / "文献问答" tab
- [ ] **2. Drag-drop** — drag PDFs onto panel, files appear with "Pending" in left list
- [ ] **3. File picker** — click "Add PDF", select files, same result
- [ ] **4. Max 20 cap** — add 25 PDFs, only 20 accepted, error banner shown
- [ ] **5. Convert** — click Convert (needs MinerU env vars), files progress: converting → converted → chunked; errors show red badge
- [ ] **6. Generate** — with a configured provider, click Generate; results appear in right panel with CoT/QA badges and stats
- [ ] **7. Upload** — with platform credentials, click Upload; success banner shown
- [ ] **8. Empty states** — no files: Convert/Generate disabled; no provider: Generate disabled with tooltip; no platform auth: Upload disabled
- [ ] **9. Error recovery** — remove errored file, re-add: status resets to "pending"; error banner clears on new action
