import { access, cp, mkdir, readdir, rm, stat } from "node:fs/promises";
import { constants } from "node:fs";
import path from "node:path";

const cwd = process.cwd();
const stageName = process.argv[2]?.trim() || "default";

async function exists(filePath) {
  try {
    await access(filePath, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

async function readJson(filePath) {
  return JSON.parse(await (await import("node:fs/promises")).readFile(filePath, "utf8"));
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

function isReleaseAsset(filePath) {
  const base = path.basename(filePath);
  if (base.endsWith(".app")) {
    return false;
  }
  return (
    /\.(exe|msi|dmg|appimage|deb|rpm)$/i.test(base) ||
    base.endsWith(".sig") ||
    base.endsWith(".tar.gz") ||
    base.endsWith(".zip")
  );
}

function isCurrentArtifact(filePath, version, productName) {
  const normalized = path.basename(filePath).toLowerCase();
  const versionMarkers = [version, `_${version}_`, `-${version}-`, `_${version}.`, `-${version}.`];
  const productMarkers = [
    productName.toLowerCase(),
    "distillstudio",
    "distill-studio",
    "qa小灶",
    "qaxiaozao"
  ];
  const versionMatches = versionMarkers.some((marker) => normalized.includes(marker.toLowerCase()));
  const productMatches = productMarkers.some((marker) => normalized.includes(marker));
  return versionMatches || productMatches;
}

async function main() {
  const packageJson = await readJson(path.join(cwd, "package.json"));
  const tauriConf = await readJson(path.join(cwd, "src-tauri", "tauri.conf.json"));
  const version = packageJson.version ?? tauriConf.version ?? "unknown";
  const productName = tauriConf.productName ?? "DistillStudio";
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
    throw new Error(`No bundle directory found. Checked: ${bundleCandidates.join(", ")}`);
  }

  const files = (await walkFiles(bundleDir)).filter((filePath) => isReleaseAsset(filePath));
  const selected = files.filter((filePath) => isCurrentArtifact(filePath, version, productName));
  if (!selected.length) {
    throw new Error(`No current release artifacts found in ${bundleDir}`);
  }

  const outputDir = path.join(cwd, "dist", "release-artifacts", stageName);
  await rm(outputDir, { recursive: true, force: true });
  await mkdir(outputDir, { recursive: true });

  const copied = [];
  for (const filePath of selected) {
    const fileStat = await stat(filePath);
    if (!fileStat.isFile()) {
      continue;
    }
    const targetPath = path.join(outputDir, path.basename(filePath));
    await cp(filePath, targetPath, { force: true });
    copied.push(targetPath);
  }

  if (!copied.length) {
    throw new Error(`No release artifacts copied into ${outputDir}`);
  }

  process.stdout.write(`Staged ${copied.length} artifacts into ${outputDir}\n`);
  for (const filePath of copied) {
    process.stdout.write(`- ${path.relative(cwd, filePath)}\n`);
  }
}

await main();
