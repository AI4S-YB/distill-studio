import { t } from "./translations";

export function injectAppHtml(): HTMLElement {
  const app = document.querySelector<HTMLDivElement>("#app");
  if (!app) {
    throw new Error("App root not found");
  }
  app.innerHTML = `
  <main class="app-shell">
    <header class="topbar">
      <div class="topbar-copy">
        <p class="eyebrow" id="eyebrow">Distill Studio</p>
        <h1 id="hero-title">High-throughput QA distillation</h1>
        <p class="lede" id="hero-lede">
          Input one topic statement, pick a provider, and let the Rust pipeline
          expand that into planning and QA generation tasks.
        </p>
      </div>
      <div class="topbar-meta">
        <div class="version-badge" id="app-version-badge">v0.1.6</div>
        <button class="topbar-check-update" type="button" id="check-update">Check Update</button>
        <div class="status-badge" id="status">Idle</div>
        <div class="platform-status-badge" id="platform-status-badge" title="QA Platform"></div>
        <label class="workspace-switch">
          <span id="workspace-switch-label">Workspace</span>
          <select id="topbar-tab-select">
            <option value="recent-updates" id="topbar-tab-option-recent-updates">Recent Updates</option>
            <option value="chat-qa" id="topbar-tab-option-chat-qa">Chat QA</option>
            <option value="topic" id="topbar-tab-option-topic">QA Generation</option>
            <option value="browse" id="topbar-tab-option-browse">Browse QA</option>
            <option value="qa-evaluate" id="topbar-tab-option-qa-evaluate">QA Evaluate</option>
            <option value="model-trial" id="topbar-tab-option-model-trial">Model Trial</option>
            <option value="settings" id="topbar-tab-option-settings">Settings</option>
            <option value="feedback2" id="topbar-tab-option-feedback2">Feedback 2</option>
          </select>
        </label>
        <label class="lang-switch">
          <span id="lang-label">Language</span>
          <select id="lang-select">
            <option value="zh">中文</option>
            <option value="en">English</option>
          </select>
        </label>
      </div>
    </header>
    <section class="workspace">
      <aside class="sidebar panel">
        <div class="tabs" id="tabs">
          <button class="tab-button" type="button" data-tab="recent-updates" id="tab-recent-updates">
            <span class="tab-button-title" id="tab-recent-updates-label">Recent Updates</span>
          </button>
          <button class="tab-button tab-button-plain" type="button" data-tab="paper-qa" id="tab-paper-qa">
            <span class="tab-button-title" id="tab-paper-qa-label">Paper QA</span>
          </button>
          <button class="tab-button" type="button" data-tab="chat-qa" id="tab-chat-qa">
            <span class="tab-button-title" id="tab-chat-qa-label">Chat QA</span>
          </button>
          <button class="tab-button" type="button" data-tab="topic" id="tab-topic">
            <span class="tab-button-title" id="tab-topic-label">Topic</span>
          </button>
          <button class="tab-button" type="button" data-tab="browse" id="tab-browse">
            <span class="tab-button-title" id="tab-browse-label">Browse QA</span>
          </button>
          <button class="tab-button" type="button" data-tab="qa-evaluate" id="tab-qa-evaluate">
            <span class="tab-button-title" id="tab-qa-evaluate-label">QA Evaluate</span>

          </button>
          <button class="tab-button" type="button" data-tab="model-trial" id="tab-model-trial">
            <span class="tab-button-title" id="tab-model-trial-label">Model Trial</span>

          </button>
          <button class="tab-button" type="button" data-tab="settings" id="tab-settings">
            <span class="tab-button-title" id="tab-settings-label">Settings</span>
          </button>
          <div class="tab-separator"></div>
          <button class="tab-button tab-button-plain" type="button" data-tab="feedback2" id="tab-feedback2">
            <span class="tab-button-title" id="tab-feedback2-label">Feedback 2</span>
          </button>
        </div>
      </aside>
      <section class="stage panel">
        <div class="run-lock-banner" id="run-lock-banner" hidden>Run parameters are locked while the pipeline is active. Stop the run before changing them.</div>
        <section class="tab-panel" data-tab-panel="chat-qa" hidden>
          <div class="tab-copy-block">
            <p class="panel-title" id="chat-qa-tab-title">Chat QA</p>
            <p class="panel-copy" id="chat-qa-tab-copy">Send messages to the configured LLM model and get responses.</p>
          </div>
          <section class="chat-qa-panel" id="chat-qa-panel">
            <div class="chat-qa-sessions-bar" id="chat-qa-sessions-bar"></div>
            <div class="chat-qa-model-info" id="chat-qa-model-info"></div>
            <div class="chat-qa-messages" id="chat-qa-messages">
              <div class="chat-qa-empty" id="chat-qa-empty">Send a message to start a conversation.</div>
            </div>
            <div class="chat-qa-input-area">
              <textarea id="chat-qa-input" rows="2" placeholder="Type your message..."></textarea>
              <button class="chat-qa-send-button" type="button" id="chat-qa-send">Send</button>
            </div>
            <div class="chat-qa-error" id="chat-qa-error" hidden></div>
          </section>
        </section>
        <section class="tab-panel" data-tab-panel="topic">
        <div class="tab-copy-block">
          <p class="panel-title" id="topic-tab-title">Research Topic</p>
        </div>
        <label for="prompt" id="topic-prompt-label">Topic prompt</label>
        <textarea id="prompt" rows="7">大豆籽粒油分与蛋白协同改良、种植密度响应、育种策略优化</textarea>
        <div class="mode-panel">
          <div>
            <p class="tag-title" id="qa-mode-label">QA Mode</p>
            <p class="panel-copy" id="qa-mode-hint">
              Normal QA generates standard question-answer pairs. CoT QA generates compact research-planning and decision-oriented answers.
            </p>
          </div>
          <div class="radio-group" id="qa-mode-group">
            <label class="radio-card">
              <input id="qa-mode-normal" type="radio" name="qa-mode" value="normal" checked />
              <span id="qa-mode-normal-label">Normal QA</span>
            </label>
            <label class="radio-card">
              <input id="qa-mode-cot" type="radio" name="qa-mode" value="cot" />
              <span id="qa-mode-cot-label">CoT QA</span>
            </label>
          </div>
        </div>
        <div class="tag-panel">
          <div class="tag-panel-header">
            <div>
              <p class="tag-title" id="topic-tags-label">Domains and Directions</p>
              <p class="panel-copy" id="topic-tags-hint">Select multiple tags or add your own. Selected tags are appended to the effective prompt sent to the model.</p>
            </div>
          </div>
          <div class="selected-tags-block">
            <p class="tag-subtitle" id="selected-tags-label">Selected Tags</p>
            <div class="tag-list selected" id="selected-topic-tags"></div>
          </div>
          <div class="quick-tag-block">
            <div class="tag-subtitle-row">
              <p class="tag-subtitle" id="quick-tags-label">Agriculture and Breeding Quick Tags</p>
              <button id="open-topic-field-selector" type="button">Choose Research Field</button>
            </div>
            <p class="field-hint" id="topic-field-selector-hint">
              Pick level-2 or level-3 fields similar to grant applications or reviewer forms.
            </p>
            <div class="tag-list suggestions" id="topic-tag-suggestions"></div>
          </div>
          <div class="inline-field">
            <input id="topic-tag-input" placeholder="For example: crop breeding, metabolic regulation, disease resistance" />
            <button id="add-topic-tag" type="button">Custom Tag</button>
          </div>
        </div>
        <div class="modal-shell" id="topic-field-modal" hidden>
          <div class="modal-backdrop" data-modal-close="true"></div>
          <div class="modal-panel" role="dialog" aria-modal="true" aria-labelledby="topic-field-modal-title">
            <div class="modal-header">
              <div>
                <p class="panel-title" id="topic-field-modal-title">Choose Research Field</p>
                <p class="panel-copy" id="topic-field-modal-copy">
                  Start with a primary domain, then select level-2 or level-3 directions on the right. You can add multiple tags at once.
                </p>
              </div>
              <button id="close-topic-field-modal" type="button">Close</button>
            </div>
            <div class="field-selector-layout">
              <section class="field-selector-primary">
                <p class="field-selector-label" id="topic-field-primary-title">Primary Domain</p>
                <div class="field-selector-primary-list" id="topic-field-primary-list"></div>
              </section>
              <section class="field-selector-detail">
                <div class="field-selector-section">
                  <div class="field-selector-heading">
                    <p class="field-selector-label" id="topic-field-detail-title">Level-2 / Level-3 Directions</p>
                    <p class="field-selector-meta" id="topic-field-selected-count">0 selected</p>
                  </div>
                  <div class="field-selector-detail-list" id="topic-field-detail-list"></div>
                </div>
                <div class="field-selector-section">
                  <p class="field-selector-label" id="topic-field-pending-title">Pending Tags</p>
                  <div class="tag-list selected" id="topic-field-pending-list"></div>
                </div>
              </section>
            </div>
            <div class="modal-actions">
              <button id="cancel-topic-field-selection" type="button">Cancel</button>
              <button id="confirm-topic-field-selection" class="secondary" type="button">Add Selected Tags</button>
            </div>
          </div>
        </div>
        <section class="topic-run-panel">
          <div class="topic-run-actions">
            <button id="run" class="secondary run-primary" type="button">Run pipeline</button>
            <button id="open-run-output-dir" type="button" disabled>Open Output Folder</button>
          </div>
          <div class="run-mode-block">
            <p class="field-label-inline" id="managed-run-mode-label">Run Mode</p>
            <div class="radio-group">
              <label class="radio-card">
                <input id="managed-run-mode-new" type="radio" name="managed-run-mode" value="new" checked />
                <span id="managed-run-mode-new-label">New Run</span>
              </label>
              <label class="radio-card">
                <input id="managed-run-mode-resume-latest" type="radio" name="managed-run-mode" value="resume-latest" />
                <span id="managed-run-mode-resume-latest-label">Continue Current Run</span>
              </label>
            </div>
            <p class="field-hint" id="managed-run-mode-hint"></p>
            <label class="managed-run-picker">
              <span id="managed-run-pick-label">Pick History Run</span>
              <select id="managed-run-pick"></select>
              <small class="field-hint" id="managed-run-pick-hint"></small>
            </label>
            <div class="managed-run-banner" id="managed-run-banner" hidden>
              <p class="field-hint managed-run-banner-copy" id="managed-run-mode-current"></p>
              <button id="clear-managed-resume-batch" type="button">Start as New Run</button>
            </div>
          </div>
          <section class="run-stats-panel">
            <div class="panel-header">
              <p class="panel-title run-stats-title" id="run-stats-title">Run Stats</p>
            </div>
            <div class="run-stats-grid" id="run-stats-grid"></div>
          </section>
          <section class="topic-log-panel">
            <div class="panel-header">
              <p class="panel-title run-status-title" id="run-logs-title">Run Logs</p>
              <div class="panel-header-actions">
                <button id="export-logs" class="secondary" type="button">Export Logs</button>
                <div class="progress-summary">
                  <div class="progress-meta" id="progress-meta">0 / 5</div>
                  <div class="progress-detail" id="progress-detail"></div>
                </div>
              </div>
            </div>
            <div class="progress-track">
              <div class="progress-fill" id="progress-fill"></div>
            </div>
            <pre id="logs">No run yet.</pre>
          </section>
        </section>
      </section>
      <section class="tab-panel" data-tab-panel="recent-updates" hidden>
        <div class="tab-copy-block">
          <p class="panel-title" id="recent-updates-title">Recent Updates</p>
        </div>
        <section class="recent-updates-panel" id="recent-updates-panel"></section>
      </section>
      <section class="tab-panel" data-tab-panel="settings" hidden>
        <div class="tab-copy-block">
          <div class="title-with-meta">
            <p class="panel-title" id="settings-tab-title">Settings</p>
            <span class="panel-meta-badge" id="settings-version">Current version: v0.1.6</span>
          </div>
          <p class="panel-copy" id="settings-basic-copy">Most users only need to choose a provider, model, and API key.</p>
        </div>

        <!-- Platform -->
        <div class="section-block">
          <p class="section-title" id="integration-section-title">Platform</p>
        </div>
        <div class="platform-settings-card">
          <div class="platform-env-row">
            <span class="platform-env-label" id="qa-platform-env-label">QA Platform</span>
            <div class="platform-env-options">
              <label class="radio-card platform-env-radio">
                <input id="qa-platform-dev" type="radio" name="qa-platform-env" value="dev" />
                <span id="qa-platform-dev-label">127.0.0.1 (Dev)</span>
              </label>
              <label class="radio-card platform-env-radio">
                <input id="qa-platform-prod" type="radio" name="qa-platform-env" value="prod" checked />
                <span id="qa-platform-prod-label">182.92.166.143 (Prod)</span>
              </label>
            </div>
          </div>
          <div class="platform-credentials-row">
            <label class="platform-cred-field">
              <span id="qa-platform-username-label">Username</span>
              <input id="qa-platform-username" placeholder="your-account" />
            </label>
            <label class="platform-cred-field">
              <span id="qa-platform-password-label">Password</span>
              <input id="qa-platform-password" type="password" />
            </label>
          </div>
          <div class="platform-actions-row">
            <button type="button" class="platform-login-button" id="platform-login-button">Login</button>
            <div class="platform-login-status" id="platform-login-status">○ Not logged in</div>
          </div>
          <div id="platform-account-card"></div>
          <div id="password-change-form-container" hidden></div>
        </div>

        <!-- Model Configuration -->
        <div class="section-block">
          <p class="section-title" id="model-section-title">Model Configuration</p>
        </div>
        <div class="grid three">
          <label>
            <div class="field-label-row">
              <span id="provider-preset-label">Model Provider</span>
              <button class="field-help-button" data-help-key="provider_preset" type="button">?</button>
            </div>
            <select id="provider-preset">
              <option id="provider-preset-option-custom" value="custom">Custom</option>
              <option id="provider-preset-option-qwen" value="qwen_dashscope">Qwen / DashScope</option>
              <option id="provider-preset-option-deepseek" value="deepseek">DeepSeek</option>
              <option id="provider-preset-option-moonshot" value="moonshot_kimi">Kimi / Moonshot</option>
              <option id="provider-preset-option-zhipu" value="zhipu_glm">Zhipu GLM</option>
              <option id="provider-preset-option-minimax" value="minimax">MiniMax</option>
              <option id="provider-preset-option-hunyuan" value="tencent_hunyuan">Tencent Hunyuan</option>
              <option id="provider-preset-option-qianfan" value="baidu_qianfan">Baidu Qianfan</option>
              <option id="provider-preset-option-stub" value="stub_local" hidden>Stub Local Test</option>
              <option id="provider-preset-option-platform" value="platform" hidden>Platform Model</option>
            </select>
          </label>
          <label id="provider-field" hidden>
            <div class="field-label-row">
              <span id="provider-label">Adapter Type</span>
            </div>
            <select id="provider">
              <option value="openai-compatible" selected>openai-compatible</option>
              <option value="stub" hidden>stub</option>
            </select>
          </label>
          <label>
            <div class="field-label-row">
              <span id="model-label">Model</span>
              <button class="field-help-button" data-help-key="model" type="button">?</button>
            </div>
            <select id="model"></select>
          </label>
          <label id="custom-model-field" hidden>
            <div class="field-label-row">
              <span id="custom-model-label">Custom Model</span>
            </div>
            <input id="custom-model" placeholder="例如 glm-5.1" />
          </label>
        </div>
        <div class="grid two">
          <label>
            <div class="field-label-row">
              <span id="base-url-label">Base URL</span>
              <button class="field-help-button" data-help-key="base_url" type="button">?</button>
            </div>
            <input id="base-url" placeholder="https://api.openai.com/v1" />
          </label>
          <label>
            <div class="field-label-row">
              <span id="api-key-label">API key</span>
              <button class="field-help-button" data-help-key="api_key" type="button">?</button>
            </div>
            <div class="inline-field">
              <input id="api-key" type="password" />
              <button id="toggle-api-key-visibility" type="button">Show</button>
            </div>
          </label>
        </div>

        <!-- Advanced Settings (collapsed) -->
        <details class="advanced-settings" id="advanced-settings">
          <summary id="advanced-settings-summary">Advanced Settings</summary>
          <p class="panel-copy advanced-settings-copy" id="advanced-settings-copy">
            Ordinary users can usually keep the defaults here.
          </p>

          <!-- Output Directory -->
          <div class="section-block">
            <p class="section-title" id="output-section-title">Output Directory</p>
          </div>
          <div class="grid two">
            <label class="output-root-field">
              <div class="field-label-row">
                <span id="output-root-label">Output Directory</span>
              </div>
              <input id="output-root" />
              <small class="field-hint" id="output-root-hint">
                Choose the root folder used for generated runs and history. The app still creates one subfolder per run inside it.
              </small>
            </label>
            <div class="output-root-actions">
              <button id="select-output-root" type="button">Choose Folder</button>
              <button id="open-output-root" class="secondary" type="button">Open Output Directory</button>
              <button id="reset-output-root" class="secondary" type="button">Restore Default</button>
            </div>
          </div>

          <!-- Runtime Parameters -->
          <div class="section-block">
            <p class="section-title" id="runtime-section-title">Runtime Parameters</p>
            <p class="field-hint runtime-constraint-hint" id="runtime-constraint-hint"></p>
          </div>
          <div class="grid four">
            <label>
              <div class="field-label-row">
                <span id="target-count-label">Target count</span>
                <button class="field-help-button" data-help-key="target_count" type="button">?</button>
              </div>
              <input id="target-count" type="number" value="10000" />
            </label>
            <label>
              <div class="field-label-row">
                <span id="plan-limit-label">Plan limit</span>
                <button class="field-help-button" data-help-key="plan_limit" type="button">?</button>
              </div>
              <input id="plan-limit" type="number" value="1200" />
            </label>
            <label>
              <div class="field-label-row">
                <span id="shard-size-label">Shard size</span>
                <button class="field-help-button" data-help-key="shard_size" type="button">?</button>
              </div>
              <input id="shard-size" type="number" value="1000" />
            </label>
            <label>
              <div class="field-label-row">
                <span id="batch-size-label">Batch size</span>
                <button class="field-help-button" data-help-key="batch_size" type="button">?</button>
              </div>
              <input id="batch-size" type="number" value="8" />
            </label>
          </div>
          <div class="grid four">
            <label>
              <div class="field-label-row">
                <span id="max-in-flight-label">Max in flight</span>
                <button class="field-help-button" data-help-key="max_in_flight" type="button">?</button>
              </div>
              <input id="max-in-flight" type="number" value="4" />
            </label>
            <label>
              <div class="field-label-row">
                <span id="max-retries-label">Max retries</span>
                <button class="field-help-button" data-help-key="max_retries" type="button">?</button>
              </div>
              <input id="max-retries" type="number" value="3" />
            </label>
            <label>
              <div class="field-label-row">
                <span id="request-timeout-secs-label">Timeout secs</span>
                <button class="field-help-button" data-help-key="timeout_secs" type="button">?</button>
              </div>
              <input id="request-timeout-secs" type="number" value="120" />
            </label>
            <label>
              <div class="field-label-row">
                <span id="resume-label">Resume existing shards</span>
                <button class="field-help-button" data-help-key="resume_existing" type="button">?</button>
              </div>
              <input id="resume" type="checkbox" checked />
            </label>
          </div>

          <!-- CoT Structure -->
          <div class="section-block">
            <p class="section-title" id="cot-structure-section-title">CoT Structure</p>
          </div>
          <div class="grid one">
            <label>
              <div class="field-label-row">
                <span id="cot-section-headers-label">CoT Section Headers</span>
              </div>
              <textarea id="cot-section-headers" rows="8"></textarea>
              <small class="field-hint" id="cot-section-headers-hint">
                One section header per line. The runtime will use these lines to build the CoT answer format.
              </small>
            </label>
          </div>

          <!-- Literature API -->
          <div class="section-block">
            <p class="section-title" id="literature-section-title">Literature API</p>
          </div>
          <div class="grid two">
            <label>
              <div class="field-label-row">
                <span id="literature-api-url-label">Literature API URL</span>
                <button class="field-help-button" data-help-key="literature_api_url" type="button">?</button>
              </div>
              <input id="literature-api-url" placeholder="https://example.com/literature/api" />
            </label>
            <label>
              <div class="field-label-row">
                <span id="literature-api-auth-label">Literature API Auth Token</span>
                <button class="field-help-button" data-help-key="literature_api_auth" type="button">?</button>
              </div>
              <input id="literature-api-auth" type="password" />
              <small class="field-hint" id="literature-api-auth-hint">
                Authentication token for the literature API, stored in local settings.
              </small>
            </label>
          </div>
        </details>
      </section>
      <section class="tab-panel" data-tab-panel="qa-evaluate" hidden>
        <div class="tab-copy-block">
          <p class="panel-title" id="qa-evaluate-tab-title">QA Evaluate</p>
          <p class="panel-copy" id="qa-evaluate-tab-copy">Check platform reachability, verify sign-in, and open the QA evaluation workspace.</p>
        </div>
        <section class="platform-panel" id="qa-evaluate-panel"></section>
      </section>
      <section class="tab-panel" data-tab-panel="model-trial" hidden>
        <div class="tab-copy-block">
          <p class="panel-title" id="model-trial-tab-title">Model Trial</p>
          <p class="panel-copy" id="model-trial-tab-copy">This version keeps model trial as a platform entry: check connectivity, confirm sign-in, then open the platform side.</p>
        </div>
        <section class="platform-panel" id="model-trial-panel"></section>
      </section>
      <section class="tab-panel" data-tab-panel="browse" hidden>
        <div class="tab-copy-block">
          <p class="panel-title" id="browse-tab-title">Browse QA</p>
        </div>
        <section class="browse-shell browse-panel">
          <div class="browse-header">
            <button class="browse-back-button" id="browse-back" type="button" hidden>Back</button>
            <div class="browse-header-copy">
              <p class="panel-title browse-panel-title" id="browse-view-title">Batch Runs</p>
              <p class="panel-copy browse-view-meta" id="browse-view-meta"></p>
            </div>
          </div>
          <div id="browse-content"></div>
        </section>
      </section>
      <section class="tab-panel" data-tab-panel="feedback2" hidden>
        <div class="tab-copy-block">
          <p class="panel-title" id="feedback2-panel-title">Feedback 2</p>
        </div>
        <div class="feedback2-panel" id="feedback2-panel">
          <div class="feedback2-section">
            <h3 id="feedback2-email-title">Email</h3>
            <p class="feedback2-hint" id="feedback2-email-hint">Send email directly to describe your suggestions or issues.</p>
            <a href="mailto:zhengyi@yzwlab.cn" class="feedback2-button" target="_blank" id="feedback2-email-link">Send Email</a>
          </div>
          <div class="feedback2-section">
            <h3 id="feedback2-github-title">GitHub Issue</h3>
            <p class="feedback2-hint" id="feedback2-github-hint">Create an issue in the project GitHub repository.</p>
            <button class="feedback2-button" data-feedback2-action="github" id="feedback2-github-button">Submit GitHub Issue</button>
          </div>
          <div class="feedback2-section">
            <h3 id="feedback2-form-title">Feedback Form</h3>
            <p class="feedback2-hint" id="feedback2-form-hint">Login to submit feedback to the platform.</p>
            <p class="feedback2-login-required" id="feedback2-login-required">Login to QA platform first to submit feedback via form.</p>
            <form class="feedback2-form" id="feedback2-form" hidden>
              <label>
                <span id="feedback2-title-label">Title</span>
                <input id="feedback2-title" placeholder="Brief description" required />
              </label>
              <label>
                <span id="feedback2-content-label">Details</span>
                <textarea id="feedback2-content" rows="4" placeholder="Describe in detail..." required></textarea>
              </label>
              <label>
                <span id="feedback2-category-label">Category</span>
                <select id="feedback2-category">
                  <option value="feature" id="feedback2-cat-feature">Feature Request</option>
                  <option value="bug" id="feedback2-cat-bug">Bug Report</option>
                  <option value="other" id="feedback2-cat-other">Other</option>
                </select>
              </label>
              <button type="submit" class="feedback2-submit-button" id="feedback2-submit-button">Submit</button>
              <p class="feedback2-success" id="feedback2-success" hidden>Feedback submitted successfully!</p>
              <p class="feedback2-error" id="feedback2-form-error" hidden></p>
            </form>
          </div>
        </div>
      </section>
      <section class="tab-panel" data-tab-panel="paper-qa" hidden>
        <div class="tab-copy-block">
          <p class="panel-title" id="paper-qa-tab-title">Paper QA</p>
          <p class="panel-copy" id="paper-qa-tab-copy">Convert PDF papers to markdown, chunk them, and generate QA pairs.</p>
        </div>
        <div class="paper-qa-panel" id="paper-qa-panel">
          <div class="platform-inline-banner error" id="paper-qa-error-banner" hidden></div>
          <div class="platform-inline-banner success" id="paper-qa-success-banner" hidden></div>
          <div class="paper-qa-toolbar">
            <button class="paper-qa-toolbar-button" type="button" id="paper-qa-add-btn">${t("paper_qa_add")}</button>
            <button class="paper-qa-toolbar-button paper-qa-toolbar-button-primary" type="button" id="paper-qa-convert-btn">${t("paper_qa_convert")}</button>
            <button class="paper-qa-toolbar-button paper-qa-toolbar-button-primary" type="button" id="paper-qa-generate-btn">${t("paper_qa_generate")}</button>
            <div class="paper-qa-cot-ratio">
              <span>${t("paper_qa_cot_ratio")}</span>
              <input type="range" id="paper-qa-cot-ratio" min="0" max="1" step="0.05" value="0.4">
              <span class="paper-qa-cot-ratio-value" id="paper-qa-cot-ratio-value">0.4</span>
            </div>
            <button class="paper-qa-toolbar-button paper-qa-toolbar-button-secondary" type="button" id="paper-qa-save-batch-btn">${t("paper_qa_save_batch")}</button>
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
              <div id="paper-qa-progress" class="paper-qa-progress" hidden>
                <div class="paper-qa-progress-bar" id="paper-qa-progress-bar"></div>
                <div class="paper-qa-progress-text" id="paper-qa-progress-text"></div>
              </div>
              <div id="paper-qa-results">
                <div class="paper-qa-empty">${t("paper_qa_empty")}</div>
              </div>
              <div class="paper-qa-log" id="paper-qa-log" hidden></div>
              <div class="paper-qa-stats" id="paper-qa-stats" hidden></div>
            </div>
          </div>
        </div>
      </section>
      </section>
      <aside class="inspector" hidden>
        <section class="panel result-panel">
          <div class="result-header">
            <div>
              <p class="panel-title" id="result-title">Current Result</p>
            </div>
            <div class="result-mode" id="result-mode">Idle</div>
          </div>
          <div class="result-cards" id="result-cards"></div>
          <div class="result-actions" id="result-actions"></div>
          <details class="raw-output" id="output-details">
            <summary id="raw-output-summary">Raw JSON</summary>
            <pre id="output">No preview yet.</pre>
          </details>
        </section>
      </aside>
    </section>
    <div class="modal-shell" id="first-launch-modal" hidden>
      <div class="modal-backdrop" data-first-launch-close="true"></div>
      <div class="modal-panel first-launch-panel" role="dialog" aria-modal="true" aria-labelledby="first-launch-title">
        <div class="modal-header">
          <div>
            <p class="panel-title" id="first-launch-title">Welcome to QA小灶</p>
            <p class="panel-copy" id="first-launch-copy"></p>
          </div>
        </div>
        <div class="first-launch-grid" id="first-launch-grid"></div>
        <section class="first-launch-note">
          <p class="section-title" id="first-launch-note-title">Note</p>
          <p class="panel-copy first-launch-note-copy" id="first-launch-note-copy"></p>
        </section>
        <div class="modal-actions">
          <button id="first-launch-open-settings" class="secondary" type="button">Open Settings</button>
          <button id="first-launch-confirm" type="button">Got It</button>
        </div>
      </div>
    </div>
  </main>
  `;
  return app;
}
