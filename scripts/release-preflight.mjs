import { access, readFile } from "node:fs/promises";
import { constants } from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const cwd = process.cwd();

async function fileExists(filePath) {
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

function stripWrappingQuotes(value) {
  const trimmed = value.trim();
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

function parseEnvFile(content) {
  const parsed = {};

  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) {
      continue;
    }

    const normalized = line.startsWith("export ") ? line.slice(7).trim() : line;
    const separatorIndex = normalized.indexOf("=");
    if (separatorIndex <= 0) {
      continue;
    }

    const key = normalized.slice(0, separatorIndex).trim();
    if (!key) {
      continue;
    }

    parsed[key] = stripWrappingQuotes(normalized.slice(separatorIndex + 1));
  }

  return parsed;
}

function printCheck(ok, label, detail = "") {
  const marker = ok ? "OK" : "FAIL";
  const suffix = detail ? ` - ${detail}` : "";
  console.log(`[${marker}] ${label}${suffix}`);
}

async function main() {
  const packageJsonPath = path.join(cwd, "package.json");
  const cargoTomlPath = path.join(cwd, "Cargo.toml");
  const tauriConfPath = path.join(cwd, "src-tauri", "tauri.conf.json");
  const workflowPath = path.join(cwd, ".github", "workflows", "release.yml");
  const updaterConfigPath = path.join(cwd, "config", "local", "updater.json");
  const envFilePath = path.join(cwd, ".env.local");
  const privateKeyPath = path.join(os.homedir(), ".tauri", "distill-studio.key");
  const publicKeyPath = path.join(os.homedir(), ".tauri", "distill-studio.key.pub");

  const packageJson = await readJson(packageJsonPath);
  const tauriConf = await readJson(tauriConfPath);
  const cargoToml = await readFile(cargoTomlPath, "utf8");
  const cargoVersionMatch = cargoToml.match(/^\s*version = "([^"]+)"/m);
  const cargoVersion = cargoVersionMatch?.[1] ?? null;
  const packageVersion = packageJson.version ?? null;
  const tauriVersion = tauriConf.version ?? null;
  const unifiedVersion =
    cargoVersion && cargoVersion === packageVersion && cargoVersion === tauriVersion;

  const workflowExists = await fileExists(workflowPath);
  const updaterConfigExists = await fileExists(updaterConfigPath);
  const privateKeyExists = await fileExists(privateKeyPath);
  const publicKeyExists = await fileExists(publicKeyPath);
  const privateKeyText = privateKeyExists ? await readFile(privateKeyPath, "utf8") : "";
  const decodedPrivateKey = privateKeyText
    ? Buffer.from(privateKeyText.trim(), "base64").toString("utf8")
    : "";
  const privateKeyNeedsPassword = decodedPrivateKey.includes("encrypted secret key");
  const localEnv = (await fileExists(envFilePath))
    ? parseEnvFile(await readFile(envFilePath, "utf8"))
    : {};
  const hasPrivateKeyPassword =
    (typeof process.env.TAURI_SIGNING_PRIVATE_KEY_PASSWORD === "string" &&
      process.env.TAURI_SIGNING_PRIVATE_KEY_PASSWORD.trim().length > 0) ||
    (typeof localEnv.TAURI_SIGNING_PRIVATE_KEY_PASSWORD === "string" &&
      localEnv.TAURI_SIGNING_PRIVATE_KEY_PASSWORD.trim().length > 0);

  let updaterConfig = null;
  if (updaterConfigExists) {
    updaterConfig = await readJson(updaterConfigPath);
  }

  let gitStatus = "";
  try {
    const { stdout } = await execFileAsync("git", ["status", "--short"], { cwd });
    gitStatus = stdout.trim();
  } catch (error) {
    gitStatus = `git status failed: ${String(error)}`;
  }

  let remoteUrl = "";
  try {
    const { stdout } = await execFileAsync("git", ["remote", "get-url", "origin"], { cwd });
    remoteUrl = stdout.trim();
  } catch {
    remoteUrl = "";
  }

  console.log("Release preflight for distill-studio");
  console.log("");

  printCheck(
    unifiedVersion,
    "Version is consistent",
    unifiedVersion ? `v${cargoVersion}` : `cargo=${cargoVersion}, package=${packageVersion}, tauri=${tauriVersion}`
  );
  printCheck(workflowExists, "GitHub release workflow exists", workflowPath);
  printCheck(privateKeyExists, "Updater private key exists", privateKeyPath);
  printCheck(publicKeyExists, "Updater public key exists", publicKeyPath);
  printCheck(
    true,
    "Updater private key password handling is ready",
    privateKeyNeedsPassword
      ? hasPrivateKeyPassword
        ? "provided via TAURI_SIGNING_PRIVATE_KEY_PASSWORD or .env.local"
        : "encrypted key detected; no password provided, so release build will rely on Tauri's empty-password behavior"
      : "key does not require a password"
  );
  printCheck(updaterConfigExists, "Local updater override config exists", updaterConfigPath);

  if (updaterConfig) {
    const hasPubkey = typeof updaterConfig.pubkey === "string" && updaterConfig.pubkey.trim().length > 0;
    const hasEndpoints =
      Array.isArray(updaterConfig.endpoints) && updaterConfig.endpoints.length > 0;
    printCheck(hasPubkey, "Local updater config has pubkey");
    printCheck(
      hasEndpoints,
      "Local updater config has endpoints",
      hasEndpoints ? updaterConfig.endpoints.join(", ") : ""
    );
  }

  printCheck(Boolean(remoteUrl), "Git remote origin is configured", remoteUrl || "missing");
  printCheck(gitStatus.length === 0, "Git worktree is clean", gitStatus || "clean");

  console.log("");
  console.log("Suggested next commands:");
  if (unifiedVersion) {
    console.log(`- git tag app-v${cargoVersion}`);
    console.log(`- git push origin app-v${cargoVersion}`);
  }
  console.log("- Configure GitHub secrets: TAURI_SIGNING_PRIVATE_KEY, TAURI_UPDATER_PUBLIC_KEY");
  console.log("- If your private key uses a non-empty password, also configure TAURI_SIGNING_PRIVATE_KEY_PASSWORD");
}

await main();
