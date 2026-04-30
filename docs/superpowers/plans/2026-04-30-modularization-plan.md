# Modularization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Split the 9632-line `src/main.ts` into 16 files and the 5119-line `src-tauri/src/lib.rs` into 11 files, with no behavioral changes.

**Architecture:** Each feature file owns its types, state access, rendering, and event handlers for one functional domain. Shared concerns (types, translations, utilities, HTML template, global state) extracted into dedicated dependency-free or low-dependency modules. Feature files import from shared modules but not from each other.

**Tech Stack:** Vanilla TypeScript (no framework), Vite bundler, Tauri v2, Rust with `#[tauri::command]` macros

---

## File Map

### Frontend (16 files)
| File | From main.ts lines | Est. lines |
|------|-------------------|------------|
| `src/types.ts` | 1–464 | ~470 |
| `src/constants.ts` | 465–1114 | ~200 |
| `src/state.ts` | 2197–2473 | ~200 |
| `src/translations.ts` | 1116–2195, 3352–3443 | ~1200 |
| `src/utils.ts` | 4641–4714, 4136–4196 | ~300 |
| `src/html-template.ts` | 2475–3118 | ~540 |
| `src/provider.ts` | 4412–4640, 3789–3819, 1090–1115 | ~400 |
| `src/paper-qa.ts` | 3531–3900, 3691–3738 | ~600 |
| `src/chat-qa.ts` | 5808–~7500 | ~1700 |
| `src/browse-qa.ts` | 4161–4380, 4972–5080 | ~700 |
| `src/settings.ts` | 3511–3525, ~4300–~4700, ~5400–~5500 | ~550 |
| `src/platform.ts` | 5084–5560, 5118–5520 | ~1100 |
| `src/topic-pipeline.ts` | 3443–3525, 3990–4117, 4600–4900 | ~1000 |
| `src/recent-updates.ts` | 5613–5800 | ~250 |
| `src/update.ts` | scattered ~100 lines | ~100 |
| `src/main.ts` | ~3120–9632 | ~200 |

### Rust Backend (11 files)
| File | From lib.rs lines | Est. lines |
|------|-------------------|------------|
| `src-tauri/src/types.rs` | 1–546 (partial) | ~100 |
| `src-tauri/src/config.rs` | scattered | ~200 |
| `src-tauri/src/paper_qa_types.rs` | 547–872 | ~330 |
| `src-tauri/src/paper_qa_commands.rs` | 2310–4803 | ~2500 |
| `src-tauri/src/platform_types.rs` | 873–1087 | ~220 |
| `src-tauri/src/platform_commands.rs` | 1008–1688, 1933–2308 | ~1100 |
| `src-tauri/src/chat_qa.rs` | 4804–4918 | ~250 |
| `src-tauri/src/news_dashboard.rs` | 873–1780 | ~700 |
| `src-tauri/src/feedback.rs` | 1781–2309 | ~530 |
| `src-tauri/src/keychain.rs` | 4955–5017 | ~50 |
| `src-tauri/src/lib.rs` | remainder | ~100 |

---

## Frontend Extraction Tasks

### Task 1: Extract `types.ts`

**Files:**
- Create: `src/types.ts`
- Modify: `src/main.ts:1-464`

- [ ] **Step 1: Verify baseline before extraction**

Run: `npx tsc --noEmit 2>&1 | tail -5`
Expected: Only pre-existing errors (no new ones). Note current error count.

Run: `npm test`
Expected: 17 tests pass.

- [ ] **Step 2: Create `src/types.ts` with all type definitions**

Copy lines 1–464 from `src/main.ts` into `src/types.ts`. The content starts with:

```typescript
// src/types.ts
import { invoke } from "@tauri-apps/api/core";

type Lang = "zh" | "en";

type TopicPreview = {
  topic_name: string;
  goal: string;
  // ... (all types through line 464)
};
```

**Do not add an `export {}` block** — the types will be ambient (file is a module because of the `import`). Since `isolatedModules: true` is set, we use `export type` for types consumed elsewhere.

At the end of `src/types.ts`, add explicit exports only for types consumed outside:

```typescript
export type {
  Lang,
  TopicPreview,
  PipelineResponse,
  PipelineProgressEvent,
  // ... (add all types referenced by other files — determined by tsc errors after extraction)
};
```

- [ ] **Step 3: Replace types section in `src/main.ts` with import**

Delete lines 1–464 from `src/main.ts`. At the top of `src/main.ts`, add:

```typescript
import type * as Types from "./types";
```

Fix all `ResolvedLLMProvider` etc. references by relaxing the usage: since these types were ambient in `main.ts`, after extraction they remain ambient via the `import type`. No code references need changing for type-only constructs.

- [ ] **Step 4: TypeScript type check**

Run: `npx tsc --noEmit 2>&1 | head -30`
Expected: Any new "Cannot find name" errors mean types need to be added to the `export type {}` block in `types.ts`. Add them and re-check.

- [ ] **Step 5: Verify tests still pass**

Run: `npm test`
Expected: 17 tests pass.

- [ ] **Step 6: Commit**

```bash
git add src/types.ts src/main.ts
git commit -m "refactor: extract types.ts from main.ts (~470 lines)"
```

---

### Task 2: Extract `constants.ts`

**Files:**
- Create: `src/constants.ts`
- Modify: `src/main.ts:465-1114`

- [ ] **Step 1: Create `src/constants.ts`**

Copy lines 465–1114 from `src/main.ts` to `src/constants.ts`. This includes:
- Lines 465–488: `formatCotSectionHeaders()` and related functions
- Lines 481–489: Storage key constants (`LANG_STORAGE_KEY`, `CHAT_SESSIONS_STORAGE_KEY`, etc.)
- Lines 490–1086: `PROVIDER_PRESETS` object with all provider presets
- Lines 1087–1114: `PROVIDER_PRESET_KEYS`, `DEFAULT_COT_SECTION_HEADERS_ZH/EN`, etc.

At the top of `src/constants.ts`, add:

```typescript
import type { Lang, ProviderPresetId } from "./types";
```

At the bottom, add exports:

```typescript
export {
  LANG_STORAGE_KEY,
  CHAT_SESSIONS_STORAGE_KEY,
  PAPER_QA_STORAGE_KEY,
  DEFAULT_PROFILE_NAME,
  AUTO_SAVE_DELAY_MS,
  MANAGED_OUTPUT_DIR,
  CUSTOM_MODEL_VALUE,
  DEFAULT_COT_TARGET_COUNT,
  COT_TARGET_COUNT_CAP,
  PROVIDER_PRESETS,
  PROVIDER_PRESET_KEYS,
  DEFAULT_PROVIDER_PRESET,
  DEFAULT_COT_SECTION_HEADERS_ZH,
  DEFAULT_COT_SECTION_HEADERS_EN,
  formatCotSectionHeaders,
  defaultCotSectionHeadersForLang,
  isDefaultCotSectionHeaderText,
};
```

- [ ] **Step 2: Update `src/main.ts`**

Delete lines 465–1114 from `src/main.ts`. Add import at top:

```typescript
import {
  LANG_STORAGE_KEY,
  CHAT_SESSIONS_STORAGE_KEY,
  PAPER_QA_STORAGE_KEY,
  DEFAULT_PROFILE_NAME,
  AUTO_SAVE_DELAY_MS,
  MANAGED_OUTPUT_DIR,
  CUSTOM_MODEL_VALUE,
  DEFAULT_COT_TARGET_COUNT,
  COT_TARGET_COUNT_CAP,
  PROVIDER_PRESETS,
  PROVIDER_PRESET_KEYS,
  DEFAULT_PROVIDER_PRESET,
  formatCotSectionHeaders,
  defaultCotSectionHeadersForLang,
  isDefaultCotSectionHeaderText,
} from "./constants";
```

- [ ] **Step 3: TypeScript type check**

Run: `npx tsc --noEmit 2>&1 | head -30`
Expected: No new errors beyond pre-existing baseline. If any export is missing, add it.

- [ ] **Step 4: Verify tests pass**

Run: `npm test`
Expected: 17 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/constants.ts src/main.ts
git commit -m "refactor: extract constants.ts from main.ts (~200 lines)"
```

---

### Task 3: Extract `state.ts`

**Files:**
- Create: `src/state.ts`
- Modify: `src/main.ts:2197-2473`

- [ ] **Step 1: Create `src/state.ts`**

Copy lines 2197–2473 from `src/main.ts` to `src/state.ts`. This is all the global `let` variable declarations starting with `const storedLang = ...` through the `runStats` object init.

At the top, add imports for types and constants used in initializers:

```typescript
import { LANG_STORAGE_KEY } from "./constants";
import type { Lang, UiTab, OutputState, ... } from "./types";
```

Prefix each variable declaration with `export`:
```typescript
export const storedLang = window.localStorage.getItem(LANG_STORAGE_KEY);
export let currentLang: Lang = ...
export let currentTab: UiTab = "topic";
// ... (all ~100 variables)
```

- [ ] **Step 2: Update `src/main.ts`**

Delete the globals block from `src/main.ts`. Add import:

```typescript
import {
  currentLang,
  currentTab,
  currentStatus,
  outputState,
  topicTags,
  // ... (all needed variables)
} from "./state";
```

- [ ] **Step 3: TypeScript type check**

Run: `npx tsc --noEmit 2>&1 | head -40`
Expected: May have many errors where `let` variables are reassigned (TS will complain about importing `let` from a module). This is expected — the variables are `export let` in state.ts, so reassignment works across modules.

Fix any missing exports by adding them to the import list in main.ts.

- [ ] **Step 4: Verify tests pass**

Run: `npm test`
Expected: 17 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/state.ts src/main.ts
git commit -m "refactor: extract state.ts from main.ts (~200 lines)"
```

---

### Task 4: Extract `translations.ts`

**Files:**
- Create: `src/translations.ts`
- Modify: `src/main.ts:1116-2195,3352-3443`

- [ ] **Step 1: Create `src/translations.ts`**

Copy the `translations` object (lines 1116–2195) and the translation utility functions (lines 3352–3443) into `src/translations.ts`.

At the top:

```typescript
import type { Lang } from "./types";
import { currentLang } from "./state";

export const translations: Record<Lang, Record<string, string>> = {
  zh: { ... },
  en: { ... }
};

export function t(key: string): string {
  return translations[currentLang][key] ?? key;
}

export function translationValues(key: string): string[] { ... }
export function matchesAnyTranslation(text: string | null, keys: string[]): boolean { ... }
export function findMatchingTranslationKey(text: string | null, keys: string[]): string | null { ... }
export function formatMessage(key: string, value?: string): string { ... }
export function createResearchFieldLabels(...): ... { ... }
export function lookupResearchFieldLabel(...): ... { ... }
export function topicTagLabel(tag: string, mode: "full" | "short" = "full"): string { ... }
export function formatCountTemplate(key: string, count: number): string { ... }
```

- [ ] **Step 2: Update `src/main.ts`**

Delete lines 1116–2195 and 3352–3443. Add import:

```typescript
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
```

- [ ] **Step 3: TypeScript type check**

Run: `npx tsc --noEmit 2>&1 | head -30`
Expected: No new errors.

- [ ] **Step 4: Run tests**

Run: `npm test`
Expected: 17 tests pass. The `t.test.ts` specifically tests `t()` — verify it still works.

- [ ] **Step 5: Commit**

```bash
git add src/translations.ts src/main.ts
git commit -m "refactor: extract translations.ts from main.ts (~1200 lines)"
```

---

### Task 5: Extract `utils.ts`

**Files:**
- Create: `src/utils.ts`
- Modify: `src/main.ts:4641-4730`

- [ ] **Step 1: Create `src/utils.ts`**

Copy utility functions from main.ts:
- `formatCount()` (lines 4641–4643)
- `formatDuration()` (lines 4645–4660)
- `formatRate()` (lines 4662–4670)
- `escapeHtml()` (lines 4672–4680)
- `displayValue()` (lines 4682–4684)
- `renderEmptyCard()` (lines 4686–4688)
- `renderValidationIssues()` (lines 4690–4699)
- `renderCards()` (lines 4701–4712)
- `renderActionButtons()` (lines 4714–4730)
- `escapeRegExp()` (lines 4136–4138)
- Label helpers at lines 4132–4200: `currentPresetLabel()`, `currentModelValue()`, `qaModeLabel()`, `batchStatusLabel()`, `reviewStatusLabel()`, `reviewStatusBadgeClass()`, `browseReviewSummaryLabel()`, `changeTypeLabel()`
- `parseTimestampMs()` (lines 4182–4188)
- `parsePlatformMetadataJson()` (lines 4190–4203)
- `metadataString()` (lines 4205–4216)
- `formatPlatformTime()` (lines 5159–5174)

At the top of `src/utils.ts`:

```typescript
import type { Lang, ProviderPresetId, QaBatchSummary, ReviewStatus, PlatformImportBatchSummary, ... } from "./types";
import { currentLang } from "./state";
import { t } from "./translations";
```

Export all functions with `export function`.

- [ ] **Step 2: Update `src/main.ts`**

Delete the moved function definitions. Add imports for all functions moved.

- [ ] **Step 3: TypeScript type check**

Run: `npx tsc --noEmit 2>&1 | head -30`

- [ ] **Step 4: Run tests**

Run: `npm test`
Expected: 17 tests pass (especially `escapeHtml.test.ts`).

- [ ] **Step 5: Commit**

```bash
git add src/utils.ts src/main.ts
git commit -m "refactor: extract utils.ts from main.ts (~300 lines)"
```

---

### Task 6: Extract `html-template.ts`

**Files:**
- Create: `src/html-template.ts`
- Modify: `src/main.ts:2475-3118`

- [ ] **Step 1: Create `src/html-template.ts`**

Copy lines 2475–3118 from `src/main.ts`:
- `const app = document.querySelector<HTMLDivElement>("#app");`
- `if (!app) { throw new Error("App root not found"); }`
- `app.innerHTML = \`...\`;` (the entire HTML template)

At the top:

```typescript
export function injectAppHtml(): HTMLElement {
  const app = document.querySelector<HTMLDivElement>("#app");
  if (!app) {
    throw new Error("App root not found");
  }
  app.innerHTML = \`...\`;  // (the full template)
  return app;
}
```

**IMPORTANT:** The template literal contains `${...}` interpolation. Review that all interpolated expressions remain available (they reference `t()` from translations and state variables). These will resolve at runtime because the template is a string that gets evaluated when `injectAppHtml()` is called.

- [ ] **Step 2: Update `src/main.ts`**

Replace lines 2475–3118 with:

```typescript
import { injectAppHtml } from "./html-template";
const app = injectAppHtml();
```

- [ ] **Step 3: TypeScript type check**

Run: `npx tsc --noEmit 2>&1 | head -30`
Expected: Template interpolations use imported functions — verify they resolve correctly.

- [ ] **Step 4: Build and check app renders**

Run: `npm run build 2>&1 | tail -10`
Expected: Build succeeds.

- [ ] **Step 5: Commit**

```bash
git add src/html-template.ts src/main.ts
git commit -m "refactor: extract html-template.ts from main.ts (~540 lines)"
```

---

### Task 7: Extract `provider.ts`

**Files:**
- Create: `src/provider.ts`
- Modify: `src/main.ts:4412-4640,3789-3819`

- [ ] **Step 1: Create `src/provider.ts`**

Copy these function groups from main.ts:
- `syncProviderFieldVisibility()` (lines 4412–4414)
- `syncModelOptions()` (lines 4416–4467)
- `detectProviderPreset()` (lines 4469–4485)
- `migrateLegacyStubRequest()` (lines 4487–4507)
- `normalizeLoadedCotRequest()` (lines 4509–4551)
- `loadPlatformGenerateModels()` (lines 4553–4565)
- `updatePlatformPresetOption()` (lines 4567–4581)
- `currentPlatformGenerateModel()` (lines 4583–4586)
- `syncProviderPresetInput()` (lines 4588–4603)
- `applyProviderPreset()` (lines 4605–4640)
- `resolveLLMProvider()` (lines 3789–3819)

At top:

```typescript
import type { ProviderPresetId, ProviderPreset, ResolvedLLMProvider, ... } from "./types";
import { PROVIDER_PRESETS, CUSTOM_MODEL_VALUE } from "./constants";
import { /* relevant state vars */ } from "./state";
import { escapeHtml } from "./utils";
import { invoke } from "@tauri-apps/api/core";
```

Export all functions.

- [ ] **Step 2: Update `src/main.ts`**

Delete the moved function definitions. Add import for all exported functions.

- [ ] **Step 3: TypeScript type check + tests**

Run: `npx tsc --noEmit 2>&1 | head -30`
Run: `npm test`

- [ ] **Step 4: Commit**

```bash
git add src/provider.ts src/main.ts
git commit -m "refactor: extract provider.ts from main.ts (~400 lines)"
```

---

### Task 8: Extract `paper-qa.ts`

**Files:**
- Create: `src/paper-qa.ts`
- Modify: `src/main.ts:3531-3920`

- [ ] **Step 1: Create `src/paper-qa.ts`**

Copy Paper QA functions from main.ts:
- `renderPaperQaPanel()` (lines 3531–3690)
- `addPaperFiles()` (lines 3691–3736)
- `removePaperFile()` (lines 3738–3746)
- `handlePaperQaConvert()` (lines 3748–3787)
- `handlePaperQaGenerate()` (lines 3821–3898)
- `handlePaperQaSaveBatch()` (lines 3900–3920)
- Any Paper QA state variables

At top:

```typescript
import { invoke } from "@tauri-apps/api/core";
import { message, open } from "@tauri-apps/plugin-dialog";
import type { PaperQaPaperFile, PaperQaConvertResponse, PaperQaGenerateResponse, ResolvedLLMProvider } from "./types";
import { PAPER_QA_STORAGE_KEY } from "./constants";
import { paperQaFiles, paperQaConvertStatus, paperQaGenerateStatus, ... } from "./state";
import { t, formatMessage } from "./translations";
import { escapeHtml, formatCount, formatDuration } from "./utils";
import { resolveLLMProvider } from "./provider";
```

Export all public functions.

- [ ] **Step 2: Update `src/main.ts`**

Delete the moved functions. Add import.

- [ ] **Step 3: Verify**

Run: `npx tsc --noEmit`
Run: `npm test`

- [ ] **Step 4: Commit**

```bash
git add src/paper-qa.ts src/main.ts
git commit -m "refactor: extract paper-qa.ts from main.ts (~600 lines)"
```

---

### Task 9: Extract `chat-qa.ts`

**Files:**
- Create: `src/chat-qa.ts`
- Modify: `src/main.ts` (chat QA section ~1700 lines)

- [ ] **Step 1: Map chat QA boundaries**

Find all Chat QA functions via:
```bash
grep -n '^function \|^async function ' src/main.ts | grep -i chat
```

Move all Chat QA functions + Chat QA state variables + `ChatSession`/`ChatMessage` types if embedded.

At top:

```typescript
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import type { ChatSession, ChatMessage, ChatSendRequest, ChatSendResponse, ResolvedLLMProvider } from "./types";
import { CHAT_SESSIONS_STORAGE_KEY } from "./constants";
import { chatSessions, currentChatSessionId, ... } from "./state";
import { t } from "./translations";
import { escapeHtml } from "./utils";
import { resolveLLMProvider } from "./provider";
```

- [ ] **Step 2: Update `src/main.ts`**

Delete chat QA functions. Add import.

- [ ] **Step 3: Verify**

Run: `npx tsc --noEmit`

- [ ] **Step 4: Commit**

```bash
git add src/chat-qa.ts src/main.ts
git commit -m "refactor: extract chat-qa.ts from main.ts (~1700 lines)"
```

---

### Task 10: Extract `browse-qa.ts`

**Files:**
- Create: `src/browse-qa.ts`
- Modify: `src/main.ts` (browse QA sections)

- [ ] **Step 1: Create `src/browse-qa.ts`**

Move these functions:
- `isRemoteVirtualBrowseBatch()` (line 4161)
- `localBrowseBatches()` (line 4165)
- `platformBatchQaMode()` (line 4169)
- `remoteVirtualBatchPrompt()` (line 4218)
- `remoteVirtualBatchToBrowseSummary()` (line 4230)
- `mergeBrowseBatches()` (line 4258)
- `platformImportItemToQaRecordSummary()` (line 4270)
- `platformImportItemToQaRecordDetail()` (line 4286)
- `remoteVirtualBrowsePageFromDetail()` (line 4324)
- `canResumeBrowseBatch()` (line 4346)
- `browseResumeActionLabel()` (line 4350)
- `batchPlatformStatusLabel()` (line 4356)
- `currentBrowseBatchPlatformStatus()` (line 4371)
- `browseBatchPlatformBadgeHtml()` (line 4375)
- `currentBrowseBatch()` (line 4972)
- `currentBrowseReviewItem()` (line 4981)
- `currentBrowseReviewDraft()` (line 4985)
- `moveToNextBrowseReviewItem()` (line 4993)
- `updateBrowseBatchReviewSummary()` (line 4999)
- `applyBrowseReviewUpdate()` (line 5037)
- `clearBrowseRemoteVirtualBatch()` (line 5079)
- Browse QA rendering functions
- `renderSetupSummary()` (line 4733)

At top:

```typescript
import { invoke } from "@tauri-apps/api/core";
import type { QaBatchSummary, QaRecordSummary, QaRecordDetail, ... } from "./types";
import { /* browse state vars */ } from "./state";
import { t, formatMessage, formatCountTemplate } from "./translations";
import { escapeHtml, formatCount, formatDuration, formatPlatformTime, ... } from "./utils";
```

- [ ] **Step 2: Update main.ts + verify + commit**

```bash
npx tsc --noEmit && npm test
git add src/browse-qa.ts src/main.ts
git commit -m "refactor: extract browse-qa.ts from main.ts (~700 lines)"
```

---

### Task 11: Extract `settings.ts`

**Files:**
- Create: `src/settings.ts`
- Modify: `src/main.ts` (settings + pipeline config + feedback sections)

- [ ] **Step 1: Create `src/settings.ts`**

Move:
- `updateApiKeyVisibilityUi()` (line 3511)
- Settings panel rendering functions
- `persistCurrentConfig()` / `loadConfig()` / pipeline config I/O
- `renderFeedbackPanel()` / feedback form submission
- `handleChangePassword()` etc.

- [ ] **Step 2: Update main.ts + verify + commit**

```bash
npx tsc --noEmit && npm test
git add src/settings.ts src/main.ts
git commit -m "refactor: extract settings.ts from main.ts (~550 lines)"
```

---

### Task 12: Extract `platform.ts`

**Files:**
- Create: `src/platform.ts`
- Modify: `src/main.ts` (platform sections)

- [ ] **Step 1: Create `src/platform.ts`**

Move:
- `currentQaPlatformUrl()` (line 5084)
- `currentManagedOutputRoot()` (line 5089)
- `hasQaPlatformCredentials()` (line 5093)
- `currentPlatformEndpoints()` (line 5097)
- `currentPlatformOpenUrl()` (line 5107)
- `resetPlatformIntegrationState()` (line 5140)
- `resetModelTrialState()` (line 5118)
- `currentModelTrialSelectedQuestion()` (line 5148)
- `currentModelTrialSelectedConfig()` (line 5155)
- `renderPlatformStateBlock()` (line 5176)
- `renderQaEvaluatePanel()` (line 5214)
- `renderModelTrialPanel()` (line 5270)
- `renderPlatformPanels()` (line 5516)
- `updatePlatformStatusBadge()` (line 5531)
- `renderPlatformAccountCard()` (line 5564)
- All platform state variables (`platformHealthState`, `platformLoginState`, etc.)
- Platform event listeners

- [ ] **Step 2: Update main.ts + verify + commit**

```bash
npx tsc --noEmit && npm test
git add src/platform.ts src/main.ts
git commit -m "refactor: extract platform.ts from main.ts (~1100 lines)"
```

---

### Task 13: Extract `topic-pipeline.ts`

**Files:**
- Create: `src/topic-pipeline.ts`
- Modify: `src/main.ts` (topic form + pipeline + run stats)

- [ ] **Step 1: Create `src/topic-pipeline.ts`**

Move:
- `currentTopicFieldNode()` (line 3435)
- `currentQaMode()` (line 3447)
- `currentManagedRunMode()` (line 3451)
- `shouldShowContinueRunButton()` (line 3459)
- `batchMatchesRequest()` (line 3463)
- `findLatestResumableBatchForRequest()` (line 3473)
- `armResumeBatchForRequest()` (line 3480)
- `clearManagedResumeBatchOnUserEdit()` (line 3489)
- `applyQaModeDefaults()` (line 3497)
- `renderTopicFieldModal()` (line 3990)
- `renderTopicTags()` (line 4046)
- `togglePendingTopicFieldTag()` (line 4072)
- `openTopicFieldModal()` (line 4082)
- `closeTopicFieldModal()` (line 4092)
- `addTopicTag()` (line 4097)
- `removeTopicTag()` (line 4111)
- `composeEffectivePrompt()` (line 4119)
- `resetRunStats()` (line 4807)
- `beginRunStats()` (line 4825)
- `stopRunStatsTicker()` (line 4845)
- `startRunStatsTicker()` (line 4852)
- `updateRunStatsFromEvent()` (line 4859)
- `renderRunStats()` (line 4901)
- Pipeline running functions

- [ ] **Step 2: Update main.ts + verify + commit**

```bash
npx tsc --noEmit && npm test
git add src/topic-pipeline.ts src/main.ts
git commit -m "refactor: extract topic-pipeline.ts from main.ts (~1000 lines)"
```

---

### Task 14: Extract `recent-updates.ts`

**Files:**
- Create: `src/recent-updates.ts`
- Modify: `src/main.ts` (recent updates section)

- [ ] **Step 1: Create `src/recent-updates.ts`**

Move:
- `renderRecentUpdatesPanel()` (lines 5613–5726)
- `renderWeeklyStats()` (lines 5727–5800)
- Related rendering helpers

- [ ] **Step 2: Update main.ts + verify + commit**

```bash
npx tsc --noEmit && npm test
git add src/recent-updates.ts src/main.ts
git commit -m "refactor: extract recent-updates.ts from main.ts (~250 lines)"
```

---

### Task 15: Extract `update.ts`

**Files:**
- Create: `src/update.ts`
- Modify: `src/main.ts` (update checking section)

- [ ] **Step 1: Create `src/update.ts`**

Move:
- `checkForUpdate()` function
- `installUpdate()` function
- Update-related event listeners
- `pendingAppUpdate`, `appUpdateLastError`, `appUpdateManualDownloadUrl` state (or import from state.ts)

- [ ] **Step 2: Update main.ts + verify + commit**

```bash
npx tsc --noEmit && npm test
git add src/update.ts src/main.ts
git commit -m "refactor: extract update.ts from main.ts (~100 lines)"
```

---

### Task 16: Finalize `main.ts` — entry point cleanup

**Files:**
- Modify: `src/main.ts`

- [ ] **Step 1: Verify main.ts is now only ~200 lines**

After all extractions, `main.ts` should contain only:
1. CSS import (`import "./styles.css"`)
2. Module imports from all 15 extracted files
3. DOM element queries (lines 3120–3350)
4. `setCurrentTab()` function
5. `init()` function that registers event listeners
6. Bottom event delegation block

- [ ] **Step 2: Full verification**

Run: `npx tsc --noEmit`
Run: `npm test`
Run: `npm run build`
Expected: All pass.

- [ ] **Step 3: Commit**

```bash
git add src/main.ts
git commit -m "refactor: finalize main.ts as thin entry point (~200 lines)"
```

---

## Rust Backend Extraction Tasks

### Task 17: Extract Rust `types.rs` + `config.rs`

**Files:**
- Create: `src-tauri/src/types.rs`
- Create: `src-tauri/src/config.rs`
- Modify: `src-tauri/src/lib.rs`

- [ ] **Step 1: Create `src-tauri/src/types.rs`**

Extract shared structs from lib.rs lines 1–~100 (before Paper QA structs):
- `ApiEnvelope<T>` struct
- Config-related structs
- Common helper structs used across multiple command groups

```rust
// src-tauri/src/types.rs
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ApiEnvelope<T> {
    pub code: i32,
    pub data: Option<T>,
    #[serde(default)]
    pub msg: Option<String>,
}
// ... (other shared types)
```

- [ ] **Step 2: Create `src-tauri/src/config.rs`**

Extract config loading functions and path helpers:
```rust
// src-tauri/src/config.rs
use anyhow::Context;
use std::path::{Path, PathBuf};

pub fn get_managed_output_root(...) -> ... { ... }
pub fn load_local_pipeline_config(...) -> ... { ... }
pub fn save_local_pipeline_config(...) -> ... { ... }
// ... (config-related functions)
```

- [ ] **Step 3: Update `src-tauri/src/lib.rs`**

Add at top:
```rust
mod types;
mod config;
```

Remove moved code. Replace with `use crate::types::*;` and `use crate::config::*;` where needed (or use qualified paths).

- [ ] **Step 4: Rust compile check**

Run: `cargo check --manifest-path src-tauri/Cargo.toml 2>&1 | tail -20`
Expected: Compiles clean.

- [ ] **Step 5: Run Rust tests**

Run: `cargo test --manifest-path src-tauri/Cargo.toml`
Expected: All tests pass.

- [ ] **Step 6: Commit**

```bash
git add src-tauri/src/types.rs src-tauri/src/config.rs src-tauri/src/lib.rs
git commit -m "refactor: extract Rust types.rs and config.rs from lib.rs"
```

---

### Task 18: Extract Rust `paper_qa_types.rs` + `paper_qa_commands.rs`

**Files:**
- Create: `src-tauri/src/paper_qa_types.rs`
- Create: `src-tauri/src/paper_qa_commands.rs`
- Modify: `src-tauri/src/lib.rs`

- [ ] **Step 1: Identify exact line boundaries**

```bash
# Paper QA structs: lines 547–872
# Paper QA commands: lines 2310–4803
```

- [ ] **Step 2: Create `src-tauri/src/paper_qa_types.rs`**

Copy Paper QA structs (lines 547–872):
- `PaperQaConvertRequest`
- `PaperQaConvertResponse`
- `PaperQaPaperFile`
- `PaperQaGenerateRequest`
- `PaperQaGenerateResponse`
- `PaperQaBatchSaveRequest`
- etc.

Add `use` statements for serde and any shared types from `crate::types`.

- [ ] **Step 3: Create `src-tauri/src/paper_qa_commands.rs`**

Copy Paper QA command functions (lines 2310–4803). This is the largest module (~2500 lines).

```rust
// src-tauri/src/paper_qa_commands.rs
use crate::paper_qa_types::*;
use crate::types::*;
// ... (other imports)

#[tauri::command]
pub async fn convert_paper_files(...) -> Result<..., String> { ... }

#[tauri::command]
pub async fn generate_paper_qa(...) -> Result<..., String> { ... }

// ... (~15 commands)
```

- [ ] **Step 4: Update `src-tauri/src/lib.rs`**

Add:
```rust
mod paper_qa_types;
mod paper_qa_commands;
```

Update `generate_handler![]` to use module-qualified paths:
```rust
paper_qa_commands::convert_paper_files,
paper_qa_commands::generate_paper_qa,
paper_qa_commands::save_paper_qa_batch,
// ...
```

Remove the original Paper QA code.

- [ ] **Step 5: Rust compile check + tests**

Run: `cargo check --manifest-path src-tauri/Cargo.toml 2>&1 | tail -30`
Run: `cargo test --manifest-path src-tauri/Cargo.toml`

- [ ] **Step 6: Commit**

```bash
git add src-tauri/src/paper_qa_types.rs src-tauri/src/paper_qa_commands.rs src-tauri/src/lib.rs
git commit -m "refactor: extract paper_qa_types.rs and paper_qa_commands.rs from lib.rs"
```

---

### Task 19: Extract Rust `platform_types.rs` + `platform_commands.rs`

**Files:**
- Create: `src-tauri/src/platform_types.rs`
- Create: `src-tauri/src/platform_commands.rs`
- Modify: `src-tauri/src/lib.rs`

- [ ] **Step 1: Create `src-tauri/src/platform_types.rs`**

Copy platform API structs (lines 873–1087):
- `PlatformLoginResponse`
- `PlatformImportBatchSummary`
- `PlatformImportBatchItem`
- etc.

- [ ] **Step 2: Create `src-tauri/src/platform_commands.rs`**

Copy platform command functions (lines 1008–1688, 1933–2308):
- `check_platform_health`
- `login_platform`
- `list_platform_import_batches`
- `get_platform_import_batch_detail`
- `upload_qa_batch`
- `get_qa_batch_platform_statuses`
- `get_platform_news`
- `get_dashboard_overview`
- `get_platform_stats`
- `get_exports_stats`
- `get_generate_models`
- etc.

Update `generate_handler![]` paths in lib.rs.

- [ ] **Step 3: Verify + commit**

```bash
cargo check --manifest-path src-tauri/Cargo.toml && cargo test --manifest-path src-tauri/Cargo.toml
git add src-tauri/src/platform_types.rs src-tauri/src/platform_commands.rs src-tauri/src/lib.rs
git commit -m "refactor: extract platform_types.rs and platform_commands.rs from lib.rs"
```

---

### Task 20: Extract remaining Rust modules (`chat_qa.rs`, `news_dashboard.rs`, `feedback.rs`, `keychain.rs`) + finalize

**Files:**
- Create: `src-tauri/src/chat_qa.rs`
- Create: `src-tauri/src/news_dashboard.rs`
- Create: `src-tauri/src/feedback.rs`
- Create: `src-tauri/src/keychain.rs`
- Modify: `src-tauri/src/lib.rs`

- [ ] **Step 1: Extract `chat_qa.rs` (lines 4804–4918)**

Move `send_chat_message` + `send_chat_message_stream` + `push_chat_conversations` + SSE logic.

```rust
// src-tauri/src/chat_qa.rs
use crate::types::*;
// ...

#[tauri::command]
pub async fn send_chat_message(...) -> Result<ChatSendResponse, String> { ... }

#[tauri::command]
pub async fn send_chat_message_stream(...) -> Result<ChatSendResponse, String> { ... }

#[tauri::command]
pub async fn push_chat_conversations(...) -> Result<..., String> { ... }
```

- [ ] **Step 2: Extract `news_dashboard.rs` (lines 873–1780)**

Move news, dashboard, password change, logout commands.

- [ ] **Step 3: Extract `feedback.rs` (lines 1781–2309)**

Move model changelog + feedback commands.

- [ ] **Step 4: Extract `keychain.rs` (lines 4955–5017)**

Move `store_platform_password` + `load_platform_password`.

```rust
// src-tauri/src/keychain.rs
#[tauri::command]
pub fn store_platform_password(platform_url: String, username: String, password: String) -> Result<(), String> {
    let entry = keyring::Entry::new("distill-studio", &format!("{}/{}", platform_url, username))
        .map_err(|e| format!("keyring error: {}", e))?;
    entry.set_password(&password).map_err(|e| format!("keyring error: {}", e))
}

#[tauri::command]
pub fn load_platform_password(platform_url: String, username: String) -> Result<Option<String>, String> {
    let entry = keyring::Entry::new("distill-studio", &format!("{}/{}", platform_url, username))
        .map_err(|e| format!("keyring error: {}", e))?;
    match entry.get_password() {
        Ok(pw) => Ok(Some(pw)),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(e) => Err(format!("keyring error: {}", e)),
    }
}
```

- [ ] **Step 5: Finalize `lib.rs`**

`lib.rs` should now be ~100 lines containing:
1. Re-exported `use` from external crates (shared across modules)
2. `mod` declarations for all 10 module files
3. `generate_handler![]` macro with fully qualified command paths
4. `#[cfg(test)] mod tests` module (or move to individual modules)

```rust
// src-tauri/src/lib.rs (~100 lines)
mod types;
mod config;
mod paper_qa_types;
mod paper_qa_commands;
mod platform_types;
mod platform_commands;
mod chat_qa;
mod news_dashboard;
mod feedback;
mod keychain;

// Re-exports for generate_handler!
use types::*;
use config::*;
use paper_qa_commands::*;
use platform_commands::*;
use chat_qa::*;
use news_dashboard::*;
use feedback::*;
use keychain::*;

// ... (the main fn with generate_handler![] remains)
```

- [ ] **Step 6: Full verification**

```bash
cargo check --manifest-path src-tauri/Cargo.toml 2>&1 | tail -10
cargo test --manifest-path src-tauri/Cargo.toml
npm test
npx tsc --noEmit
```

Expected: All pass. No new warnings.

- [ ] **Step 7: Final commit**

```bash
git add src-tauri/src/
git commit -m "refactor: finalize Rust module split — lib.rs ~100 lines"
```

---

## Final Verification Checklist

After all 20 tasks complete:

- [ ] `npx tsc --noEmit` — no new errors beyond pre-existing baseline
- [ ] `npm test` — all 17 vitest tests pass
- [ ] `cargo check --manifest-path src-tauri/Cargo.toml` — compiles clean
- [ ] `cargo test --manifest-path src-tauri/Cargo.toml` — all Rust tests pass
- [ ] `npm run build` — frontend builds successfully
- [ ] `npm run tauri:dev` — application launches and renders correctly
- [ ] Manual smoke test: switch tabs, run pipeline, chat QA, Paper QA, settings, platform
- [ ] `git diff --stat main` shows ~27 files changed (15 new TS + 11 new Rust + 2 modified originals)

