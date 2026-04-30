import { describe, it, expect } from "vitest";

// Exact copy of the escapeHtml implementation from src/main.ts:4672
function escapeHtml(value: string): string {
  if (value == null || typeof value !== "string") return "";
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;")
    .replaceAll("'", "&#39;");
}

describe("escapeHtml", () => {
  it("escapes < and >", () => {
    expect(escapeHtml("<script>")).toBe("&lt;script&gt;");
  });

  it("escapes &", () => {
    expect(escapeHtml("A & B")).toBe("A &amp; B");
  });

  it("escapes double and single quotes", () => {
    expect(escapeHtml('"hello"')).toBe("&quot;hello&quot;");
    expect(escapeHtml("it's")).toBe("it&#39;s");
  });

  it("leaves normal text unchanged", () => {
    expect(escapeHtml("Hello, world!")).toBe("Hello, world!");
  });

  it("escapes all characters in a combined string", () => {
    expect(escapeHtml("<a href='x'>&\"</a>")).toBe(
      "&lt;a href=&#39;x&#39;&gt;&amp;&quot;&lt;/a&gt;"
    );
  });

  it("handles empty string", () => {
    expect(escapeHtml("")).toBe("");
  });
});
