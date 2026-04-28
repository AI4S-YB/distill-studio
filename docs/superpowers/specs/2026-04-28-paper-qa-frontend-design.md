# Paper QA Frontend Design

**Date:** 2026-04-28
**Status:** approved

## Overview

Add a "Paper QA" tab to the SPA that allows users to upload PDF research papers, convert them to markdown via MinerU, chunk the text into sections, and generate Chain-of-Thought (CoT) and direct QA pairs via LLM. Results can be uploaded to the platform via the existing import API.

## Rust Backend (already implemented)

Three Tauri commands in `src-tauri/src/lib.rs`:

- `convert_pdf_via_mineru(pdf_path: String) -> Result<String, String>` — uploads PDF to MinerU, polls extraction, downloads ZIP, returns markdown text
- `chunk_paper_md(md_text: String, paper_title: String) -> Result<Vec<PaperChunk>, String>` — splits markdown by headers into `PaperChunk { id, text, section_type, char_count }`
- `generate_paper_qa(request: PaperQaGenerateRequest) -> Result<PaperQaGenerateResponse, String>` — calls LLM for CoT + QA pairs, applies internal filtering/dedup, returns `{ items: PaperQaItem[], stats: PaperQaStats }`

## CSS (already implemented)

Lines 3040–3319 in `src/styles.css` define all Paper QA styles: `.paper-qa-panel`, `.paper-qa-toolbar`, buttons, `.paper-qa-body` (grid 280px + 1fr), file cards, chunk items, result items with CoT/QA type badges, stats bar, empty/error states.

## UI Layout

```
Toolbar: [+ Add PDF] [Convert] [Generate]  CoT: [===_]== 0.4  [Upload to Platform]
Body grid (left 280px + right 1fr):
  Left:  PDF file list with per-file status cards
  Right: QA results list (CoT badge amber, QA badge green)
Bottom: Stats bar (total, CoT count, QA count, ratio)
```

## Operation Flow

1. **Add PDF** — local file picker (button) or drag & drop onto the panel, max 20 files, non-PDF filtered
2. **Convert** — sequentially calls `convert_pdf_via_mineru` then `chunk_paper_md` for each `pending` file; updates per-file status; single failure does not block others
3. **Generate** — collects all chunks from `chunked` files, calls `generate_paper_qa` with provider config (from Settings, fallback to platform LLM proxy); displays results in right panel
4. **Upload** — maps `PaperQaItem[]` to `PlatformImportRowPayload[]` and pushes via the existing platform import command

## State Design

### Types

```ts
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
```

### State transitions

```
pending → converting → converted → chunked
  │         │            │           │
  └─────────┴────────────┴─────→ error
```

### Global variables

- `paperFiles: PaperFile[]` — tracked PDF files
- `paperQaResult: PaperQaGenerateResponse | null` — latest generate result
- `paperQaCotRatio: number` — 0.0–1.0, default 0.4
- `paperQaConverting: boolean` — convert in progress
- `paperQaGenerating: boolean` — generate in progress
- `paperQaUploading: boolean` — upload in progress

## Provider Resolution

```
Settings has baseUrl + apiKey → use directly
Settings missing → platform logged in → use platform LLM proxy
Neither → disable Generate button, show hint
```

## Integration Points

1. `UiTab` type — add `"paper-qa"`
2. Tab button HTML — insert into `#tabs`
3. Panel HTML — insert `<section data-tab-panel="paper-qa">` into template literal
4. `setCurrentTab()` — add paper-qa branch to render the panel
5. Event delegation — handle toolbar button clicks, drag & drop, file picker
6. Translation objects — add `paper_qa_*` keys to zh/en

## Translation Keys

| Key | En | Zh |
|-----|----|----|
| `paper_qa_tab` | Paper QA | 文献问答 |
| `paper_qa_add` | Add PDF | 添加 PDF |
| `paper_qa_convert` | Convert | 转换 |
| `paper_qa_generate` | Generate QA | 生成问答 |
| `paper_qa_upload` | Upload to Platform | 上传到平台 |
| `paper_qa_cot_ratio` | CoT Ratio | 思维链比例 |
| `paper_qa_pending` | Pending | 等待中 |
| `paper_qa_converting` | Converting... | 转换中... |
| `paper_qa_converted` | Converted | 已转换 |
| `paper_qa_chunked` | {n} chunks | {n} 个分块 |
| `paper_qa_error` | Error | 出错 |
| `paper_qa_empty` | Add PDF files to get started. | 添加 PDF 文献开始使用 |
| `paper_qa_no_provider` | Configure a provider in Settings first. | 请先在设置中配置模型 |
| `paper_qa_max_files` | Maximum 20 PDF files. | 最多 20 篇 PDF |
| `paper_qa_drag_hint` | Drop PDF files here | 拖拽 PDF 文件到此处 |
| `paper_qa_stats` | {total} total · {cot} CoT + {qa} QA | 共 {total} 条 · {cot} 思维链 + {qa} 问答 |

## Error Handling

| Scenario | Behavior |
|----------|----------|
| MinerU conversion fails | File marked `error`, message shown, remaining files continue |
| Chunk returns empty | File marked `error` with "no sections detected" |
| LLM generation fails | Error banner above results, existing results preserved |
| No provider available | Generate button disabled with tooltip |
| >20 files | Silently truncated to 20, toast warning |
| Non-PDF file | Filtered out, toast warning |
| Platform upload fails | Error banner, results preserved for retry |
