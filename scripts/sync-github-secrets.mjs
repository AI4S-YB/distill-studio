import { access, readFile } from "node:fs/promises";
import { constants } from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

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
    cwd: process.cwd()
  });
}

async function main() {
  const privateKeyPath = path.join(os.homedir(), ".tauri", "distill-studio.key");
  const publicKeyPath = path.join(os.homedir(), ".tauri", "distill-studio.key.pub");

  await ensureFile(privateKeyPath);
  await ensureFile(publicKeyPath);

  const [{ stdout: remoteUrl }, privateKey, publicKey] = await Promise.all([
    execFileAsync("git", ["remote", "get-url", "origin"], { cwd: process.cwd() }),
    readFile(privateKeyPath, "utf8"),
    readFile(publicKeyPath, "utf8")
  ]);

  const repo = parseRepoSlug(remoteUrl.trim());

  await ghSecretSet(repo, "TAURI_SIGNING_PRIVATE_KEY", privateKey);
  await ghSecretSet(repo, "TAURI_UPDATER_PUBLIC_KEY", publicKey.trim());

  console.log(`Synced secrets to ${repo}`);
  console.log("- TAURI_SIGNING_PRIVATE_KEY");
  console.log("- TAURI_UPDATER_PUBLIC_KEY");
  console.log("TAURI_SIGNING_PRIVATE_KEY_PASSWORD was not set because the current private key has no password.");
}

await main();
