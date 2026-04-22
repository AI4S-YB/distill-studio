import { access, mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { constants } from "node:fs";
import path from "node:path";

const cwd = process.cwd();

async function exists(filePath) {
  try {
    await access(filePath, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, "utf8"));
}

async function walkFiles(rootDir) {
  const entries = await readdir(rootDir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const nextPath = path.join(rootDir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await walkFiles(nextPath)));
    } else {
      files.push(nextPath);
    }
  }
  return files;
}

async function main() {
  const tauriConf = await readJson(path.join(cwd, "src-tauri", "tauri.conf.json"));
  const packageJson = await readJson(path.join(cwd, "package.json"));
  const version = packageJson.version ?? tauriConf.version ?? "unknown";
  const productName = tauriConf.productName ?? "QA小灶";
  const bundleCandidates = [
    path.join(cwd, "target", "release", "bundle"),
    path.join(cwd, "src-tauri", "target", "release", "bundle")
  ];
  const bundleDir = (
    await Promise.all(
      bundleCandidates.map(async (candidate) => ((await exists(candidate)) ? candidate : null))
    )
  ).find(Boolean);

  if (!bundleDir) {
    console.error("No bundle directory found.");
    console.error("Expected one of:");
    for (const candidate of bundleCandidates) {
      console.error(`- ${candidate}`);
    }
    process.exit(1);
  }

  const files = await walkFiles(bundleDir);
  const installers = files.filter((file) => /\.(exe|msi|dmg|appimage|deb|rpm)$/i.test(file));
  const updaterFiles = files.filter((file) => {
    const base = path.basename(file).toLowerCase();
    return base === "latest.json" || base.endsWith(".sig") || /\.(tar\.gz|zip)$/i.test(base);
  });
  const currentVersionMarkers = [version, `_${version}_`, `-${version}-`, ` v${version}`];
  const currentProductMarkers = [productName.toLowerCase(), "qa小灶"];
  const isCurrentArtifact = (file) => {
    const normalized = path.basename(file).toLowerCase();
    const versionMatches = currentVersionMarkers.some((marker) => normalized.includes(marker.toLowerCase()));
    const productMatches =
      currentProductMarkers.some((marker) => normalized.includes(marker)) ||
      normalized === "latest.json" ||
      normalized.endsWith(".sig");
    return versionMatches || productMatches;
  };
  const currentInstallers = installers.filter(isCurrentArtifact);
  const staleInstallers = installers.filter((file) => !isCurrentArtifact(file));
  const currentUpdaterFiles = updaterFiles.filter(isCurrentArtifact);
  const staleUpdaterFiles = updaterFiles.filter((file) => !isCurrentArtifact(file));

  const lines = [
    "# 发布资产清单",
    "",
    `- 版本号：${version}`,
    `- 产品名称：${productName}`,
    `- bundle 目录：${bundleDir}`,
    "",
    "## 当前版本安装包",
    "",
    ...(currentInstallers.length
      ? currentInstallers.map((file) => `- ${path.relative(cwd, file)}`)
      : ["- 未发现匹配当前版本的安装包"]),
    "",
    "## 当前版本 Updater 相关产物",
    "",
    ...(currentUpdaterFiles.length
      ? currentUpdaterFiles.map((file) => `- ${path.relative(cwd, file)}`)
      : ["- 未发现匹配当前版本的 latest.json / .sig / archive"]),
    "",
    "## 历史残留产物",
    "",
    ...(!staleInstallers.length && !staleUpdaterFiles.length
      ? ["- 未发现历史残留产物"]
      : [...staleInstallers, ...staleUpdaterFiles].map((file) => `- ${path.relative(cwd, file)}`)),
    "",
    "## 上传建议",
    "",
    "- 只上传“当前版本”分组中的产物",
    "- 上传安装包",
    "- 上传 latest.json",
    "- 上传对应平台的签名产物和 updater archive",
    "- 如果存在“历史残留产物”，发布前先人工确认不要误传"
  ];

  const outputDir = path.join(cwd, "dist");
  const outputPath = path.join(outputDir, `release-assets-v${version}.md`);
  await mkdir(outputDir, { recursive: true });
  await writeFile(outputPath, `${lines.join("\n")}\n`, "utf8");

  process.stdout.write(`${lines.join("\n")}\n\n`);
  process.stdout.write(`已写入 ${outputPath}\n`);
}

await main();
