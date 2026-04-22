import { execFile } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const cwd = process.cwd();

async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, "utf8"));
}

function parseGithubRepo(remoteUrl) {
  if (!remoteUrl) {
    return null;
  }

  const sshMatch = remoteUrl.match(/github\.com:([^/]+\/[^/.]+)(?:\.git)?$/);
  if (sshMatch) {
    return sshMatch[1];
  }

  const httpsMatch = remoteUrl.match(/github\.com\/([^/]+\/[^/.]+)(?:\.git)?$/);
  if (httpsMatch) {
    return httpsMatch[1];
  }

  return null;
}

async function readGitOrigin() {
  try {
    const { stdout } = await execFileAsync("git", ["remote", "get-url", "origin"], { cwd });
    return stdout.trim();
  } catch {
    return "";
  }
}

function print(line = "") {
  process.stdout.write(`${line}\n`);
}

async function main() {
  const packageJson = await readJson(path.join(cwd, "package.json"));
  const tauriConf = await readJson(path.join(cwd, "src-tauri", "tauri.conf.json"));
  const cargoToml = await readFile(path.join(cwd, "Cargo.toml"), "utf8");
  const cargoVersion = cargoToml.match(/^\s*version = "([^"]+)"/m)?.[1] ?? null;
  const packageVersion = packageJson.version ?? null;
  const tauriVersion = tauriConf.version ?? null;
  const version = packageVersion ?? tauriVersion ?? cargoVersion ?? "unknown";
  const tag = `app-v${version}`;
  const productName = tauriConf.productName ?? "QA小灶";
  const appTitle = tauriConf.app?.windows?.[0]?.title ?? productName;
  const remoteUrl = await readGitOrigin();
  const githubRepo = parseGithubRepo(remoteUrl) ?? "AI4S-YB/distill-studio";
  const releaseUrl = `https://github.com/${githubRepo}/releases/tag/${tag}`;
  const latestJsonUrl = `https://github.com/${githubRepo}/releases/latest/download/latest.json`;
  const expectedAssets = [
    `${productName}_${version}_x64-setup.exe`,
    `${productName}_${version}_x64_en-US.msi`,
    "latest.json",
    "windows updater artifact (.sig + archive)"
  ];
  const versionConsistent =
    Boolean(version) &&
    cargoVersion === packageVersion &&
    packageVersion === tauriVersion;

  const lines = [
    "# 发布摘要",
    "",
    `- 产品名称：${productName}`,
    `- 窗口标题：${appTitle}`,
    `- 版本号：${version}`,
    `- 版本一致性：${versionConsistent ? "OK" : `需检查 cargo=${cargoVersion}, package=${packageVersion}, tauri=${tauriVersion}`}`,
    `- Git tag：${tag}`,
    `- GitHub 仓库：${githubRepo}`,
    `- Release 页面：${releaseUrl}`,
    `- latest.json 地址：${latestJsonUrl}`,
    "",
    "## 预期交付物",
    "",
    ...expectedAssets.map((asset) => `- ${asset}`),
    "",
    "## 建议发布步骤",
    "",
    `1. npm run build`,
    `2. cargo check --manifest-path src-tauri/Cargo.toml`,
    `3. npm run release:preflight`,
    `4. npm run release:summary`,
    `5. npm run tauri:build:release`,
    `6. git tag ${tag}`,
    `7. git push origin ${tag}`,
    `8. 上传安装包、latest.json 和 updater 产物到 GitHub Releases`
  ];

  const outputDir = path.join(cwd, "dist");
  const outputPath = path.join(outputDir, `release-summary-v${version}.md`);
  await mkdir(outputDir, { recursive: true });
  await writeFile(outputPath, `${lines.join("\n")}\n`, "utf8");

  for (const line of lines) {
    print(line);
  }
  print("");
  print(`已写入 ${outputPath}`);
}

await main();
