# Modularization of monolithic `main.ts` and `lib.rs`

> **Context:** v0.1.9 code review finding #1 — the two monolithic files (`src/main.ts` 9545 lines, `src-tauri/src/lib.rs` 5043 lines) represent a maintenance burden. This spec defines the file-split strategy.

## Goals

- Reduce the largest files from 5000–9500 lines to average ~500 lines
- Maintain all existing functionality (no behavioral changes)
- Enable future work: independent feature files reduce merge conflicts and improve navigability
- No tooling changes: keep vanilla TypeScript + Tauri v2 build system

## Non-goals

- No framework migration (no React/Vue/Svelte)
- No architectural overhaul of global state pattern
- No build system changes (keep Vite with--Tauri, single-bundle output)

---

## Strategy

**Self-contained feature files** — each file owns its types, state access, rendering, and event handlers for one functional domain. Shared concerns (types, translations, utilities, HTML template, global state) are extracted to dedicated files. Feature files import from shared files but not from each other (except via shared state).

**Incremental extraction** — move code block by block. After each file is extracted, the app must compile and run. No "big bang" merge.

---

## Frontend Split (`src/main.ts` → 16 files)

| File | Source (lines) | Est. lines | Responsibility |
|------|----------------|------------|----------------|
| `main.ts` | ~9400–9545 | ~200 | Entry: import all modules, register event listeners, call `init()` |
| `types.ts` | 1–464 | ~470 | All TypeScript type/interface definitions |
| `constants.ts` | 465–1114 | ~200 | Const values, storage keys, `PROVIDER_PRESETS` |
| `translations.ts` | 1116–2480, 3352–3443 | ~1200 | `zh`/`en` translation objects + `t()` and helpers |
| `utils.ts` | 4672–4714, 4140–4200, 4641–4662 | ~300 | `escapeHtml()`, `formatDuration()`, `formatRate()`, `formatCount()`, label helpers |
| `html-template.ts` | 2480–3020 | ~540 | `app.innerHTML` template literal |
| `state.ts` | 2197–2485 | ~200 | All global `let` variables |
| `provider.ts` | 4412–4640, 3789–3819, 1090–1115 | ~400 | Provider presets, model resolution, `applyProviderPreset()`, `syncProviderFieldVisibility()` |
| `paper-qa.ts` | 3531–3920, 3691–3738, 3821–3900 | ~600 | Paper QA: file management, convert, generate, upload |
| `chat-qa.ts` | 5808–~7500 | ~1700 | Chat QA: session management, SSE streaming, rendering |
| `browse-qa.ts` | 4161–4380, 4972–5080 | ~700 | Browse QA: batch listing, review, merge, virtual batch |
| `settings.ts` | 3511–3525, ~4300–~4700, ~5400–~5500 | ~550 | Settings panel + pipeline config persistence + Feedback |
| `platform.ts` | 5084–5560, 5118–5520 | ~1100 | Platform auth, import, Model Trial, QA Evaluate |
| `topic-pipeline.ts` | 3443–3525, 3990–4117, 4600–4900 | ~1000 | Topic form, research field modal, pipeline run, run stats |
| `recent-updates.ts` | 5613–5800 | ~250 | Recent Updates panel |
| `update.ts` | scattered ~100 lines | ~100 | App update check |

**Total:** 9545 lines → ~200 + ~470 + ~200 + ~1200 + ~300 + ~540 + ~200 + ~400 + ~600 + ~1700 + ~700 + ~550 + ~1100 + ~1000 + ~250 + ~100 = ~9510 lines (negligible overhead from imports/exports)

### Dependency graph

```
main.ts imports all modules
├── state.ts        (no deps)
├── types.ts        (no deps)
├── constants.ts    (no deps)
├── translations.ts (→ types.ts)
├── utils.ts        (→ constants.ts, translations.ts, types.ts)
├── html-template.ts (→ translations.ts)
├── provider.ts     (→ types.ts, constants.ts, state.ts, utils.ts)
├── paper-qa.ts     (→ state.ts, provider.ts, utils.ts, translations.ts)
├── chat-qa.ts      (→ state.ts, provider.ts, utils.ts, translations.ts)
├── browse-qa.ts    (→ state.ts, utils.ts, translations.ts, provider.ts)
├── settings.ts     (→ state.ts, provider.ts, utils.ts, translations.ts)
├── platform.ts     (→ state.ts, utils.ts, translations.ts)
├── topic-pipeline.ts (→ state.ts, provider.ts, utils.ts, translations.ts)
├── recent-updates.ts (→ state.ts, utils.ts, translations.ts)
└── update.ts       (→ state.ts)
```

Feature files access global state via the `state.ts` module. They do NOT import each other directly. Cross-feature interactions (e.g., switching tabs clears platform state) remain via `setCurrentTab()` in `main.ts`.

---

## Rust Backend Split (`src-tauri/src/lib.rs` → 11 files)

| File | Source (lines) | Est. lines | Responsibility |
|------|----------------|------------|----------------|
| `lib.rs` | — | ~50 | `mod` declarations + `generate_handler![]` macro |
| `types.rs` | 1–546 (partial) | ~100 | Shared structs: `ApiEnvelope<T>`, config types |
| `config.rs` | scattered | ~200 | Config loading, storage paths, managed output root |
| `paper_qa_types.rs` | 547–872 | ~330 | Paper QA request/response structs |
| `paper_qa_commands.rs` | 2310–4803 | ~2500 | Paper QA commands (~15 `#[tauri::command]`) |
| `platform_types.rs` | 873–1087 | ~220 | Platform API response structs |
| `platform_commands.rs` | 1008–1688, 1933–2308 | ~1100 | Platform commands: login, import, list, upload |
| `chat_qa.rs` | 4804–5043 | ~250 | `send_chat_message` + SSE streaming |
| `news_dashboard.rs` | 873–1087, 1088–1780 | ~700 | News, dashboard, password change, logout |
| `feedback.rs` | 1781–2309 | ~530 | Model changelog + feedback submission |
| `keychain.rs` | new (end of file) | ~50 | `store_platform_password`, `load_platform_password` |

**Total:** 5043 lines → ~6030 lines (~20% overhead from module scaffolding and re-exports; `paper_qa_commands.rs` is the bulk at 2500)

### Key Rust considerations

- `pub(crate)` visibility for items consumed across modules
- `generate_handler![]` macro stays in `lib.rs` and references commands via module paths (e.g., `paper_qa_commands::convert_paper_files`)
- `use` statements move to their respective module files
- `#[cfg(test)] mod tests` stays co-located with the code it tests in each module
- `paper_qa_commands.rs` remains large (~2500 lines) but tightly coupled — further split deferred

---

## Implementation Order

Each step produces a working build:

1. Extract `types.ts` — zero logic, pure type move
2. Extract `constants.ts` — zero logic, pure const move
3. Extract `state.ts` — global variables + `export`/import
4. Extract `translations.ts` — translation objects + `t()` function
5. Extract `utils.ts` — utility functions (`escapeHtml`, formatters, labels)
6. Extract `html-template.ts` — the `app.innerHTML` template
7. Extract `provider.ts` — provider preset system
8. Extract `paper-qa.ts` — Paper QA feature
9. Extract `chat-qa.ts` — Chat QA feature
10. Extract `browse-qa.ts` — Browse QA feature
11. Extract `settings.ts` — Settings + Feedback
12. Extract `platform.ts` — Platform integration
13. Extract `topic-pipeline.ts` — Topic form + Pipeline
14. Extract `recent-updates.ts` — Recent Updates
15. Extract `update.ts` — App update check
16. Extract Rust `types.rs` + `config.rs`
17. Extract Rust `paper_qa_types.rs` + `paper_qa_commands.rs`
18. Extract Rust `platform_types.rs` + `platform_commands.rs`
19. Extract Rust `chat_qa.rs`
20. Extract Rust `news_dashboard.rs` + `feedback.rs` + `keychain.rs`

---

## Verification

After each extraction step:
1. `npx tsc --noEmit` — TypeScript type check (pre-existing errors tracked separately)
2. `cargo check --manifest-path src-tauri/Cargo.toml` — Rust compile check
3. `npm run tauri:dev` — manual smoke test of extracted feature

After all extractions:
4. `npm test` — 17 vitest tests pass
5. `cargo test --manifest-path src-tauri/Cargo.toml` — Rust unit tests pass
6. Full feature walkthrough in dev mode
