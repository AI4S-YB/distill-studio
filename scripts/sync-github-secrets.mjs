import { access, readFile } from "node:fs/promises";
import { constants } from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const cwd = process.cwd();

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

async function ensureFile(filePath) {
  try {
    await access(filePath, constants.R_OK);
  } catch {
    throw new Error(`Missing readable file: ${filePath}`);
  }
}

function parseRepoSlug(remoteUrl) {
  const sshMatch = remoteUrl.match(/^git@github\.com:(.+?)(?:\.git)?$/);
  if (sshMatch) {
    return sshMatch[1];
  }

  const httpsMatch = remoteUrl.match(/^https:\/\/github\.com\/(.+?)(?:\.git)?$/);
  if (httpsMatch) {
    return httpsMatch[1];
  }

  throw new Error(`Unsupported GitHub remote URL: ${remoteUrl}`);
}

async function ghSecretSet(repo, name, body) {
  await execFileAsync("gh", ["secret", "set", name, "--repo", repo, "--body", body], {
    cwd
  });
}

async function readTextIfExists(filePath) {
  try {
    return await readFile(filePath, "utf8");
  } catch {
    return null;
  }
}

function decodeIfBase64(value) {
  try {
    return Buffer.from(value, "base64").toString("utf8");
  } catch {
    return value;
  }
}

async function main() {
  const privateKeyPath = path.join(os.homedir(), ".tauri", "distill-studio.key");
  const publicKeyPath = path.join(os.homedir(), ".tauri", "distill-studio.key.pub");
  const envFilePath = path.join(cwd, ".env.local");

  await ensureFile(privateKeyPath);
  await ensureFile(publicKeyPath);

  const [{ stdout: remoteUrl }, privateKey, publicKey, envFileText] = await Promise.all([
    execFileAsync("git", ["remote", "get-url", "origin"], { cwd }),
    readFile(privateKeyPath, "utf8"),
    readFile(publicKeyPath, "utf8"),
    readTextIfExists(envFilePath)
  ]);

  const repo = parseRepoSlug(remoteUrl.trim());
  const localEnv = envFileText ? parseEnvFile(envFileText) : {};
  const signingPassword =
    process.env.TAURI_SIGNING_PRIVATE_KEY_PASSWORD?.trim() ||
    localEnv.TAURI_SIGNING_PRIVATE_KEY_PASSWORD?.trim() ||
    "";
  const decodedPrivateKey = decodeIfBase64(privateKey.trim());
  const encryptedKey = decodedPrivateKey.includes("encrypted secret key");

  await ghSecretSet(repo, "TAURI_SIGNING_PRIVATE_KEY", privateKey);
  await ghSecretSet(repo, "TAURI_UPDATER_PUBLIC_KEY", publicKey.trim());
  if (signingPassword) {
    await ghSecretSet(repo, "TAURI_SIGNING_PRIVATE_KEY_PASSWORD", signingPassword);
  }

  console.log(`Synced secrets to ${repo}`);
  console.log("- TAURI_SIGNING_PRIVATE_KEY");
  console.log("- TAURI_UPDATER_PUBLIC_KEY");
  if (signingPassword) {
    console.log("- TAURI_SIGNING_PRIVATE_KEY_PASSWORD");
  } else if (encryptedKey) {
    console.log("TAURI_SIGNING_PRIVATE_KEY_PASSWORD was not set; this key works with Tauri's empty-password behavior.");
  } else {
    console.log("TAURI_SIGNING_PRIVATE_KEY_PASSWORD was not set because the current private key has no password.");
  }
}

await main();
