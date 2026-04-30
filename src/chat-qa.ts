import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import type { ProviderPresetId } from "./types";
import type { ChatSession, ChatUploadResponse } from "./state";
import { state } from "./state";
import { CHAT_SESSIONS_STORAGE_KEY } from "./constants";
import { t } from "./translations";
import { escapeHtml, currentPresetLabel } from "./utils";
import { resolveLLMProvider, providerPresetInput } from "./provider";
import { currentPlatformAuthPayload } from "./platform";
import { appendLog } from "./main";

// ---- DOM element references (owned by main.ts, assigned at init) ----
export let chatQaPanel: HTMLElement | null;
export let chatQaSessionsBar: HTMLElement | null;
export let chatQaModelInfo: HTMLElement | null;
export let chatQaMessages: HTMLElement | null;
export let chatQaInput: HTMLTextAreaElement | null;
export let chatQaSendButton: HTMLButtonElement | null;
export let chatQaError: HTMLElement | null;

export function initChatQaDomRefs(refs: {
  chatQaPanel: HTMLElement | null;
  chatQaSessionsBar: HTMLElement | null;
  chatQaModelInfo: HTMLElement | null;
  chatQaMessages: HTMLElement | null;
  chatQaInput: HTMLTextAreaElement | null;
  chatQaSendButton: HTMLButtonElement | null;
  chatQaError: HTMLElement | null;
}) {
  chatQaPanel = refs.chatQaPanel;
  chatQaSessionsBar = refs.chatQaSessionsBar;
  chatQaModelInfo = refs.chatQaModelInfo;
  chatQaMessages = refs.chatQaMessages;
  chatQaInput = refs.chatQaInput;
  chatQaSendButton = refs.chatQaSendButton;
  chatQaError = refs.chatQaError;
}

// ---- Chat QA core functions ----

export function getCurrentSession(): ChatSession | undefined {
  return state.chatSessions.find(s => s.id === state.currentChatSessionId);
}

export function createChatSession() {
  state.sessionCounter++;
  const session: ChatSession = {
    id: crypto.randomUUID(),
    name: `${t("chat_qa_session_untitled")} ${state.sessionCounter}`,
    messages: [],
    createdAt: Date.now()
  };
  state.chatSessions.push(session);
  state.currentChatSessionId = session.id;
  persistChatSessions();
  renderChatQaPanel();
}

export function switchChatSession(id: string) {
  if (state.chatSessions.some(s => s.id === id)) {
    state.currentChatSessionId = id;
    persistChatSessions();
    renderChatQaPanel();
  }
}

export function deleteChatSession(id: string) {
  const idx = state.chatSessions.findIndex(s => s.id === id);
  if (idx === -1) return;
  state.chatSessions.splice(idx, 1);
  if (state.currentChatSessionId === id) {
    if (state.chatSessions.length > 0) {
      state.currentChatSessionId = state.chatSessions[state.chatSessions.length - 1].id;
    } else {
      state.currentChatSessionId = null;
    }
  }
  persistChatSessions();
  if (state.chatSessions.length === 0) {
    createChatSession();
  } else {
    renderChatQaPanel();
  }
}

export function persistChatSessions() {
  try {
    const data = JSON.stringify({
      sessions: state.chatSessions,
      currentId: state.currentChatSessionId,
      counter: state.sessionCounter,
    });
    window.localStorage.setItem(CHAT_SESSIONS_STORAGE_KEY, data);
  } catch { /* quota exceeded — silently skip */ }
}

export function restoreChatSessions() {
  try {
    const raw = window.localStorage.getItem(CHAT_SESSIONS_STORAGE_KEY);
    if (!raw) return;
    const data = JSON.parse(raw);
    if (Array.isArray(data.sessions) && data.sessions.length > 0) {
      state.chatSessions = data.sessions;
      state.currentChatSessionId = data.currentId ?? state.chatSessions[0]?.id ?? null;
      state.sessionCounter = data.counter ?? state.chatSessions.length;
    }
  } catch { /* corrupted data — ignore */ }
}

export function renderChatSessionsBar() {
  if (!chatQaSessionsBar) return;

  const auth = currentPlatformAuthPayload();
  const currentSession = getCurrentSession();
  const hasMessages = (currentSession?.messages.length ?? 0) > 0;
  const canUpload = Boolean(auth) && hasMessages;

  const tabs = state.chatSessions.map(s => {
    const activeClass = s.id === state.currentChatSessionId ? " active" : "";
    const uploadState = state.sessionUploadStates[s.id];
    let statusIcon = "";
    if (uploadState) {
      if (uploadState.kind === "uploading") {
        statusIcon = `<span class="chat-qa-session-upload-status uploading" title="${escapeHtml(t("chat_qa_uploading"))}">&#8987;</span>`;
      } else if (uploadState.kind === "success") {
        statusIcon = `<span class="chat-qa-session-upload-status success" title="${escapeHtml(t("chat_qa_upload_success"))}">&#10003;</span>`;
      } else if (uploadState.kind === "error") {
        statusIcon = `<span class="chat-qa-session-upload-status error" title="${escapeHtml(uploadState.message)}">&#10007;</span>`;
      }
    }
    return `<span class="chat-qa-session-tab${activeClass}" data-session-id="${s.id}">
      <span class="chat-qa-session-tab-name">${escapeHtml(s.name)}</span>${statusIcon}
      <button type="button" class="chat-qa-session-tab-close" data-delete-session="${s.id}" title="Close session">&times;</button>
    </span>`;
  }).join("");

  const uploadTitle = canUpload ? escapeHtml(t("chat_qa_upload")) : (auth ? escapeHtml(t("chat_qa_upload_empty")) : escapeHtml(t("chat_qa_upload_no_auth")));
  const uploadDisabled = !canUpload ? " disabled" : "";

  chatQaSessionsBar.innerHTML = tabs
    + `<button type="button" class="chat-qa-new-session-button" id="chat-qa-new-session-button" title="${escapeHtml(t("chat_qa_new_session"))}">+</button>`
    + `<button type="button" class="chat-qa-upload-button${uploadDisabled}" id="chat-qa-upload-button" title="${uploadTitle}"${uploadDisabled} data-upload-session="${state.currentChatSessionId ?? ""}">${escapeHtml(t("chat_qa_upload"))}</button>`;
}

export function renderChatQaPanel() {
  if (!chatQaPanel) return;

  renderChatSessionsBar();

  const session = getCurrentSession();
  const messages = session?.messages ?? [];

  const resolved = resolveLLMProvider();
  const hasConfig = resolved.mode !== "none" && resolved.model.length > 0;
  const modelLabel = hasConfig
    ? (resolved.mode === "platform"
        ? t("preset_platform") + " / " + resolved.model
        : (currentPresetLabel(providerPresetInput.value as ProviderPresetId) || resolved.provider) + " / " + resolved.model)
    : "";

  if (chatQaModelInfo) {
    chatQaModelInfo.innerHTML = hasConfig
      ? `<span class="chat-qa-model-label">${escapeHtml(t("chat_qa_model"))}</span><span class="chat-qa-model-value">${escapeHtml(modelLabel)}</span>`
      : `<span class="chat-qa-model-warning">${escapeHtml(t("chat_qa_no_model"))}</span>`;
  }

  if (chatQaMessages) {
    if (messages.length === 0) {
      chatQaMessages.innerHTML = `<div class="chat-qa-empty" id="chat-qa-empty">${escapeHtml(t("chat_qa_empty"))}</div>`;
    } else {
      chatQaMessages.innerHTML = messages
        .map(
          (msg) => `
            <div class="chat-qa-message ${msg.role}">
              <span class="chat-qa-message-role">${escapeHtml(msg.role === "user" ? t("chat_qa_user") : t("chat_qa_assistant"))}</span>
              <div class="chat-qa-message-content">${escapeHtml(msg.content)}</div>
            </div>`
        )
        .join("");
      chatQaMessages.scrollTop = chatQaMessages.scrollHeight;
    }
  }

  if (chatQaSendButton) chatQaSendButton.disabled = !hasConfig || state.chatSending;
  if (chatQaInput) chatQaInput.disabled = !hasConfig || state.chatSending;

  if (chatQaError) {
    if (state.chatError) {
      chatQaError.hidden = false;
      chatQaError.textContent = state.chatError;
    } else {
      chatQaError.hidden = true;
    }
  }
}

export async function handleChatSend() {
  if (state.chatSending) return;

  const session = getCurrentSession();
  if (!session) return;

  if (!chatQaInput) return;
  const text = chatQaInput.value.trim();
  if (!text) return;

  const resolved = resolveLLMProvider();
  const modelReady = resolved.model.length > 0;
  if (resolved.mode === "none" || !modelReady) {
    state.chatError = t("chat_qa_no_model");
    renderChatQaPanel();
    return;
  }

  session.messages.push({ role: "user", content: text });
  chatQaInput.value = "";
  state.chatSending = true;
  state.chatError = null;
  // Add empty assistant placeholder for streaming
  session.messages.push({ role: "assistant", content: "" });
  renderChatQaPanel();

  try {
    await invoke<{ message: { role: string; content: string } }>(
      "send_chat_message_stream",
      {
        request: {
          platformUrl: resolved.mode === "platform" ? resolved.platformUrl : null,
          username: resolved.mode === "platform" ? resolved.username : null,
          password: resolved.mode === "platform" ? resolved.password : null,
          provider: resolved.mode === "settings" ? resolved.provider : "openai-compatible",
          baseUrl: resolved.mode === "settings" ? resolved.baseUrl : "",
          apiKey: resolved.mode === "settings" ? resolved.apiKey : "",
          model: resolved.model,
          messages: session.messages.filter(m => m.role !== "assistant" || m.content !== "").map((m) => ({ role: m.role, content: m.content }))
        }
      }
    );
  } catch (error) {
    state.chatError = `${t("chat_qa_send_failed")}: ${String(error)}`;
  } finally {
    state.chatSending = false;
    persistChatSessions();
    renderChatQaPanel();
  }
}

export async function uploadChatSession(sessionId: string) {
  const session = state.chatSessions.find(s => s.id === sessionId);
  if (!session || session.messages.length === 0) return;

  const auth = currentPlatformAuthPayload();
  if (!auth) {
    state.sessionUploadStates[sessionId] = { kind: "error", message: t("chat_qa_upload_no_auth") };
    renderChatQaPanel();
    return;
  }

  state.sessionUploadStates[sessionId] = { kind: "uploading" };
  renderChatQaPanel();

  try {
    const response = await invoke<ChatUploadResponse>("push_chat_conversations", {
      platformUrl: auth.platformUrl,
      username: auth.username,
      password: auth.password,
      sessionName: session.name,
      externalBatchId: session.id,
      messages: session.messages.map(m => ({ role: m.role, content: m.content }))
    });
    state.sessionUploadStates[sessionId] = { kind: "success", batchId: response.batch_id ?? 0 };
  } catch (error) {
    state.sessionUploadStates[sessionId] = { kind: "error", message: String(error) };
  }
  renderChatQaPanel();
}

// ---- SSE listener ----

export function initChatQaListeners() {
  // Chat QA streaming: update the last assistant message as tokens arrive
  void listen<{ token: string; fullContent: string }>("chat-qa-token", (event) => {
    const session = getCurrentSession();
    if (!session) return;
    const lastMsg = session.messages[session.messages.length - 1];
    if (lastMsg && lastMsg.role === "assistant") {
      lastMsg.content = event.payload.fullContent;
      renderChatQaPanel();
    }
  });
}

// ---- Event handlers ----

export function initChatQaEventHandlers() {
  chatQaSessionsBar?.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;

    const deleteBtn = target.closest<HTMLElement>("[data-delete-session]");
    if (deleteBtn) {
      event.stopPropagation();
      deleteChatSession(deleteBtn.dataset.deleteSession!);
      return;
    }

    const newBtn = target.closest<HTMLElement>("#chat-qa-new-session-button");
    if (newBtn) {
      createChatSession();
      return;
    }

    const uploadBtn = target.closest<HTMLElement>("#chat-qa-upload-button");
    if (uploadBtn && !(uploadBtn as HTMLButtonElement).disabled) {
      const sessionId = (uploadBtn as HTMLElement).dataset.uploadSession;
      if (sessionId) void uploadChatSession(sessionId);
      return;
    }

    const tab = target.closest<HTMLElement>(".chat-qa-session-tab");
    if (tab) {
      switchChatSession((tab as HTMLElement).dataset.sessionId!);
      return;
    }
  });

  chatQaSendButton?.addEventListener("click", () => {
    void handleChatSend();
  });

  chatQaInput?.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void handleChatSend();
    }
  });
}
