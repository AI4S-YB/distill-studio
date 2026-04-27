import { access, readFile } from "node:fs/promises";
import { constants } from "node:fs";
import { spawn } from "node:child_process";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";

const cwd = process.cwd();
const envFilePath = path.join(cwd, ".env.local");
const updaterConfigPath = path.join(cwd, "config", "local", "updater.json");
const signingKeyPath = path.join(os.homedir(), ".tauri", "distill-studio.key");
const updaterPubkeyPath = path.join(os.homedir(), ".tauri", "distill-studio.key.pub");
const require = createRequire(import.meta.url);

async function fileExists(filePath) {
  try {
    await access(filePath, constants.F_OK);
    return true;
  } catch {
    return false;
  }
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

async function loadLocalEnv() {
  if (!(await fileExists(envFilePath))) {
    return {};
  }

  const content = await readFile(envFilePath, "utf8");
  return parseEnvFile(content);
}

async function readJsonIfExists(filePath) {
  if (!(await fileExists(filePath))) {
    return null;
  }
  return JSON.parse(await readFile(filePath, "utf8"));
}

async function readTextIfExists(filePath) {
  if (!(await fileExists(filePath))) {
    return null;
  }
  return (await readFile(filePath, "utf8")).trim();
}

function decodeIfBase64(value) {
  try {
    return Buffer.from(value, "base64").toString("utf8");
  } catch {
    return value;
  }
}

function spawnCommand(command, args, env) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      stdio: "inherit",
      env
    });

    child.on("exit", (code, signal) => {
      if (signal) {
        reject(new Error(`Command terminated by signal ${signal}`));
        return;
      }
      if (code !== 0) {
        reject(new Error(`Command failed with exit code ${code ?? 1}`));
        return;
      }
      resolve();
    });

    child.on("error", (error) => {
      reject(error);
    });
  });
}

async function main() {
  const localEnv = await loadLocalEnv();
  const updaterConfig = await readJsonIfExists(updaterConfigPath);
  const signingKey = process.env.TAURI_SIGNING_PRIVATE_KEY?.trim() || (await readTextIfExists(signingKeyPath)) || "";
  const updaterPubkey =
    process.env.TAURI_UPDATER_PUBLIC_KEY?.trim() ||
    updaterConfig?.pubkey?.trim() ||
    (await readTextIfExists(updaterPubkeyPath)) ||
    "";
  const updaterEndpoint =
    process.env.TAURI_UPDATER_ENDPOINT?.trim() ||
    updaterConfig?.endpoints?.find((value) => typeof value === "string" && value.trim()) ||
    "https://github.com/AI4S-YB/distill-studio/releases/latest/download/latest.json";
  const signingPassword =
    process.env.TAURI_SIGNING_PRIVATE_KEY_PASSWORD?.trim() ||
    localEnv.TAURI_SIGNING_PRIVATE_KEY_PASSWORD?.trim() ||
    "";
  const decodedSigningKey = decodeIfBase64(signingKey);

  if (!signingKey) {
    console.error("Missing signing private key for release build.");
    console.error("Checked in order:");
    console.error("- TAURI_SIGNING_PRIVATE_KEY");
    console.error(`- ${signingKeyPath}`);
    process.exit(1);
  }

  if (!updaterPubkey) {
    console.error("Missing updater public key for release build.");
    console.error("Checked in order:");
    console.error("- TAURI_UPDATER_PUBLIC_KEY");
    console.error(`- ${updaterConfigPath}`);
    console.error(`- ${updaterPubkeyPath}`);
    process.exit(1);
  }

  if (!signingPassword && decodedSigningKey.includes("encrypted secret key")) {
    console.warn("The signing key uses the encrypted secret key format, but no password was provided.");
    console.warn("Continuing with Tauri's empty-password behavior.");
  }

  const env = {
    ...process.env,
    ...localEnv,
    TAURI_SIGNING_PRIVATE_KEY: signingKey,
    TAURI_UPDATER_PUBLIC_KEY: updaterPubkey,
    TAURI_UPDATER_ENDPOINT: updaterEndpoint
  };

  if (signingPassword) {
    env.TAURI_SIGNING_PRIVATE_KEY_PASSWORD = signingPassword;
  }

  const nodeCommand = process.execPath;
  const writeConfigScript = path.join(cwd, "scripts", "write-tauri-release-config.mjs");
  const tauriCliScript = require.resolve("@tauri-apps/cli/tauri.js");

  await spawnCommand(nodeCommand, [writeConfigScript], env);
  await spawnCommand(nodeCommand, [tauriCliScript, "build", "--config", "src-tauri/tauri.release.conf.json"], env);

  // Post-build: ad-hoc deep-codesign the macOS .app bundle to reduce Gatekeeper warnings
  if (os.platform() === "darwin") {
    const bundlePath = path.join(cwd, "target", "release", "bundle", "macos", "DistillStudio.app");
    try {
      await spawnCommand("codesign", ["--deep", "--force", "-s", "-", bundlePath], {});
      console.log("Post-build codesign completed for macOS bundle.");
    } catch {
      console.warn("Post-build codesign skipped (bundle not found or codesign unavailable).");
    }
  }
}

await main();
