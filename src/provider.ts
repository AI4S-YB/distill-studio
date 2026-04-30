import { invoke } from "@tauri-apps/api/core";
import type {
  ProviderPresetId,
  ProviderPresetConfigKey,
  ProviderPresetConfig,
  ResolvedLLMProvider,
  PipelineFormRequest,
} from "./types";
import type { PlatformGenerateModel } from "./state";
import {
  PROVIDER_PRESETS,
  CUSTOM_MODEL_VALUE,
  DEFAULT_COT_TARGET_COUNT,
  COT_TARGET_COUNT_CAP,
  DEFAULT_COT_SHARD_SIZE,
  COT_SAFE_SHARD_SIZE_CAP,
  DEFAULT_COT_BATCH_SIZE,
  DEFAULT_COT_MAX_IN_FLIGHT,
  FALLBACK_REAL_PROVIDER_PRESET,
  defaultCotSectionHeadersForLang,
} from "./constants";
import { state } from "./state";
import { t, formatMessage } from "./translations";
import { currentPresetLabel, currentModelValue } from "./utils";
import { currentPlatformAuthPayload } from "./platform";
import { normalizeRuntimeParameterInputs, renderSetupSummary } from "./topic-pipeline";
import { appendLog } from "./main";

// ---- DOM element references (owned by main.ts, assigned at init) ----
export let baseUrlInput: HTMLInputElement;
export let apiKeyInput: HTMLInputElement;
export let providerInput: HTMLSelectElement;
export let providerField: HTMLLabelElement;
export let modelInput: HTMLSelectElement;
export let customModelInput: HTMLInputElement;
export let customModelField: HTMLLabelElement;
export let batchSizeInput: HTMLInputElement;
export let maxInFlightInput: HTMLInputElement;
export let timeoutInput: HTMLInputElement;
export let providerPresetInput: HTMLSelectElement;

export function initProviderDomRefs(refs: {
  baseUrlInput: HTMLInputElement;
  apiKeyInput: HTMLInputElement;
  providerInput: HTMLSelectElement;
  providerField: HTMLLabelElement;
  modelInput: HTMLSelectElement;
  customModelInput: HTMLInputElement;
  customModelField: HTMLLabelElement;
  batchSizeInput: HTMLInputElement;
  maxInFlightInput: HTMLInputElement;
  timeoutInput: HTMLInputElement;
  providerPresetInput: HTMLSelectElement;
}) {
  baseUrlInput = refs.baseUrlInput;
  apiKeyInput = refs.apiKeyInput;
  providerInput = refs.providerInput;
  providerField = refs.providerField;
  modelInput = refs.modelInput;
  customModelInput = refs.customModelInput;
  customModelField = refs.customModelField;
  batchSizeInput = refs.batchSizeInput;
  maxInFlightInput = refs.maxInFlightInput;
  timeoutInput = refs.timeoutInput;
  providerPresetInput = refs.providerPresetInput;
}

export function resolveLLMProvider(): ResolvedLLMProvider {
  const settingsBaseUrl = baseUrlInput.value.trim();
  const settingsApiKey = apiKeyInput.value.trim();
  if (settingsBaseUrl && settingsApiKey) {
    return {
      mode: "settings",
      provider: providerInput.value.trim() || "openai-compatible",
      baseUrl: settingsBaseUrl,
      apiKey: settingsApiKey,
      model: currentModelValue(modelInput, customModelInput),
    };
  }

  const platformAuth = currentPlatformAuthPayload();
  if (state.platformLoginState.kind === "success" && platformAuth !== null) {
    const platformModel = currentPlatformGenerateModel();
    const model = platformModel?.model
      ?? (state.platformGenerateModels.length > 0 ? state.platformGenerateModels[0].model : "");
    if (model) {
      return {
        mode: "platform",
        platformUrl: platformAuth.platformUrl,
        username: platformAuth.username,
        password: platformAuth.password,
        model,
      };
    }
  }

  return { mode: "none", model: "" };
}

export function syncProviderFieldVisibility(presetId: ProviderPresetId) {
  providerField.hidden = presetId !== "custom";
}

export function syncModelOptions(presetId: ProviderPresetId, preferredModel?: string | null) {
  const resolvedModel = preferredModel?.trim() ?? currentModelValue(modelInput, customModelInput);
  const preset = presetId === "custom" ? null : PROVIDER_PRESETS[presetId as ProviderPresetConfigKey];
  const models = preset?.models ?? [];

  modelInput.replaceChildren();

  // Platform preset: populate from fetched platform models
  const resolved = resolveLLMProvider();
  if (presetId === "platform" || (resolved.mode === "platform" && state.platformGenerateModels.length > 0)) {
    for (const pm of state.platformGenerateModels) {
      const option = document.createElement("option");
      option.value = String(pm.id);
      option.textContent = `${pm.name} (${pm.model})`;
      option.dataset.platformModelId = String(pm.id);
      modelInput.append(option);
    }
    if (state.platformGenerateModels.length > 0) {
      const firstId = String(state.platformGenerateModels[0].id);
      modelInput.value = resolvedModel && state.platformGenerateModels.some(m => String(m.id) === resolvedModel) ? resolvedModel : firstId;
      modelInput.dispatchEvent(new Event("change"));
    }
    customModelField.hidden = true;
    return;
  }

  for (const model of models) {
    const option = document.createElement("option");
    option.value = model;
    option.textContent = model;
    modelInput.append(option);
  }

  const customOption = document.createElement("option");
  customOption.value = CUSTOM_MODEL_VALUE;
  customOption.textContent = t("model_custom_option");
  modelInput.append(customOption);

  const shouldUseCustomModel =
    presetId === "custom" || Boolean(resolvedModel && !models.includes(resolvedModel));

  if (shouldUseCustomModel) {
    modelInput.value = CUSTOM_MODEL_VALUE;
    customModelField.hidden = false;
    customModelInput.value = resolvedModel;
    return;
  }

  customModelField.hidden = true;
  customModelInput.value = "";
  modelInput.value = resolvedModel && models.includes(resolvedModel) ? resolvedModel : preset?.defaultModel ?? "";
}

export function detectProviderPreset(fields: {
  provider: string;
  baseUrl: string | null;
}): ProviderPresetId {
  const provider = fields.provider.trim();
  const baseUrl = (fields.baseUrl ?? "").trim();

  for (const [presetId, preset] of Object.entries(PROVIDER_PRESETS) as Array<
    [ProviderPresetConfigKey, ProviderPresetConfig]
  >) {
    if (provider === preset.provider && baseUrl === preset.baseUrl) {
      return presetId;
    }
  }

  return "custom";
}

export function migrateLegacyStubRequest(request: PipelineFormRequest): PipelineFormRequest {
  const presetId = detectProviderPreset({
    provider: request.provider,
    baseUrl: request.baseUrl
  });
  if (request.provider !== "stub" && presetId !== "stub_local") {
    return request;
  }

  const preset = PROVIDER_PRESETS[FALLBACK_REAL_PROVIDER_PRESET];
  return {
    ...request,
    provider: preset.provider,
    model: preset.defaultModel,
    baseUrl: preset.baseUrl,
    apiKey: null,
    batchSize: preset.batchSize,
    maxInFlight: preset.maxInFlight,
    requestTimeoutSecs: preset.requestTimeoutSecs
  };
}

export function normalizeLoadedCotRequest(request: PipelineFormRequest): PipelineFormRequest {
  const normalizedHeaders = (() => {
    const normalized = (request.cotSectionHeaders ?? [])
      .map((value) => value.trim().replace(/:+$/, "").trim())
      .filter(Boolean);
    return normalized.length
      ? normalized
      : defaultCotSectionHeadersForLang(request.outputLanguage ?? state.currentLang);
  })();
  if (request.qaMode !== "cot") {
    const currentHeaders = request.cotSectionHeaders ?? [];
    return currentHeaders.length === normalizedHeaders.length &&
      currentHeaders.every((value, index) => value === normalizedHeaders[index])
      ? request
      : { ...request, cotSectionHeaders: normalizedHeaders };
  }

  const nextTargetCount = Math.min(request.targetCount || DEFAULT_COT_TARGET_COUNT, COT_TARGET_COUNT_CAP);
  const nextShardSize = Math.min(
    Math.max(request.shardSize || DEFAULT_COT_SHARD_SIZE, 1),
    Math.min(nextTargetCount, COT_SAFE_SHARD_SIZE_CAP)
  );
  const nextBatchSize = DEFAULT_COT_BATCH_SIZE;
  const nextMaxInFlight = DEFAULT_COT_MAX_IN_FLIGHT;

  if (
    nextTargetCount === request.targetCount &&
    nextShardSize === request.shardSize &&
    nextBatchSize === request.batchSize &&
    nextMaxInFlight === request.maxInFlight
  ) {
    return request;
  }

  return {
    ...request,
    cotSectionHeaders: normalizedHeaders,
    targetCount: nextTargetCount,
    shardSize: nextShardSize,
    batchSize: nextBatchSize,
    maxInFlight: nextMaxInFlight
  };
}

export async function loadPlatformGenerateModels() {
  const auth = currentPlatformAuthPayload();
  if (!auth) {
    state.platformGenerateModels = [];
    state.selectedPlatformModelId = null;
    return;
  }
  try {
    state.platformGenerateModels = await invoke<PlatformGenerateModel[]>("get_generate_models", auth);
  } catch {
    state.platformGenerateModels = [];
  }
}

export function updatePlatformPresetOption() {
  const opt = document.querySelector<HTMLOptionElement>("#provider-preset-option-platform");
  if (!opt) return;
  // Always keep "platform" hidden as a manual option — it is auto-detected.
  opt.hidden = true;
  // If current preset is "platform" but no longer valid, reset to first available
  const resolved = resolveLLMProvider();
  if (providerPresetInput.value === "platform" && resolved.mode !== "platform") {
    const firstPreset = providerPresetInput.querySelector<HTMLOptionElement>("option:not([hidden]):not([value=platform])");
    if (firstPreset) {
      providerPresetInput.value = firstPreset.value;
      applyProviderPreset(firstPreset.value as ProviderPresetId);
    }
  }
}

export function currentPlatformGenerateModel(): PlatformGenerateModel | null {
  if (!(state.selectedPlatformModelId !== null && state.platformLoginState.kind === "success")) return null;
  return state.platformGenerateModels.find(m => m.id === state.selectedPlatformModelId) ?? null;
}

export function syncProviderPresetInput() {
  updatePlatformPresetOption();
  const resolved = resolveLLMProvider();
  let presetId: ProviderPresetId;
  if (resolved.mode === "platform") {
    presetId = "platform";
  } else {
    presetId = detectProviderPreset({
      provider: providerInput.value,
      baseUrl: baseUrlInput.value
    });
  }
  providerPresetInput.value = presetId;
  syncProviderFieldVisibility(presetId);
  syncModelOptions(presetId);
}

export function applyProviderPreset(presetId: ProviderPresetId, logChange = false) {
  if (presetId === "custom") {
    providerPresetInput.value = "custom";
    syncProviderFieldVisibility("custom");
    syncModelOptions("custom");
    normalizeRuntimeParameterInputs(true);
    renderSetupSummary();
    return;
  }

  if (presetId === "platform") {
    providerPresetInput.value = "platform";
    syncProviderFieldVisibility("platform");
    syncModelOptions("platform");
    normalizeRuntimeParameterInputs(true);
    renderSetupSummary();
    return;
  }

  const preset = PROVIDER_PRESETS[presetId];
  providerInput.value = preset.provider;
  baseUrlInput.value = preset.baseUrl;
  batchSizeInput.value = String(preset.batchSize);
  maxInFlightInput.value = String(preset.maxInFlight);
  timeoutInput.value = String(preset.requestTimeoutSecs);
  providerPresetInput.value = presetId;
  syncProviderFieldVisibility(presetId);
  syncModelOptions(presetId, preset.defaultModel);
  normalizeRuntimeParameterInputs(true);
  renderSetupSummary();

  if (logChange) {
    appendLog(formatMessage("log_applied_preset", currentPresetLabel(presetId)));
  }
}
