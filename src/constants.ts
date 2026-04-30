import type { Lang, ProviderPresetConfigKey, ProviderPresetConfig } from "./types";

const DEFAULT_COT_SECTION_HEADERS_EN = [
  "Workflow Summary",
  "Reference Milestones",
  "Reference Steps",
  "Step Rationale",
  "Decision Points",
  "Quality Checks",
  "Failure Modes",
  "Final Interpretation"
] as const;

const DEFAULT_COT_SECTION_HEADERS_ZH = [
  "研究流程概述",
  "参考里程碑",
  "参考步骤",
  "步骤依据",
  "关键决策点",
  "质量检查",
  "失败模式",
  "最终解释"
] as const;

function defaultCotSectionHeadersForLang(lang: Lang): string[] {
  return [...(lang === "zh" ? DEFAULT_COT_SECTION_HEADERS_ZH : DEFAULT_COT_SECTION_HEADERS_EN)];
}

function normalizeCotSectionHeaders(headers: string[] | null | undefined, lang: Lang): string[] {
  const normalized = (headers ?? [])
    .map((value) => value.trim().replace(/:+$/, "").trim())
    .filter(Boolean);
  return normalized.length ? normalized : defaultCotSectionHeadersForLang(lang);
}

function formatCotSectionHeaders(headers: readonly string[] | null | undefined, lang: Lang): string {
  return normalizeCotSectionHeaders(headers, lang).join("\n");
}

function isDefaultCotSectionHeaderText(value: string, lang: Lang): boolean {
  const normalized = formatCotSectionHeaders(value.split(/\r?\n/), lang);
  return (
    normalized === formatCotSectionHeaders(DEFAULT_COT_SECTION_HEADERS_ZH, lang) ||
    normalized === formatCotSectionHeaders(DEFAULT_COT_SECTION_HEADERS_EN, lang)
  );
}

const LANG_STORAGE_KEY = "distill-studio.lang";
const CHAT_SESSIONS_STORAGE_KEY = "distill-studio.chat-sessions";
const PAPER_QA_STORAGE_KEY = "distill-studio.paper-qa";
const DEFAULT_PROFILE_NAME = "default";
const AUTO_SAVE_DELAY_MS = 600;
const MANAGED_OUTPUT_DIR = "__managed__";
const CUSTOM_MODEL_VALUE = "__custom__";
const DEFAULT_COT_TARGET_COUNT = 10;
const COT_TARGET_COUNT_CAP = 100;

const PROVIDER_PRESETS: Record<ProviderPresetConfigKey, ProviderPresetConfig> = {
  qwen_dashscope: {
    provider: "openai-compatible",
    defaultModel: "qwen3.6-max-preview",
    models: [
      "qwen3.6-max-preview",
      "qwen3.6-plus",
      "qwen-plus",
      "qwen-max",
      "qwen-turbo",
      "qwen-long",
      "qwen3-max"
    ],
    baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1",
    batchSize: 8,
    maxInFlight: 4,
    requestTimeoutSecs: 180
  },
  deepseek: {
    provider: "openai-compatible",
    defaultModel: "deepseek-chat",
    models: ["deepseek-chat", "deepseek-reasoner"],
    baseUrl: "https://api.deepseek.com",
    batchSize: 8,
    maxInFlight: 4,
    requestTimeoutSecs: 240
  },
  moonshot_kimi: {
    provider: "openai-compatible",
    defaultModel: "kimi-latest-32k",
    models: ["kimi-latest-8k", "kimi-latest-32k", "kimi-latest-128k", "kimi-k2-0711-preview"],
    baseUrl: "https://api.moonshot.cn/v1",
    batchSize: 8,
    maxInFlight: 4,
    requestTimeoutSecs: 240
  },
  zhipu_glm: {
    provider: "openai-compatible",
    defaultModel: "glm-4.5-flash",
    models: ["glm-4.5-flash", "glm-4.5-air", "glm-4.5", "glm-5.1"],
    baseUrl: "https://open.bigmodel.cn/api/paas/v4",
    batchSize: 8,
    maxInFlight: 4,
    requestTimeoutSecs: 240
  },
  minimax: {
    provider: "openai-compatible",
    defaultModel: "MiniMax-M2.5",
    models: ["MiniMax-M2.5", "MiniMax-M2.5-Preview", "MiniMax-M1"],
    baseUrl: "https://api.minimaxi.com/v1",
    batchSize: 8,
    maxInFlight: 4,
    requestTimeoutSecs: 240
  },
  tencent_hunyuan: {
    provider: "openai-compatible",
    defaultModel: "hunyuan-turbos-latest",
    models: ["hunyuan-lite", "hunyuan-turbos-latest", "hunyuan-t1-latest"],
    baseUrl: "https://api.hunyuan.cloud.tencent.com/v1",
    batchSize: 8,
    maxInFlight: 4,
    requestTimeoutSecs: 240
  },
  baidu_qianfan: {
    provider: "openai-compatible",
    defaultModel: "ERNIE-4.5-Turbo-128K",
    models: ["ERNIE-4.5-Turbo-128K", "ERNIE-5.0", "ERNIE-X1.1"],
    baseUrl: "https://qianfan.baidubce.com/v2",
    batchSize: 8,
    maxInFlight: 4,
    requestTimeoutSecs: 240
  },
  stub_local: {
    provider: "stub",
    defaultModel: "stub-topic-distiller",
    models: ["stub-topic-distiller"],
    baseUrl: "",
    batchSize: 24,
    maxInFlight: 16,
    requestTimeoutSecs: 120
  }
} as const;

export {
  formatCotSectionHeaders,
  defaultCotSectionHeadersForLang,
  isDefaultCotSectionHeaderText,
  normalizeCotSectionHeaders,
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
  DEFAULT_COT_SECTION_HEADERS_ZH,
  DEFAULT_COT_SECTION_HEADERS_EN,
};
