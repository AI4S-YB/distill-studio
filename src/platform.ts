import { invoke } from "@tauri-apps/api/core";
import type {
  PlatformEndpoints,
  PlatformHealthResponse,
  PlatformLoginResponse,
  TrialLlmConfigOption,
  TrialSessionDetail,
  TrialWorkspaceResponse,
  TrialSessionCreateResponse,
  TrialSendMessageResponse,
  QaRecordSummary,
  QaBatchSummary,
  QaRecordDetail,
} from "./types";
import { state } from "./state";
import { t, formatMessage } from "./translations";
import { escapeHtml, formatPlatformTime } from "./utils";
import {
  loadPlatformGenerateModels,
  updatePlatformPresetOption,
  syncProviderPresetInput,
} from "./provider";
import { renderSetupSummary } from "./topic-pipeline";
import {
  clearBrowsePlatformStatuses,
  clearBrowseRemoteVirtualBatch,
} from "./browse-qa";

// ---- Helpers ----

const DEFAULT_QA_PLATFORM_URL = "http://182.92.166.143";

function qaPlatformUrlInputs() {
  const devInput = document.querySelector<HTMLInputElement>("#qa-platform-dev");
  return { devInput };
}

function getQaPlatformDevInput(): HTMLInputElement | null {
  return document.querySelector<HTMLInputElement>("#qa-platform-dev");
}

function getQaPlatformProdInput(): HTMLInputElement | null {
  return document.querySelector<HTMLInputElement>("#qa-platform-prod");
}

export function currentQaPlatformUrl(): string {
  const devInput = getQaPlatformDevInput();
  const host = devInput?.checked ? "127.0.0.1" : "182.92.166.143";
  return `http://${host}:8100`;
}

export function currentManagedOutputRoot(): string {
  const input = document.querySelector<HTMLInputElement>("#output-root");
  return input?.value.trim() ?? "";
}

export function hasQaPlatformCredentials(): boolean {
  const username = document.querySelector<HTMLInputElement>("#qa-platform-username");
  const password = document.querySelector<HTMLInputElement>("#qa-platform-password");
  return Boolean(username?.value.trim() && password?.value.trim());
}

export function currentPlatformEndpoints(): PlatformEndpoints | null {
  if (state.platformLoginState.kind === "success") {
    return state.platformLoginState.response.endpoints;
  }
  if (state.platformHealthState.kind === "success") {
    return state.platformHealthState.response.endpoints;
  }
  return null;
}

export function currentPlatformOpenUrl(kind: "qa-evaluate" | "model-trial"): string | null {
  const endpoints = currentPlatformEndpoints();
  if (!endpoints) {
    return null;
  }
  if (kind === "model-trial") {
    return `${endpoints.platformWebBaseUrl}/expert/model-trial`;
  }
  return `${endpoints.platformWebBaseUrl}/expert`;
}

export function resetModelTrialState() {
  state.modelTrialWorkspaceLoading = false;
  state.modelTrialDetailLoading = false;
  state.modelTrialCreating = false;
  state.modelTrialSending = false;
  state.modelTrialDeletingSessionId = null;
  state.modelTrialConfigs = [];
  state.modelTrialSessions = [];
  state.modelTrialDetail = null;
  state.modelTrialSelectedConfigId = null;
  state.modelTrialSelectedSessionId = null;
  state.modelTrialComposer = "";
  state.modelTrialErrorMessage = null;
  state.modelTrialNoticeMessage = null;
  state.modelTrialLocalBatches = [];
  state.modelTrialSelectedBatchId = null;
  state.modelTrialLocalQuestions = [];
  state.modelTrialSelectedQuestionId = null;
  state.modelTrialLocalQuestionDetail = null;
  state.modelTrialLocalQuestionsLoading = false;
}

export function resetPlatformIntegrationState() {
  state.platformHealthState = { kind: "idle" };
  state.platformLoginState = { kind: "idle" };
  clearBrowsePlatformStatuses();
  clearBrowseRemoteVirtualBatch();
  resetModelTrialState();
}

export function currentModelTrialSelectedQuestion(): QaRecordSummary | null {
  if (!state.modelTrialSelectedQuestionId) {
    return null;
  }
  return state.modelTrialLocalQuestions.find((item) => item.id === state.modelTrialSelectedQuestionId) ?? null;
}

export function currentModelTrialSelectedConfig(): TrialLlmConfigOption | null {
  return state.modelTrialConfigs.find((item) => item.id === state.modelTrialSelectedConfigId) ?? null;
}

export function renderPlatformStateBlock(
  platformState: typeof state.platformHealthState | typeof state.platformLoginState,
  kind: "health" | "login"
): string {
  if (platformState.kind === "loading") {
    return `<div class="platform-state-card"><p class="platform-state-value">${escapeHtml(
      kind === "health" ? t("platform_health_checking") : t("platform_login_checking")
    )}</p></div>`;
  }
  if (platformState.kind === "error") {
    return `<div class="platform-state-card error"><p class="platform-state-value">${escapeHtml(platformState.message)}</p></div>`;
  }
  if (platformState.kind === "success") {
    if (kind === "health") {
      return `
        <div class="platform-state-card success">
          <p class="platform-state-label">${escapeHtml(t("platform_web_base"))}</p>
          <p class="platform-state-value">${escapeHtml(platformState.response.endpoints.platformWebBaseUrl)}</p>
          <p class="platform-state-label">${escapeHtml(t("platform_api_base"))}</p>
          <p class="platform-state-value">${escapeHtml(platformState.response.endpoints.platformApiBaseUrl)}</p>
        </div>
      `;
    }
    const loginResponse = platformState.response as PlatformLoginResponse;
    const apps = loginResponse.user.applications.length
      ? loginResponse.user.applications.map((item) => item.name).join(" / ")
      : t("platform_no_application");
    return `
      <div class="platform-state-card success">
        <p class="platform-state-label">${escapeHtml(t("platform_current_user"))}</p>
        <p class="platform-state-value">${escapeHtml(loginResponse.user.username)}</p>
        <p class="platform-state-label">${escapeHtml(t("platform_application"))}</p>
        <p class="platform-state-value">${escapeHtml(apps)}</p>
      </div>
    `;
  }
  return `<div class="platform-state-card"><p class="platform-state-value">${escapeHtml(
    kind === "health" ? t("platform_health_idle") : t("platform_login_idle")
  )}</p></div>`;
}

function truncateText(value: string, maxLength: number): string {
  if (!value) return value;
  if (value.length <= maxLength) return value;
  return value.slice(0, maxLength - 1) + "…";
}

export function renderQaEvaluatePanel() {
  const panel = document.querySelector<HTMLElement>("#qa-evaluate-panel");
  if (!panel) return;

  const platformUrl = currentQaPlatformUrl() || DEFAULT_QA_PLATFORM_URL;
  const qaOpenUrl = currentPlatformOpenUrl("qa-evaluate");
  const bannerHtml =
    state.platformLoginState.kind === "error"
      ? `<div class="platform-inline-banner error">${escapeHtml(state.platformLoginState.message)}</div>`
      : state.platformLoginState.kind === "success"
        ? `<div class="platform-inline-banner success">${escapeHtml(
            `${t("platform_login_ok")} ${state.platformLoginState.response.user.username}`
          )}</div>`
        : "";

  const usernameInput = document.querySelector<HTMLInputElement>("#qa-platform-username");

  panel.innerHTML = `
    <div class="model-trial-topbar">
      <div class="model-trial-topbar-item">
        <span class="platform-card-label">${escapeHtml(t("qa_platform_url"))}</span>
        <span class="platform-card-value">${escapeHtml(platformUrl)}</span>
      </div>
      <div class="model-trial-topbar-item">
        <span class="platform-card-label">${escapeHtml(t("platform_current_user"))}</span>
        <span class="platform-card-value">${escapeHtml(
          state.platformLoginState.kind === "success"
            ? state.platformLoginState.response.user.username
            : usernameInput?.value.trim() || t("empty_value")
        )}</span>
      </div>
      <div class="model-trial-topbar-item">
        <span class="platform-card-label">${escapeHtml(t("platform_action_check"))}</span>
        <div class="model-trial-topbar-check">
          <span class="platform-card-value">${escapeHtml(
            state.platformHealthState.kind === "success"
              ? t("platform_health_ok")
              : state.platformHealthState.kind === "error"
                ? t("platform_health_failed")
                : state.platformHealthState.kind === "loading"
                  ? t("platform_health_checking")
                  : t("platform_health_idle")
          )}</span>
          <button type="button" class="secondary" data-platform-action="health">${escapeHtml(t("platform_action_check"))}</button>
        </div>
      </div>
    </div>
    ${bannerHtml}
    <section class="platform-workbench-panel">
      <div class="title-with-meta">
        <p class="section-title">${escapeHtml(t("tab_qa_evaluate"))}</p>
        <p class="model-trial-source-meta">${escapeHtml(t("qa_evaluate_tab_copy"))}</p>
      </div>
      <div class="platform-actions">
        <button type="button" class="secondary" data-platform-action="login">${escapeHtml(t("platform_action_login"))}</button>
        <button type="button" data-platform-action="open-qa" ${qaOpenUrl ? "" : "disabled"}>${escapeHtml(t("platform_action_open_qa"))}</button>
      </div>
    </section>
  `;
}

export function renderModelTrialPanel() {
  const panel = document.querySelector<HTMLElement>("#model-trial-panel");
  if (!panel) return;

  const platformUrl = currentQaPlatformUrl() || DEFAULT_QA_PLATFORM_URL;
  const hasSettings = Boolean(currentQaPlatformUrl() && hasQaPlatformCredentials());
  const selectedConfig = currentModelTrialSelectedConfig();
  const selectedQuestion = currentModelTrialSelectedQuestion();
  const selectedBatch =
    state.modelTrialLocalBatches.find((item) => item.id === state.modelTrialSelectedBatchId) ?? null;
  const sourceMeta = selectedBatch
    ? `${t("model_trial_source_local")}: ${selectedBatch.topicName || selectedBatch.name}`
    : "";
  const usernameInput = document.querySelector<HTMLInputElement>("#qa-platform-username");

  const sessionListHtml = state.modelTrialSessions.length
    ? state.modelTrialSessions
        .map((session) => {
          const selected = session.id === state.modelTrialSelectedSessionId;
          const sessionMeta = [session.llmConfigName || session.llmModelName, formatPlatformTime(session.updatedAt)]
            .filter(Boolean)
            .join(" / ");
          return `
            <article class="model-trial-session${selected ? " active" : ""}">
              <button
                type="button"
                class="model-trial-session-main"
                data-model-trial-action="select-session"
                data-session-id="${session.id}"
              >
                <span class="model-trial-session-title">${escapeHtml(session.title)}</span>
                <span class="model-trial-session-meta">${escapeHtml(sessionMeta)}</span>
              </button>
              <div class="model-trial-session-actions">
                <span class="model-trial-status-pill">${escapeHtml(session.status)}</span>
                <button
                  type="button"
                  class="browse-mini-button browse-mini-button-danger"
                  data-model-trial-action="delete-session"
                  data-session-id="${session.id}"
                  ${state.modelTrialDeletingSessionId === session.id ? "disabled" : ""}
                >${escapeHtml(
                  state.modelTrialDeletingSessionId === session.id
                    ? t("model_trial_delete_busy")
                    : t("model_trial_delete")
                )}</button>
              </div>
            </article>
          `;
        })
        .join("")
    : `<div class="empty-state compact">${escapeHtml(
        state.modelTrialWorkspaceLoading ? t("model_trial_loading") : t("model_trial_empty_sessions")
      )}</div>`;

  const messagesHtml = state.modelTrialDetail?.messages.length
    ? state.modelTrialDetail.messages
        .map(
          (item) => `
            <article class="model-trial-message ${item.role === "assistant" ? "assistant" : "user"}">
              <div class="model-trial-message-meta">
                <span>${escapeHtml(
                  item.role === "assistant" ? t("model_trial_message_assistant") : t("model_trial_message_user")
                )}</span>
                <span>${escapeHtml(formatPlatformTime(item.createdAt))}</span>
              </div>
              <pre class="model-trial-message-body">${escapeHtml(item.content)}</pre>
            </article>
          `
        )
        .join("")
    : `<div class="empty-state compact">${escapeHtml(
        state.modelTrialDetailLoading ? t("model_trial_loading") : t("model_trial_message_empty")
      )}</div>`;

  const bannerHtml = state.modelTrialErrorMessage
    ? `<div class="platform-inline-banner error">${escapeHtml(state.modelTrialErrorMessage)}</div>`
    : state.modelTrialNoticeMessage
      ? `<div class="platform-inline-banner success">${escapeHtml(state.modelTrialNoticeMessage)}</div>`
      : "";

  panel.innerHTML = `
    <div class="model-trial-topbar">
      <div class="model-trial-topbar-item">
        <span class="platform-card-label">${escapeHtml(t("qa_platform_url"))}</span>
        <span class="platform-card-value">${escapeHtml(platformUrl)}</span>
      </div>
      <div class="model-trial-topbar-item">
        <span class="platform-card-label">${escapeHtml(t("platform_current_user"))}</span>
        <span class="platform-card-value">${escapeHtml(
          state.platformLoginState.kind === "success"
            ? state.platformLoginState.response.user.username
            : usernameInput?.value.trim() || t("empty_value")
        )}</span>
      </div>
      <div class="model-trial-topbar-item">
        <span class="platform-card-label">${escapeHtml(t("platform_action_check"))}</span>
        <div class="model-trial-topbar-check">
          <span class="platform-card-value">${escapeHtml(
            state.platformHealthState.kind === "success"
              ? t("platform_health_ok")
              : state.platformHealthState.kind === "error"
                ? t("platform_health_failed")
                : state.platformHealthState.kind === "loading"
                  ? t("platform_health_checking")
                  : t("platform_health_idle")
          )}</span>
          <button type="button" class="secondary" data-platform-action="health">${escapeHtml(t("platform_action_check"))}</button>
        </div>
      </div>
    </div>
    ${bannerHtml}
    ${
      hasSettings
        ? `
          <div class="model-trial-layout">
            <aside class="model-trial-sidebar">
              <div class="model-trial-sidebar-header">
                <p class="section-title">${escapeHtml(t("model_trial_session_list"))}</p>
                <button
                  type="button"
                  class="secondary"
                  data-model-trial-action="create-session"
                  ${state.modelTrialCreating || !selectedConfig ? "disabled" : ""}
                >${escapeHtml(t("platform_action_create_trial"))}</button>
              </div>
              <div class="model-trial-session-list">${sessionListHtml}</div>
            </aside>
            <section class="model-trial-main">
              <div class="model-trial-controls">
                <label class="model-trial-field">
                  <span>${escapeHtml(t("model_trial_select_model"))}</span>
                  <select id="model-trial-config-select">
                    <option value="">${escapeHtml(t("model_trial_need_model"))}</option>
                    ${state.modelTrialConfigs
                      .map(
                        (config) => `
                          <option value="${config.id}" ${config.id === state.modelTrialSelectedConfigId ? "selected" : ""}>
                            ${escapeHtml(`${config.name} / ${config.modelName}`)}
                          </option>
                        `
                      )
                      .join("")}
                  </select>
                </label>
                <label class="model-trial-field">
                  <span>${escapeHtml(t("model_trial_select_batch"))}</span>
                  <select id="model-trial-batch-select">
                    <option value="">${escapeHtml(t("model_trial_select_batch_empty"))}</option>
                    ${state.modelTrialLocalBatches
                      .map(
                        (batch) => `
                          <option value="${escapeHtml(batch.id)}" ${batch.id === state.modelTrialSelectedBatchId ? "selected" : ""}>
                            ${escapeHtml(batch.topicName || batch.name)}
                          </option>
                        `
                      )
                      .join("")}
                  </select>
                </label>
                <label class="model-trial-field">
                  <span>${escapeHtml(t("model_trial_select_question"))}</span>
                  <select id="model-trial-question-select" ${state.modelTrialSelectedBatchId ? "" : "disabled"}>
                    <option value="">${escapeHtml(
                      state.modelTrialSelectedBatchId
                        ? state.modelTrialLocalQuestionsLoading
                          ? t("model_trial_loading")
                          : t("model_trial_select_question_empty")
                        : t("model_trial_select_question_empty")
                    )}</option>
                    ${state.modelTrialLocalQuestions
                      .map(
                        (question) => `
                          <option value="${escapeHtml(question.id)}" ${question.id === state.modelTrialSelectedQuestionId ? "selected" : ""}>
                            ${escapeHtml(truncateText(question.question, 90))}
                          </option>
                        `
                      )
                      .join("")}
                  </select>
                </label>
                <div class="model-trial-meta-cards">
                  <div class="version-badge">${escapeHtml(
                    `${t("model_trial_user_badge")} ${state.platformLoginState.kind === "success" ? state.platformLoginState.response.user.username : t("empty_value")}`
                  )}</div>
                  <div class="version-badge">${escapeHtml(
                    `${t("model_trial_model_badge")} ${selectedConfig?.modelName || state.modelTrialDetail?.session.llmModelName || t("empty_value")}`
                  )}</div>
                </div>
              </div>
              <section class="model-trial-source-panel">
                <div class="title-with-meta">
                  <p class="section-title">${escapeHtml(t("model_trial_source_card"))}</p>
                  ${sourceMeta ? `<p class="model-trial-source-meta">${escapeHtml(sourceMeta)}</p>` : ""}
                </div>
                ${
                  state.modelTrialLocalQuestionDetail
                    ? `
                      <p class="model-trial-source-question">${escapeHtml(state.modelTrialLocalQuestionDetail.item.question)}</p>
                      ${
                        state.modelTrialLocalQuestionDetail.item.answer
                          ? `<p class="model-trial-source-answer">${escapeHtml(state.modelTrialLocalQuestionDetail.item.answer)}</p>`
                          : ""
                      }
                    `
                    : state.modelTrialDetail?.source
                      ? `
                          <p class="model-trial-source-question">${escapeHtml(state.modelTrialDetail.source.questionText)}</p>
                          ${
                            state.modelTrialDetail.source.answerText
                              ? `<p class="model-trial-source-answer">${escapeHtml(state.modelTrialDetail.source.answerText)}</p>`
                              : ""
                          }
                        `
                      : `<div class="empty-state compact">${escapeHtml(t("model_trial_source_none"))}</div>`
                }
              </section>
              <section class="model-trial-chat-panel">
                <div class="title-with-meta">
                  <p class="section-title">${escapeHtml(t("model_trial_conversation"))}</p>
                  ${
                    state.modelTrialDetail?.session
                      ? `<p class="model-trial-chat-meta">${escapeHtml(
                          `${state.modelTrialDetail.session.title} · ${formatPlatformTime(state.modelTrialDetail.session.updatedAt)}`
                        )}</p>`
                      : ""
                  }
                </div>
                <div class="model-trial-message-list">${messagesHtml}</div>
                <div class="model-trial-composer">
                  <textarea id="model-trial-composer" placeholder="${escapeHtml(
                    t("model_trial_input_placeholder")
                  )}">${escapeHtml(state.modelTrialComposer)}</textarea>
                  <div class="model-trial-composer-actions">
                    <button
                      type="button"
                      data-model-trial-action="send-message"
                      ${state.modelTrialSending || state.modelTrialCreating || !selectedConfig ? "disabled" : ""}
                    >${escapeHtml(t("platform_action_send_trial"))}</button>
                  </div>
                </div>
              </section>
            </section>
          </div>
        `
        : `<div class="empty-state">${escapeHtml(t("model_trial_settings_required"))}</div>`
    }
  `;
}

export function renderPlatformPanels() {
  try { renderQaEvaluatePanel(); } catch (e) { console.error(`renderQaEvaluatePanel: ${String(e)}`); }
  try { renderModelTrialPanel(); } catch (e) { console.error(`renderModelTrialPanel: ${String(e)}`); }
  try { renderPlatformAccountCard(); } catch (e) { console.error(`renderPlatformAccountCard: ${String(e)}`); }
  try { updatePlatformStatusBadge(); } catch (e) { console.error(`updatePlatformStatusBadge: ${String(e)}`); }
  // Load platform models after login state change
  void loadPlatformGenerateModels().then(() => {
    try {
      updatePlatformPresetOption();
      syncProviderPresetInput();
      renderSetupSummary();
    } catch (e) { console.error(`loadPlatformGenerateModels.then: ${String(e)}`); }
  });
}

export function updatePlatformStatusBadge() {
  const badge = document.querySelector<HTMLElement>("#platform-status-badge");
  if (!badge) return;
  if (state.platformLoginState.kind === "success") {
    badge.className = "platform-status-badge connected";
    badge.textContent = state.platformLoginState.response.user.username;
  } else if (state.platformLoginState.kind === "loading") {
    badge.className = "platform-status-badge checking";
    badge.textContent = "...";
  } else if (state.platformLoginState.kind === "error") {
    badge.className = "platform-status-badge error";
    badge.textContent = "✕";
  } else {
    badge.className = "platform-status-badge";
    badge.textContent = "○";
  }
  // Also sync the in-settings login status
  const loginStatus = document.querySelector<HTMLElement>("#platform-login-status");
  if (loginStatus) {
    if (state.platformLoginState.kind === "success") {
      loginStatus.className = "platform-login-status connected";
      loginStatus.textContent = `${t("platform_login_ok")} ${state.platformLoginState.response.user.username}`;
    } else if (state.platformLoginState.kind === "loading") {
      loginStatus.className = "platform-login-status checking";
      loginStatus.textContent = t("platform_login_checking");
    } else if (state.platformLoginState.kind === "error") {
      loginStatus.className = "platform-login-status error";
      loginStatus.textContent = `${t("platform_login_failed")}: ${state.platformLoginState.message}`;
    } else {
      loginStatus.className = "platform-login-status";
      loginStatus.textContent = t("platform_login_idle");
    }
  }
}

export function renderPlatformAccountCard() {
  const card = document.querySelector<HTMLElement>("#platform-account-card");
  if (!card) return;

  if (state.platformLoginState.kind !== "success") {
    card.innerHTML = `
      <div class="platform-account-card disconnected">
        <p class="platform-account-status">${escapeHtml(t("platform_login_idle"))}</p>
      </div>`;
    return;
  }

  const user = state.platformLoginState.response.user;
  card.innerHTML = `
    <div class="platform-account-card connected">
      <div class="platform-account-row">
        <span class="platform-account-label">${escapeHtml(t("platform_current_user"))}</span>
        <span class="platform-account-value">${escapeHtml(user.username)}</span>
      </div>
      <div class="platform-account-actions">
        <button type="button" class="secondary" id="password-change-toggle">${escapeHtml(t("platform_action_change_password"))}</button>
        <button type="button" class="secondary" id="platform-logout-button">${escapeHtml(t("platform_action_logout"))}</button>
      </div>
    </div>`;

  card.querySelector("#password-change-toggle")?.addEventListener("click", () => {
    const container = document.querySelector<HTMLElement>("#password-change-form-container");
    if (container) {
      container.hidden = !container.hidden;
      if (!container.hidden) {
        state.passwordChangeState = { kind: "idle" };
        // Dynamic import to avoid circular dependency
        import("./settings").then(({ renderPasswordChangeForm }) => {
          renderPasswordChangeForm();
        });
      }
    }
  });

  card.querySelector("#platform-logout-button")?.addEventListener("click", async () => {
    const auth = currentPlatformAuthPayload();
    if (!auth) return;
    try {
      await invoke("logout_platform", auth);
    } catch { /* ignore */ }
    state.platformLoginState = { kind: "idle" };
    renderPlatformPanels();
  });
}

export async function refreshPlatformHealth() {
  state.platformHealthState = { kind: "loading" };
  renderPlatformPanels();
  try {
    const platformUrl = currentQaPlatformUrl();
    const response = await invoke<PlatformHealthResponse>("check_platform_health", {
      platformUrl
    });
    state.platformHealthState = { kind: "success", response };
    console.log(`${t("platform_health_ok")} ${response.endpoints.platformApiBaseUrl}`);
  } catch (error) {
    state.platformHealthState = { kind: "error", message: String(error) };
    console.error(`${t("platform_health_failed")}: ${String(error)}`);
  }
  renderPlatformPanels();
}

export async function refreshPlatformLogin() {
  if (!hasQaPlatformCredentials()) {
    window.alert(t("browse_platform_credentials_missing"));
    // setCurrentTab is imported dynamically to avoid circular dependency
    const { setCurrentTab } = await import("./main");
    setCurrentTab("settings");
    document.querySelector<HTMLInputElement>("#qa-platform-username")?.focus();
    return;
  }

  state.platformLoginState = { kind: "loading" };
  renderPlatformPanels();
  try {
    const platformUrl = currentQaPlatformUrl();
    const username = document.querySelector<HTMLInputElement>("#qa-platform-username")?.value.trim() ?? "";
    const password = document.querySelector<HTMLInputElement>("#qa-platform-password")?.value.trim() ?? "";
    const response = await invoke<PlatformLoginResponse>("login_platform", {
      platformUrl,
      username,
      password
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
    console.log(`${t("platform_login_ok")} ${response.user.username}`);
  } catch (error) {
    state.platformLoginState = { kind: "error", message: String(error) };
    console.error(`${t("platform_login_failed")}: ${String(error)}`);
  }
  renderPlatformPanels();
}

export function currentPlatformAuthPayload():
  | { platformUrl: string; username: string; password: string }
  | null {
  const platformUrl = currentQaPlatformUrl();
  const username = document.querySelector<HTMLInputElement>("#qa-platform-username")?.value.trim() ?? "";
  const password = document.querySelector<HTMLInputElement>("#qa-platform-password")?.value.trim() ?? "";
  if (!platformUrl || !username || !password) {
    return null;
  }
  return { platformUrl, username, password };
}

export async function loadModelTrialSessionDetail(sessionId: number, silent = false) {
  const auth = currentPlatformAuthPayload();
  if (!auth) {
    return;
  }

  state.modelTrialDetailLoading = true;
  if (!silent) {
    state.modelTrialErrorMessage = null;
    state.modelTrialNoticeMessage = null;
  }
  renderPlatformPanels();
  try {
    const detail = await invoke<TrialSessionDetail>("get_model_trial_session_detail", {
      ...auth,
      sessionId
    });
    state.modelTrialDetail = detail;
    state.modelTrialSelectedSessionId = detail.session.id;
    state.modelTrialSelectedConfigId = detail.session.llmConfigId;
  } catch (error) {
    state.modelTrialErrorMessage = `${t("model_trial_error_detail")}: ${String(error)}`;
    console.error(state.modelTrialErrorMessage);
  } finally {
    state.modelTrialDetailLoading = false;
    renderPlatformPanels();
  }
}

export async function loadModelTrialLocalBatches() {
  try {
    state.modelTrialLocalBatches = await invoke<QaBatchSummary[]>("list_qa_batches");
    if (
      state.modelTrialSelectedBatchId &&
      !state.modelTrialLocalBatches.some((item) => item.id === state.modelTrialSelectedBatchId)
    ) {
      state.modelTrialSelectedBatchId = null;
      state.modelTrialLocalQuestions = [];
      state.modelTrialSelectedQuestionId = null;
      state.modelTrialLocalQuestionDetail = null;
    }
  } catch (error) {
    state.modelTrialErrorMessage = `${t("browse_tab_title")}: ${String(error)}`;
    console.error(state.modelTrialErrorMessage);
  }
}

export async function loadModelTrialLocalQuestions(batchId: string) {
  state.modelTrialLocalQuestionsLoading = true;
  state.modelTrialSelectedBatchId = batchId;
  state.modelTrialSelectedQuestionId = null;
  state.modelTrialLocalQuestionDetail = null;
  renderPlatformPanels();
  try {
    state.modelTrialLocalQuestions = await invoke<QaRecordSummary[]>("list_batch_qa_question_options", {
      batchId
    });
  } catch (error) {
    state.modelTrialLocalQuestions = [];
    state.modelTrialErrorMessage = `${t("model_trial_select_question")}: ${String(error)}`;
    console.error(state.modelTrialErrorMessage);
  } finally {
    state.modelTrialLocalQuestionsLoading = false;
    renderPlatformPanels();
  }
}

export async function loadModelTrialLocalQuestionDetail(batchId: string, qaId: string) {
  try {
    const detail = await invoke<QaRecordDetail>("get_batch_qa_record", {
      batchId,
      qaId
    });
    state.modelTrialLocalQuestionDetail = detail;
    state.modelTrialSelectedQuestionId = qaId;
  } catch (error) {
    state.modelTrialLocalQuestionDetail = null;
    state.modelTrialErrorMessage = `${t("model_trial_source_card")}: ${String(error)}`;
    console.error(state.modelTrialErrorMessage);
  } finally {
    renderPlatformPanels();
  }
}

export async function loadModelTrialWorkspace(showNotice = false) {
  const auth = currentPlatformAuthPayload();
  if (!auth) {
    resetModelTrialState();
    renderPlatformPanels();
    return;
  }

  state.modelTrialWorkspaceLoading = true;
  state.platformLoginState = { kind: "loading" };
  state.modelTrialErrorMessage = null;
  if (!showNotice) {
    state.modelTrialNoticeMessage = null;
  }
  renderPlatformPanels();
  try {
    const response = await invoke<TrialWorkspaceResponse>("load_model_trial_workspace", auth);
    state.platformLoginState = {
      kind: "success",
      response: {
        endpoints: response.endpoints,
        user: response.user
      }
    };
    state.platformHealthState = {
      kind: "success",
      response: {
        reachable: true,
        message: "ok",
        endpoints: response.endpoints
      }
    };

    const nextConfigs = response.configs.filter((item) => item.isTrialEnabled && item.hasApiKey);
    const nextSessions = response.sessions;
    state.modelTrialConfigs = nextConfigs;
    state.modelTrialSessions = nextSessions;
    state.modelTrialSources = response.sources;

    const defaultConfig =
      nextConfigs.find((item) => item.id === state.modelTrialSelectedConfigId) ??
      nextConfigs.find((item) => item.hasApiKey && item.isTrialEnabled) ??
      nextConfigs[0] ??
      null;
    state.modelTrialSelectedConfigId = defaultConfig?.id ?? null;

    const selectedSessionStillExists = nextSessions.some((item) => item.id === state.modelTrialSelectedSessionId);
    state.modelTrialSelectedSessionId = selectedSessionStillExists
      ? state.modelTrialSelectedSessionId
      : nextSessions[0]?.id ?? null;
    if (!state.modelTrialSelectedSessionId) {
      state.modelTrialDetail = null;
    }

    if (showNotice) {
      state.modelTrialNoticeMessage = t("model_trial_notice_refreshed");
    }
  } catch (error) {
    state.platformLoginState = { kind: "error", message: String(error) };
    state.modelTrialErrorMessage = `${t("model_trial_error_load")}: ${String(error)}`;
    console.error(state.modelTrialErrorMessage);
  } finally {
    state.modelTrialWorkspaceLoading = false;
    renderPlatformPanels();
  }

  if (state.modelTrialSelectedSessionId !== null) {
    await loadModelTrialSessionDetail(state.modelTrialSelectedSessionId, true);
  }
}

export async function createModelTrialSession() {
  const auth = currentPlatformAuthPayload();
  if (!auth) {
    state.modelTrialErrorMessage = t("model_trial_settings_required");
    renderPlatformPanels();
    return null;
  }
  if (!state.modelTrialSelectedConfigId) {
    state.modelTrialErrorMessage = t("model_trial_need_model");
    renderPlatformPanels();
    return null;
  }

  state.modelTrialCreating = true;
  state.modelTrialErrorMessage = null;
  state.modelTrialNoticeMessage = null;
  renderPlatformPanels();
  try {
    const selectedQuestion = state.modelTrialLocalQuestionDetail?.item.question ?? currentModelTrialSelectedQuestion()?.question ?? null;
    const matchedSource = selectedQuestion
      ? state.modelTrialSources.find((s) => s.questionText === selectedQuestion)
      : null;
    const response = await invoke<TrialSessionCreateResponse>("create_model_trial_session", {
      ...auth,
      llmConfigId: state.modelTrialSelectedConfigId,
      sourceQaItemId: matchedSource?.qaItemId ?? null,
      sourceAnswerId: matchedSource?.answerId ?? null,
      title: state.modelTrialLocalQuestionDetail?.item.question ?? currentModelTrialSelectedQuestion()?.question ?? null
    });
    state.modelTrialSelectedSessionId = response.sessionId;
    await loadModelTrialWorkspace(false);
    await loadModelTrialSessionDetail(response.sessionId, true);
    state.modelTrialNoticeMessage = t("model_trial_notice_created");
    return response.sessionId;
  } catch (error) {
    state.modelTrialErrorMessage = `${t("model_trial_error_create")}: ${String(error)}`;
    console.error(state.modelTrialErrorMessage);
    renderPlatformPanels();
    return null;
  } finally {
    state.modelTrialCreating = false;
    renderPlatformPanels();
  }
}

export async function sendModelTrialMessage() {
  const auth = currentPlatformAuthPayload();
  if (!auth) {
    state.modelTrialErrorMessage = t("model_trial_settings_required");
    renderPlatformPanels();
    return;
  }
  const content = state.modelTrialComposer.trim();
  if (!content) {
    state.modelTrialErrorMessage = t("model_trial_need_message");
    renderPlatformPanels();
    return;
  }
  if (!state.modelTrialSelectedConfigId) {
    state.modelTrialErrorMessage = t("model_trial_need_model");
    renderPlatformPanels();
    return;
  }

  state.modelTrialSending = true;
  state.modelTrialErrorMessage = null;
  state.modelTrialNoticeMessage = null;
  renderPlatformPanels();
  try {
    const sessionId = state.modelTrialSelectedSessionId ?? (await createModelTrialSession());
    if (!sessionId) {
      return;
    }
    await invoke<TrialSendMessageResponse>("send_model_trial_message", {
      ...auth,
      sessionId,
      content
    });
    state.modelTrialComposer = "";
    await loadModelTrialWorkspace(false);
    await loadModelTrialSessionDetail(sessionId, true);
  } catch (error) {
    state.modelTrialErrorMessage = `${t("model_trial_error_send")}: ${String(error)}`;
    console.error(state.modelTrialErrorMessage);
  } finally {
    state.modelTrialSending = false;
    renderPlatformPanels();
  }
}

export async function deleteModelTrialSession(sessionId: number) {
  const auth = currentPlatformAuthPayload();
  if (!auth) {
    state.modelTrialErrorMessage = t("model_trial_settings_required");
    renderPlatformPanels();
    return;
  }
  if (!window.confirm(`${t("model_trial_delete")} #${sessionId}?`)) {
    return;
  }

  state.modelTrialDeletingSessionId = sessionId;
  state.modelTrialErrorMessage = null;
  state.modelTrialNoticeMessage = null;
  renderPlatformPanels();
  try {
    await invoke("delete_model_trial_session", {
      ...auth,
      sessionId
    });
    if (state.modelTrialSelectedSessionId === sessionId) {
      state.modelTrialSelectedSessionId = null;
      state.modelTrialDetail = null;
    }
    await loadModelTrialWorkspace(false);
    state.modelTrialNoticeMessage = t("model_trial_notice_deleted");
  } catch (error) {
    state.modelTrialErrorMessage = `${t("model_trial_error_delete")}: ${String(error)}`;
    console.error(state.modelTrialErrorMessage);
  } finally {
    state.modelTrialDeletingSessionId = null;
    renderPlatformPanels();
  }
}

export async function openPlatformArea(kind: "qa-evaluate" | "model-trial") {
  const targetUrl = currentPlatformOpenUrl(kind);
  if (!targetUrl) {
    await refreshPlatformLogin();
  }
  const nextTargetUrl = currentPlatformOpenUrl(kind);
  if (!nextTargetUrl) {
    return;
  }

  try {
    await invoke("open_external_url", { url: nextTargetUrl });
    console.log(
      kind === "qa-evaluate" ? t("platform_opened_qa_page") : t("platform_opened_trial_page")
    );
  } catch (error) {
    console.error(`${t("platform_open_failed")}: ${String(error)}`);
  }
}

export async function restorePlatformPasswordFromKeychain() {
  const url = currentQaPlatformUrl();
  const username = document.querySelector<HTMLInputElement>("#qa-platform-username")?.value.trim() ?? "";
  if (!url || !username) return;
  try {
    const pw = await invoke<string | null>("load_platform_password", {
      platformUrl: url,
      username,
    });
    if (pw) {
      const pwInput = document.querySelector<HTMLInputElement>("#qa-platform-password");
      if (pwInput) pwInput.value = pw;
    }
  } catch { /* keychain unavailable — ignored */ }
}
