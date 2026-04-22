import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const cwd = process.cwd();
const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const version = args.find((value) => value !== "--dry-run");

if (!version) {
  console.error("Usage: npm run release:bump -- <version>");
  console.error("Example: npm run release:bump -- 0.1.4");
  process.exit(1);
}

if (!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(version)) {
  console.error(`Invalid version: ${version}`);
  process.exit(1);
}

async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, "utf8"));
}

async function writeJson(filePath, value) {
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function main() {
  const packageJsonPath = path.join(cwd, "package.json");
  const cargoTomlPath = path.join(cwd, "Cargo.toml");
  const tauriConfPath = path.join(cwd, "src-tauri", "tauri.conf.json");
  const releaseDocPath = path.join(cwd, "docs", "Windows安装包发布流程.md");

  const packageJson = await readJson(packageJsonPath);
  const tauriConf = await readJson(tauriConfPath);
  const cargoToml = await readFile(cargoTomlPath, "utf8");
  const releaseDoc = await readFile(releaseDocPath, "utf8");

  const packageBefore = packageJson.version;
  const tauriBefore = tauriConf.version;
  const cargoBefore = cargoToml.match(/^version = "([^"]+)"$/m)?.[1] ?? "unknown";

  packageJson.version = version;
  tauriConf.version = version;

  const nextCargoToml = cargoToml.replace(
    /^version = "([^"]+)"$/m,
    `version = "${version}"`
  );
  const nextReleaseDoc = releaseDoc
    .replace(/git tag app-v[0-9A-Za-z.+-]+/g, `git tag app-v${version}`)
    .replace(/git push origin app-v[0-9A-Za-z.+-]+/g, `git push origin app-v${version}`);

  const summary = [
    `package.json: ${packageBefore} -> ${version}`,
    `src-tauri/tauri.conf.json: ${tauriBefore} -> ${version}`,
    `Cargo.toml: ${cargoBefore} -> ${version}`,
    "docs/Windows安装包发布流程.md: updated tag examples"
  ];

  if (dryRun) {
    console.log("Dry run only. Planned changes:");
    for (const line of summary) {
      console.log(`- ${line}`);
    }
    return;
  }

  await writeJson(packageJsonPath, packageJson);
  await writeJson(tauriConfPath, tauriConf);
  await writeFile(cargoTomlPath, nextCargoToml, "utf8");
  await writeFile(releaseDocPath, nextReleaseDoc, "utf8");

  console.log(`Bumped version to ${version}`);
  for (const line of summary) {
    console.log(`- ${line}`);
  }
  console.log("Next:");
  console.log("- npm run build");
  console.log("- cargo check --manifest-path src-tauri/Cargo.toml");
  console.log("- npm run release:preflight");
  console.log("- npm run release:summary");
}

await main();
