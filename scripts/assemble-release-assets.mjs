import { access, cp, mkdir, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { constants } from "node:fs";
import path from "node:path";

const cwd = process.cwd();
const sourceDir = path.resolve(process.argv[2] ?? path.join("dist", "release-downloads"));
const outputDir = path.resolve(process.argv[3] ?? path.join("dist", "release-publish"));
const releaseNotes = "Download the installer assets to install or update Distill Studio.";

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
      continue;
    }
    files.push(nextPath);
  }
  return files;
}

function normalizeRepoSlug(value) {
  return (value || "").replace(/^https:\/\/github\.com\//, "").replace(/\.git$/, "");
}

function registerPlatform(platforms, key, url, signature) {
  if (!signature) {
    throw new Error(`Missing signature for ${key}: ${url}`);
  }
  platforms[key] = { signature, url };
}

function inferMacArch(assetNames) {
  const macAssets = assetNames.filter(
    (name) => name.endsWith(".dmg") || name.endsWith(".app.tar.gz") || name.endsWith(".app.tar.gz.sig")
  );
  if (macAssets.some((name) => name.includes("aarch64"))) {
    return "aarch64";
  }
  if (macAssets.some((name) => name.includes("x64") || name.includes("x86_64"))) {
    return "x86_64";
  }
  return "aarch64";
}

async function main() {
  if (!(await exists(sourceDir))) {
    throw new Error(`Release artifact source directory not found: ${sourceDir}`);
  }

  const packageJson = await readJson(path.join(cwd, "package.json"));
  const tauriConf = await readJson(path.join(cwd, "src-tauri", "tauri.conf.json"));
  const version = packageJson.version ?? tauriConf.version ?? "unknown";
  const productName = tauriConf.productName ?? "DistillStudio";
  const tag = process.env.RELEASE_TAG?.trim() || process.env.GITHUB_REF_NAME?.trim() || `app-v${version}`;
  const repo =
    normalizeRepoSlug(process.env.GITHUB_REPOSITORY?.trim()) || "AI4S-YB/distill-studio";
  const baseUrl = `https://github.com/${repo}/releases/download/${tag}`;

  const allFiles = await walkFiles(sourceDir);
  const files = [];
  for (const filePath of allFiles) {
    const fileStat = await stat(filePath);
    if (fileStat.isFile()) {
      files.push(filePath);
    }
  }
  if (!files.length) {
    throw new Error(`No files found under ${sourceDir}`);
  }

  await rm(outputDir, { recursive: true, force: true });
  await mkdir(outputDir, { recursive: true });

  const copiedNames = new Set();
  const assetFiles = [];
  for (const filePath of files) {
    const baseName = path.basename(filePath);
    if (copiedNames.has(baseName)) {
      throw new Error(`Duplicate artifact name detected: ${baseName}`);
    }
    const targetPath = path.join(outputDir, baseName);
    await cp(filePath, targetPath, { force: true });
    copiedNames.add(baseName);
    assetFiles.push(targetPath);
  }

  const byName = new Map(assetFiles.map((filePath) => [path.basename(filePath), filePath]));
  const readSig = async (name) => {
    const sigPath = byName.get(`${name}.sig`);
    return sigPath ? (await readFile(sigPath, "utf8")).trim() : "";
  };
  const makeUrl = (name) => `${baseUrl}/${encodeURIComponent(name)}`;
  const platforms = {};
  const assetNames = [...byName.keys()];
  const macArch = inferMacArch(assetNames);

  for (const name of assetNames) {
    if (name === "latest.json" || name.endsWith(".sig")) {
      continue;
    }

    if (name.endsWith(".AppImage")) {
      const signature = await readSig(name);
      registerPlatform(platforms, "linux-x86_64", makeUrl(name), signature);
      registerPlatform(platforms, "linux-x86_64-appimage", makeUrl(name), signature);
      continue;
    }

    if (name.endsWith(".deb")) {
      registerPlatform(platforms, "linux-x86_64-deb", makeUrl(name), await readSig(name));
      continue;
    }

    if (name.endsWith(".rpm")) {
      registerPlatform(platforms, "linux-x86_64-rpm", makeUrl(name), await readSig(name));
      continue;
    }

    if (name.endsWith("_x64_en-US.msi")) {
      const signature = await readSig(name);
      registerPlatform(platforms, "windows-x86_64", makeUrl(name), signature);
      registerPlatform(platforms, "windows-x86_64-msi", makeUrl(name), signature);
      continue;
    }

    if (name.endsWith("_x64-setup.exe")) {
      registerPlatform(platforms, "windows-x86_64-nsis", makeUrl(name), await readSig(name));
      continue;
    }

    if (name.endsWith(".app.tar.gz")) {
      const signature = await readSig(name);
      registerPlatform(platforms, `darwin-${macArch}`, makeUrl(name), signature);
      registerPlatform(platforms, `darwin-${macArch}-app`, makeUrl(name), signature);
    }
  }

  if (!Object.keys(platforms).length) {
    throw new Error("Failed to infer any updater platforms from release artifacts.");
  }

  const latestJson = {
    version,
    notes: releaseNotes,
    pub_date: new Date().toISOString(),
    platforms
  };

  const latestJsonPath = path.join(outputDir, "latest.json");
  await writeFile(latestJsonPath, `${JSON.stringify(latestJson, null, 2)}\n`, "utf8");

  process.stdout.write(`Prepared ${assetFiles.length + 1} release files in ${outputDir}\n`);
  for (const filePath of [...assetFiles, latestJsonPath]) {
    process.stdout.write(`- ${path.relative(cwd, filePath)}\n`);
  }
}

await main();
