import { invoke } from "@tauri-apps/api/core";
import { message } from "@tauri-apps/plugin-dialog";
import type { AppUpdateCheckResponse, Lang } from "./types";
import { state } from "./state";
import { t, formatMessage, findMatchingTranslationKey } from "./translations";
import { escapeHtml } from "./utils";
import { currentPlatformAuthPayload } from "./platform";
import { appendLog, setStatus, setText } from "./main";

// ---- Feedback ----

export function renderFeedback2Panel() {
  const isLoggedIn = state.platformLoginState.kind === "success";
  const formState = state.feedback2FormState;

  const loginRequired = document.querySelector<HTMLElement>("#feedback2-login-required");
  const form = document.querySelector<HTMLFormElement>("#feedback2-form");
  const submitBtn = document.querySelector<HTMLButtonElement>("#feedback2-submit-button");
  const successMsg = document.querySelector<HTMLElement>("#feedback2-success");
  const errorMsg = document.querySelector<HTMLElement>("#feedback2-form-error");

  if (loginRequired) loginRequired.hidden = isLoggedIn;
  if (form) form.hidden = !isLoggedIn;

  if (submitBtn) {
    submitBtn.disabled = formState.kind === "submitting";
    submitBtn.textContent = formState.kind === "submitting" ? t("feedback_submitting") : t("feedback_submit");
  }

  if (successMsg) successMsg.hidden = formState.kind !== "success";
  if (errorMsg) {
    errorMsg.hidden = formState.kind !== "error";
    if (formState.kind === "error") errorMsg.textContent = formState.message;
  }
}

export async function handleFeedback2FormSubmit(event: SubmitEvent) {
  event.preventDefault();
  const form = event.currentTarget as HTMLFormElement;
  const titleInput = form.querySelector<HTMLInputElement>("#feedback2-title");
  const contentInput = form.querySelector<HTMLTextAreaElement>("#feedback2-content");
  const categorySelect = form.querySelector<HTMLSelectElement>("#feedback2-category");
  if (!titleInput || !contentInput || !categorySelect) return;

  const title = titleInput.value.trim();
  const content = contentInput.value.trim();
  if (!title || !content) return;

  const auth = currentPlatformAuthPayload();
  if (!auth) return;

  state.feedback2FormState = { kind: "submitting" };
  renderFeedback2Panel();
  try {
    await invoke("submit_feedback", {
      ...auth,
      title,
      content,
      category: categorySelect.value
    });
    state.feedback2FormState = { kind: "success" };
    titleInput.value = "";
    contentInput.value = "";
  } catch (error) {
    state.feedback2FormState = { kind: "error", message: String(error) };
  }
  renderFeedback2Panel();
}

// ---- Password change ----

export async function handlePasswordChange(event: SubmitEvent) {
  event.preventDefault();
  const form = event.currentTarget as HTMLFormElement;
  const currentInput = form.querySelector<HTMLInputElement>("#password-change-current");
  const newInput = form.querySelector<HTMLInputElement>("#password-change-new");
  const confirmInput = form.querySelector<HTMLInputElement>("#password-change-confirm");
  if (!currentInput || !newInput || !confirmInput) return;

  const currentPassword = currentInput.value;
  const newPassword = newInput.value;
  const confirmPassword = confirmInput.value;

  if (newPassword !== confirmPassword) {
    state.passwordChangeState = { kind: "error", message: t("platform_password_mismatch") };
    renderPasswordChangeForm();
    return;
  }

  const auth = currentPlatformAuthPayload();
  if (!auth) return;

  state.passwordChangeState = { kind: "submitting" };
  renderPasswordChangeForm();
  try {
    await invoke("change_platform_password", {
      ...auth,
      currentPassword,
      newPassword
    });
    state.passwordChangeState = { kind: "success" };
    currentInput.value = "";
    newInput.value = "";
    confirmInput.value = "";
  } catch (error) {
    state.passwordChangeState = { kind: "error", message: String(error) };
  }
  renderPasswordChangeForm();
}

export function renderPasswordChangeForm() {
  const container = document.querySelector<HTMLElement>("#password-change-form-container");
  if (!container) return;

  const pwState = state.passwordChangeState;
  container.innerHTML = `
    <form class="password-change-form" id="password-change-form">
      <p class="password-change-title">${escapeHtml(t("platform_change_password_title"))}</p>
      <label>
        <span>${escapeHtml(t("platform_current_password"))}</span>
        <input id="password-change-current" type="password" required />
      </label>
      <label>
        <span>${escapeHtml(t("platform_new_password"))}</span>
        <input id="password-change-new" type="password" minlength="6" required />
      </label>
      <label>
        <span>${escapeHtml(t("platform_confirm_password"))}</span>
        <input id="password-change-confirm" type="password" minlength="6" required />
      </label>
      <button type="submit" class="feedback-submit-button" ${pwState.kind === "submitting" ? "disabled" : ""}>
        ${pwState.kind === "submitting" ? escapeHtml(t("platform_password_submitting")) : escapeHtml(t("platform_password_submit"))}
      </button>
      ${pwState.kind === "success" ? `<p class="feedback-success">${escapeHtml(t("platform_password_success"))}</p>` : ""}
      ${pwState.kind === "error" ? `<p class="feedback-error">${escapeHtml(pwState.message)}</p>` : ""}
    </form>
  `;

  const form = container.querySelector<HTMLFormElement>("#password-change-form");
  if (form) {
    form.addEventListener("submit", handlePasswordChange);
  }
}

// ---- App update ----

export function buildUpdatePrompt(response: AppUpdateCheckResponse): string {
  const lines = [
    state.currentLang === "zh"
      ? `当前版本：${response.currentVersion}`
      : `Current version: ${response.currentVersion}`,
    state.currentLang === "zh"
      ? `最新版本：${response.version ?? "unknown"}`
      : `Latest version: ${response.version ?? "unknown"}`
  ];

  if (response.date) {
    lines.push(
      state.currentLang === "zh"
        ? `发布时间：${response.date}`
        : `Release date: ${response.date}`
    );
  }

  if (response.body) {
    const notes = response.body.trim();
    if (notes) {
      lines.push("");
      lines.push(state.currentLang === "zh" ? "更新说明：" : "Release notes:");
      lines.push(notes);
    }
  }

  lines.push("");
  lines.push(state.currentLang === "zh" ? "现在安装这个更新吗？" : "Install this update now?");
  return lines.join("\n");
}

export function updateCheckButtonUi() {
  const btn = document.querySelector<HTMLButtonElement>("#check-update");
  if (!btn) return;
  if (state.pendingAppUpdate?.updateAvailable) {
    btn.textContent = state.appUpdateLastError ? t("action_retry_update") : t("action_install_update");
    return;
  }

  btn.textContent = t("action_check_update");
}

export function classifyUpdateErrorMessage(errorText: string): string {
  if (errorText.includes("timed out after 8 seconds")) {
    return t("log_update_timeout");
  }
  return `${t("log_update_failed")}: ${errorText}`;
}

export async function offerManualUpdateFallback() {
  const manualUrl =
    state.pendingAppUpdate?.manualDownloadUrl?.trim() || state.appUpdateManualDownloadUrl?.trim() || "";
  if (!manualUrl) {
    return;
  }

  const shouldOpen = window.confirm(t("log_update_manual_prompt"));
  if (!shouldOpen) {
    return;
  }

  try {
    await invoke("open_external_url", { url: manualUrl });
    appendLog(`${t("log_update_manual_download")}: ${manualUrl}`);
  } catch (error) {
    appendLog(`${t("platform_open_failed")}: ${String(error)}`);
  }
}

export async function startInstallPendingUpdate(response: AppUpdateCheckResponse) {
  appendLog(`${t("log_update_installing")} ${response.version ?? ""}`.trim());
  await invoke("install_app_update");
}

export async function handleCheckUpdate() {
  setStatus("updating", true);

  try {
    if (state.pendingAppUpdate?.updateAvailable) {
      const shouldInstall = window.confirm(buildUpdatePrompt(state.pendingAppUpdate));
      if (!shouldInstall) {
        appendLog(t("log_update_declined"));
        setStatus("idle", false);
        return;
      }

      state.appUpdateLastError = null;
      updateCheckButtonUi();
      await startInstallPendingUpdate(state.pendingAppUpdate);
      return;
    }

    const response = await invoke<AppUpdateCheckResponse>("check_for_app_update");
    state.appUpdateManualDownloadUrl = response.manualDownloadUrl ?? state.appUpdateManualDownloadUrl;
    if (!response.configured) {
      state.pendingAppUpdate = null;
      state.appUpdateLastError = null;
      appendLog(t("log_update_not_configured"));
      setStatus("idle", false);
      return;
    }

    if (response.sourcePath) {
      appendLog(`${t("log_update_source")}: ${response.sourcePath}`);
    }

    if (!response.updateAvailable) {
      state.pendingAppUpdate = null;
      state.appUpdateLastError = null;
      appendLog(`${t("log_update_not_available")} (${response.currentVersion})`);
      await message(`${t("log_update_not_available")} (${response.currentVersion})`, {
        title: t("action_check_update"),
        kind: "info"
      });
      setStatus("idle", false);
      return;
    }

    state.pendingAppUpdate = response;
    state.appUpdateLastError = null;
    updateCheckButtonUi();
    appendLog(`${t("log_update_available")} ${response.version ?? ""}`.trim());
    const shouldInstall = window.confirm(buildUpdatePrompt(response));
    if (!shouldInstall) {
      appendLog(t("log_update_declined"));
      setStatus("idle", false);
      return;
    }

    await startInstallPendingUpdate(response);
  } catch (error) {
    const errorText = String(error);
    if (errorText.includes("No update is currently available.")) {
      state.pendingAppUpdate = null;
    }
    const displayMessage = classifyUpdateErrorMessage(errorText);
    state.appUpdateLastError = displayMessage;
    appendLog(displayMessage);
    await message(displayMessage, {
      title: t("action_check_update"),
      kind: "warning"
    });
    await offerManualUpdateFallback();
    setStatus("idle", false);
  }
}

// ---- Settings help ----

const SETTING_HELP_CONTENT: Record<Lang, Record<string, { title: string; body: string }>> = {
  zh: {
    provider_preset: {
      title: "模型厂商",
      body: "用于快速套用常见平台的接入配置。\n\n选择厂商后，程序会自动填写对应的模型列表、Base URL 和推荐运行参数。只有在你接自建网关或特殊兼容接口时，才需要切到自定义。"
    },
    model: {
      title: "模型",
      body: "本次实际调用的大模型名称。\n\n如果厂商已内置常用模型，直接下拉选择即可；只有接私有模型名时才需要改成自定义模型。"
    },
    base_url: {
      title: "Base URL",
      body: "模型接口的根地址。\n\n对于 OpenAI 兼容接口，程序会向这个地址下的 `/chat/completions` 发请求。一般使用厂商默认值即可，只有代理网关或私有部署时才需要修改。"
    },
    api_key: {
      title: "API 密钥",
      body: "访问模型服务所需的鉴权密钥。\n\n当前桌面版会把密钥保存在本地配置中，界面默认隐藏显示，不会写入输出结果目录。"
    },
    qa_platform_url: {
      title: "QA评测平台地址",
      body: "QA 评测平台的统一访问地址。\n\n普通用户只需要填写这一个地址。程序会在内部自动派生页面地址和接口地址。开发联调时填写 `127.0.0.1` 或 `localhost` 也会自动拆到 3100 / 8100。"
    },
    qa_platform_username: {
      title: "QA评测用户名",
      body: "你在 QA 评测平台自己的账号。\n\n这里不是管理员账号。后续上传、自评和平台联通检查，都使用这个账号。"
    },
    qa_platform_password: {
      title: "QA评测密码",
      body: "你在 QA 评测平台自己的登录密码。\n\n密码会跟随本地设置保存，界面默认隐藏，不会写入 QA 结果批次目录。"
    },
    literature_api_url: {
      title: "文献 API 地址",
      body: "预留给文献增强链路的接口地址。\n\n当前你已要求先不接入正式生成流程，所以它现在主要是为后续扩展准备。"
    },
    literature_api_auth: {
      title: "文献 API 鉴权",
      body: "访问文献接口时使用的鉴权令牌或密钥。\n\n会跟随本地设置保存，不会写入输出批次目录。"
    },
    target_count: {
      title: "目标数量",
      body: "本次任务想最终生成多少条 QA。\n\n普通 QA 可以按正式生产规模填写。CoT QA 会自动限制在 100 条以内，避免一次测试过重。"
    },
    plan_limit: {
      title: "规划上限",
      body: "前置生成多少个候选问题计划。\n\n它不是最终 QA 数量，而是问题草案池。数量越高，主题覆盖可能更丰富，但前置规划也会更重。"
    },
    shard_size: {
      title: "Shard 大小",
      body: "每个结果分片文件最多包含多少条 QA。\n\n生成结果会按 `shard_XXXX.json` 分片保存，便于续跑、浏览和排错。它不能大于目标数量；CoT 模式下还会额外限制在 10 以内。"
    },
    batch_size: {
      title: "Batch 大小",
      body: "单次模型请求希望返回多少条 QA。\n\n值越大，速度可能更快，但模型更容易返回不稳定 JSON。它不能大于 shard 大小；CoT 模式固定为 1。"
    },
    max_in_flight: {
      title: "最大并发",
      body: "同时允许多少个生成请求并行发送。\n\n并发越高，速度可能越快，但也更容易触发限流、超时和格式不稳定。CoT 模式当前固定为 2，属于保守低并发。"
    },
    max_retries: {
      title: "最大重试",
      body: "单个请求失败后，最多再自动重试几次。\n\n适合应对临时网络抖动、上游限流或模型偶发返回异常。"
    },
    timeout_secs: {
      title: "超时秒数",
      body: "单个模型请求最多等待多久。\n\n如果回答很长或上游较慢，超时过短会导致误判失败；过长则会拖慢失败恢复。"
    },
    resume_existing: {
      title: "续跑已有 shard",
      body: "重新运行时，如果某些 shard 文件已经存在，是否直接跳过。\n\n适合长任务中断后的恢复，不必从头再跑全部分片。"
    }
  },
  en: {
    provider_preset: {
      title: "Model Provider",
      body: "Applies a ready-made vendor preset.\n\nChoosing a provider fills the model list, Base URL, and suggested runtime defaults. Use Custom only for private gateways or unusual compatible endpoints."
    },
    model: {
      title: "Model",
      body: "The actual model name used for generation.\n\nPick from the built-in list when available. Use a custom model only when you need a private or non-listed model id."
    },
    base_url: {
      title: "Base URL",
      body: "Root endpoint for the model API.\n\nFor OpenAI-compatible providers, the app sends requests to `/chat/completions` under this base URL. Most users should keep the vendor default."
    },
    api_key: {
      title: "API Key",
      body: "Authentication key for the model service.\n\nThe desktop app stores it in the local config, hides it by default in the UI, and does not write it into output batch folders."
    },
    qa_platform_url: {
      title: "QA Platform URL",
      body: "Unified base address for the QA evaluation platform.\n\nOrdinary users only need this one field. The app derives the web base and API base internally."
    },
    qa_platform_username: {
      title: "QA Platform Username",
      body: "Your own account on the QA evaluation platform.\n\nThis is not an admin account. Upload, self-review, and platform checks use this account."
    },
    qa_platform_password: {
      title: "QA Platform Password",
      body: "Your own login password for the QA evaluation platform.\n\nIt is stored with local settings, hidden in the UI by default, and never written into generated batch folders."
    },
    literature_api_url: {
      title: "Literature API URL",
      body: "Reserved endpoint for literature-enhanced workflows.\n\nIt is currently kept as a future integration field and is not yet part of the active generation path."
    },
    literature_api_auth: {
      title: "Literature API Auth",
      body: "Token or key used to access the literature API.\n\nIt is stored with the local settings and not written into output batch folders."
    },
    target_count: {
      title: "Target Count",
      body: "How many QA items this run should produce overall.\n\nNormal QA can use production-scale counts. CoT QA is automatically capped at 100 items for safer testing."
    },
    plan_limit: {
      title: "Plan Limit",
      body: "How many candidate question plans to draft before generation.\n\nThis is not the final QA count. A larger pool can improve coverage but makes the planning phase heavier."
    },
    shard_size: {
      title: "Shard Size",
      body: "Maximum QA items written into one shard file.\n\nOutputs are saved as `shard_XXXX.json` files for resume, browse, and debugging. It cannot exceed the target count, and CoT mode also caps it at 10."
    },
    batch_size: {
      title: "Batch Size",
      body: "How many QA items one model request should return.\n\nLarger batches can be faster but are more likely to produce unstable JSON. It cannot exceed the shard size, and CoT mode fixes it at 1."
    },
    max_in_flight: {
      title: "Max In Flight",
      body: "How many generation requests can run at the same time.\n\nHigher concurrency may improve speed but also increases rate-limit, timeout, and formatting risks. CoT mode currently fixes it at 2 as a conservative low-concurrency setting."
    },
    max_retries: {
      title: "Max Retries",
      body: "Maximum automatic retries for one failed request.\n\nUseful for temporary network problems, upstream rate limits, or occasional malformed model responses."
    },
    timeout_secs: {
      title: "Timeout Secs",
      body: "How long one model request can wait before timing out.\n\nIf responses are long or the upstream is slow, values that are too small can fail otherwise valid runs."
    },
    resume_existing: {
      title: "Resume Existing Shards",
      body: "Whether to skip shard files that already exist when rerunning.\n\nUseful for recovering long jobs without regenerating completed shards."
    }
  }
};

export async function showSettingHelp(helpKey: string) {
  const content = SETTING_HELP_CONTENT[state.currentLang][helpKey];
  if (!content) {
    return;
  }

  await message(content.body, {
    title: content.title,
    kind: "info"
  });
}

// ---- Export logs ----

export function buildLogExportFileName() {
  const now = new Date();
  const parts = [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, "0"),
    String(now.getDate()).padStart(2, "0"),
    String(now.getHours()).padStart(2, "0"),
    String(now.getMinutes()).padStart(2, "0"),
    String(now.getSeconds()).padStart(2, "0")
  ];

  return `distill-studio-run-log-${parts.join("")}.txt`;
}

export async function exportLogs() {
  const logs = document.querySelector<HTMLElement>("#logs");
  const placeholderKey = findMatchingTranslationKey(logs?.textContent ?? null, ["no_run", "waiting_events"]);
  if (placeholderKey || !logs?.textContent?.trim()) {
    appendLog(t("log_export_empty"));
    return;
  }

  try {
    const fileName = buildLogExportFileName();
    const blob = new Blob([`${logs!.textContent!.trimEnd()}\n`], {
      type: "text/plain;charset=utf-8"
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = fileName;
    link.style.display = "none";
    document.body.append(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
    appendLog(formatMessage("log_exported_logs", fileName));
  } catch (error) {
    appendLog(`${t("log_export_failed")}: ${String(error)}`);
  }
}

// ---- Event handlers init ----

export function initSettingsEventHandlers(
  feedback2Panel: HTMLElement | null,
  checkUpdateButton: HTMLButtonElement | null,
  exportLogsButton: HTMLButtonElement | null,
) {
  // Feedback
  feedback2Panel?.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;

    const button = target.closest<HTMLButtonElement>("[data-feedback2-action]");
    const action = button?.dataset.feedback2Action;
    if (!action || button.disabled) return;

    if (action === "github") {
      const url = "https://github.com/AI4S-YB/distill-studio/issues/new";
      invoke("open_external_url", { url });
    }
  });

  feedback2Panel?.addEventListener("submit", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLFormElement)) return;
    if (target.id === "feedback2-form") {
      event.preventDefault();
      void handleFeedback2FormSubmit(event);
    }
  });

  // Check update
  checkUpdateButton?.addEventListener("click", async () => {
    await handleCheckUpdate();
  });

  // Export logs
  exportLogsButton?.addEventListener("click", () => {
    void exportLogs();
  });
}
