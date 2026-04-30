import { describe, it, expect } from "vitest";

// Minimal reproduction of t() semantics from src/main.ts:3352
// t(key) returns translations[currentLang][key] ?? key
function makeT(lang: string, dict: Record<string, Record<string, string>>) {
  return (key: string): string => {
    return dict[lang]?.[key] ?? key;
  };
}

const miniTranslations: Record<string, Record<string, string>> = {
  zh: {
    hello: "你好",
    world: "世界",
    paper_qa_tab: "文献问答",
  },
  en: {
    hello: "Hello",
    world: "World",
    paper_qa_tab: "Paper QA",
  },
};

describe("t()", () => {
  it("returns Chinese translation when lang is zh", () => {
    const t = makeT("zh", miniTranslations);
    expect(t("hello")).toBe("你好");
  });

  it("returns English translation when lang is en", () => {
    const t = makeT("en", miniTranslations);
    expect(t("hello")).toBe("Hello");
  });

  it("returns the key itself when translation is missing", () => {
    const t = makeT("zh", miniTranslations);
    expect(t("nonexistent_key")).toBe("nonexistent_key");
  });

  it("returns key when lang has no entry for that key", () => {
    const t = makeT("en", miniTranslations);
    // 'paper_qa_tab' exists in zh and en, but not in a hypothetical 'fr'
    const tFr = makeT("fr", miniTranslations);
    expect(tFr("paper_qa_tab")).toBe("paper_qa_tab");
  });

  it("handles empty string key", () => {
    const t = makeT("en", miniTranslations);
    expect(t("")).toBe("");
  });
});
