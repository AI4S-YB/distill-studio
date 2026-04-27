import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const cwd = process.cwd();
const sourcePath = path.join(cwd, "docs", "design-doc-source.json");
const packageJsonPath = path.join(cwd, "package.json");
const checkVersionArgIndex = process.argv.indexOf("--check-version");
const checkVersion =
  checkVersionArgIndex >= 0 ? process.argv[checkVersionArgIndex + 1]?.trim() || "" : "";

async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, "utf8"));
}

function requireVersionEntry(source, version) {
  const entry = source.versionHistory.find((item) => item.version === version);
  if (!entry) {
    throw new Error(
      `Missing version entry ${version} in docs/design-doc-source.json. Add the date and highlights before release.`
    );
  }
  if (!entry.date?.trim()) {
    throw new Error(`Version ${version} is missing a release date in docs/design-doc-source.json.`);
  }
  if (!Array.isArray(entry.highlights) || entry.highlights.length === 0) {
    throw new Error(`Version ${version} has no highlights in docs/design-doc-source.json.`);
  }
  return entry;
}

function renderBulletSection(lines, title, items) {
  lines.push(`## ${title}`);
  lines.push("");
  for (const item of items) {
    lines.push(`- ${item}`);
  }
  lines.push("");
}

function renderVersionSection(lines, versionHistory) {
  lines.push("## 版本功能更新");
  lines.push("");
  for (const item of [...versionHistory].sort((left, right) =>
    left.version.localeCompare(right.version, undefined, { numeric: true })
  )) {
    lines.push(`### v${item.version} (${item.date})`);
    lines.push("");
    for (const highlight of item.highlights) {
      lines.push(`- ${highlight}`);
    }
    lines.push("");
  }
}

function buildDocument(source, currentVersion) {
  const now = new Date();
  const today = now.toISOString().slice(0, 10);
  const localDocPath = path.join(cwd, source.docFileName);

  const lines = [
    `# ${source.docTitle}`,
    "",
    `最后同步日期：${today}`,
    `当前版本：v${currentVersion}`,
    "",
    "## 文档位置",
    "",
    `- 当前目录本地文档：\`${localDocPath}\``,
    ...source.externalSyncTargets.map((target) => `- 外部同步副本：\`${target}\``),
    ""
  ];

  renderBulletSection(lines, "维护规则", source.maintenanceRules);
  renderBulletSection(lines, "软件定位", source.overview);
  renderBulletSection(lines, "主要功能", source.mainFunctions);
  renderBulletSection(lines, "当前架构", source.architecture);
  renderVersionSection(lines, source.versionHistory);

  return `${lines.join("\n").trim()}\n`;
}

async function main() {
  const source = await readJson(sourcePath);
  const packageJson = await readJson(packageJsonPath);
  const currentVersion = packageJson.version?.trim();

  if (!currentVersion) {
    throw new Error("package.json is missing version.");
  }

  if (checkVersion) {
    requireVersionEntry(source, checkVersion);
    console.log(`Version entry ${checkVersion} is ready in docs/design-doc-source.json`);
    return;
  }

  requireVersionEntry(source, currentVersion);
  const content = buildDocument(source, currentVersion);
  const localDocPath = path.join(cwd, source.docFileName);

  await writeFile(localDocPath, content, "utf8");
  console.log(`Updated local design doc: ${localDocPath}`);

  for (const target of source.externalSyncTargets) {
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, content, "utf8");
    console.log(`Synced external design doc: ${target}`);
  }
}

await main();
