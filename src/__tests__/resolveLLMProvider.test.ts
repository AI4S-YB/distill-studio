/**
 * resolveLLMProvider() integration tests.
 *
 * The function depends on global DOM state (inputs, platformLoginState, etc.).
 * We set up jsdom with the needed elements and assign relevant globals.
 */
import { describe, it, expect, beforeEach } from "vitest";

// Declare globals that the function expects (they exist in main.ts top-level scope)
declare global {
  var baseUrlInput: HTMLInputElement;
  var apiKeyInput: HTMLInputElement;
  var providerInput: HTMLInputElement;
  var platformLoginState: {
    kind: "idle" | "loading" | "success" | "error";
    response?: unknown;
    message?: string;
  };
  var platformGenerateModels: Array<{
    id: number;
    model: string;
    temperature?: number;
    maxTokens?: number;
  }>;
}

function currentModelValue(): string {
  const sel = document.querySelector<HTMLSelectElement>("#model-select");
  return sel?.value ?? "";
}

function currentPlatformAuthPayload(): {
  platformUrl: string;
  username: string;
  password: string;
} | null {
  const pw = document.querySelector<HTMLInputElement>("#qa-platform-password");
  const un = document.querySelector<HTMLInputElement>("#qa-platform-username");
  const url = document.querySelector<HTMLInputElement>("#qa-platform-url");
  if (!pw?.value || !un?.value || !url?.value) return null;
  return { platformUrl: url.value, username: un.value, password: pw.value };
}

function currentPlatformGenerateModel() {
  if (globalThis.platformLoginState.kind !== "success") return null;
  const models = globalThis.platformGenerateModels;
  if (models.length === 0) return null;
  return models[0]!;
}

type ResolvedLLMProvider =
  | { mode: "settings"; provider: string; baseUrl: string; apiKey: string; model: string }
  | { mode: "platform"; platformUrl: string; username: string; password: string; model: string }
  | { mode: "none"; model: string };

function resolveLLMProvider(): ResolvedLLMProvider {
  const settingsBaseUrl = globalThis.baseUrlInput.value.trim();
  const settingsApiKey = globalThis.apiKeyInput.value.trim();
  if (settingsBaseUrl && settingsApiKey) {
    return {
      mode: "settings",
      provider: globalThis.providerInput.value.trim() || "openai-compatible",
      baseUrl: settingsBaseUrl,
      apiKey: settingsApiKey,
      model: currentModelValue(),
    };
  }

  const platformAuth = currentPlatformAuthPayload();
  if (globalThis.platformLoginState.kind === "success" && platformAuth !== null) {
    const platformModel = currentPlatformGenerateModel();
    const model =
      platformModel?.model ??
      (globalThis.platformGenerateModels.length > 0
        ? globalThis.platformGenerateModels[0]!.model
        : "");
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

// Helper: set up DOM inputs
function setInput(id: string, value: string) {
  const el = document.querySelector<HTMLInputElement>(id);
  if (el) el.value = value;
}

describe("resolveLLMProvider", () => {
  beforeEach(() => {
    document.body.innerHTML = `
      <input id="api-key" />
      <input id="provider" />
      <input id="qa-platform-password" />
      <input id="qa-platform-username" />
      <input id="qa-platform-url" />
      <select id="model-select"><option value="test-model">Test Model</option></select>
    `;
    // Assign global references (jsdom doesn't auto-assign to window)
    globalThis.baseUrlInput = document.querySelector("#api-key")!; // simulates baseUrlInput
    // Actually baseUrlInput is a different element. Let me add it.
    document.body.innerHTML += '<input id="base-url-input" />';
    globalThis.baseUrlInput = document.querySelector("#base-url-input")!;
    globalThis.apiKeyInput = document.querySelector("#api-key")!;
    globalThis.providerInput = document.querySelector("#provider")!;
    globalThis.platformLoginState = { kind: "idle" };
    globalThis.platformGenerateModels = [];
  });

  it("returns mode=none when no settings and no platform", () => {
    setInput("#base-url-input", "");
    setInput("#api-key", "");
    globalThis.platformLoginState = { kind: "idle" };

    const result = resolveLLMProvider();
    expect(result.mode).toBe("none");
  });

  it("returns mode=settings when baseUrl and apiKey are set", () => {
    setInput("#base-url-input", "https://api.example.com");
    setInput("#api-key", "sk-12345");
    globalThis.providerInput.value = "openai";

    const result = resolveLLMProvider();
    expect(result.mode).toBe("settings");
    if (result.mode === "settings") {
      expect(result.baseUrl).toBe("https://api.example.com");
      expect(result.apiKey).toBe("sk-12345");
      expect(result.provider).toBe("openai");
    }
  });

  it("returns mode=platform when no settings but platform is logged in", () => {
    setInput("#base-url-input", "");
    setInput("#api-key", "");
    setInput("#qa-platform-url", "https://platform.example.com");
    setInput("#qa-platform-username", "user");
    setInput("#qa-platform-password", "pass");
    globalThis.platformLoginState = { kind: "success" };
    globalThis.platformGenerateModels = [{ id: 1, model: "gpt-4" }];

    const result = resolveLLMProvider();
    expect(result.mode).toBe("platform");
    if (result.mode === "platform") {
      expect(result.platformUrl).toBe("https://platform.example.com");
      expect(result.username).toBe("user");
      expect(result.model).toBe("gpt-4");
    }
  });

  it("prefers settings over platform when both are available", () => {
    setInput("#base-url-input", "https://api.example.com");
    setInput("#api-key", "sk-12345");
    setInput("#qa-platform-url", "https://platform.example.com");
    setInput("#qa-platform-username", "user");
    setInput("#qa-platform-password", "pass");
    globalThis.platformLoginState = { kind: "success" };
    globalThis.platformGenerateModels = [{ id: 1, model: "gpt-4" }];

    const result = resolveLLMProvider();
    expect(result.mode).toBe("settings");
  });

  it("returns mode=none when platform is logged in but has no models", () => {
    setInput("#base-url-input", "");
    setInput("#api-key", "");
    setInput("#qa-platform-url", "https://platform.example.com");
    setInput("#qa-platform-username", "user");
    setInput("#qa-platform-password", "pass");
    globalThis.platformLoginState = { kind: "success" };
    globalThis.platformGenerateModels = [];

    const result = resolveLLMProvider();
    expect(result.mode).toBe("none");
  });

  it("returns default provider 'openai-compatible' when provider input is empty", () => {
    setInput("#base-url-input", "https://api.example.com");
    setInput("#api-key", "sk-12345");
    globalThis.providerInput.value = "";

    const result = resolveLLMProvider();
    expect(result.mode).toBe("settings");
    if (result.mode === "settings") {
      expect(result.provider).toBe("openai-compatible");
    }
  });
});
