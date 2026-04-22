import { access, readFile } from "node:fs/promises";
import { constants } from "node:fs";
import { spawn } from "node:child_process";
import path from "node:path";

const cwd = process.cwd();
const envFilePath = path.join(cwd, ".env.local");
const tauriArgs = process.argv.slice(2);

if (tauriArgs.length === 0) {
  console.error("Usage: node scripts/run-tauri-with-env.mjs <tauri-args...>");
  process.exit(1);
}

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

    const value = normalized.slice(separatorIndex + 1);
    parsed[key] = stripWrappingQuotes(value);
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

async function main() {
  const localEnv = await loadLocalEnv();
  const command = process.platform === "win32" ? "npx.cmd" : "npx";
  const child = spawn(command, ["tauri", ...tauriArgs], {
    cwd,
    stdio: "inherit",
    env: {
      ...process.env,
      ...localEnv
    }
  });

  child.on("exit", (code, signal) => {
    if (signal) {
      process.kill(process.pid, signal);
      return;
    }
    process.exit(code ?? 1);
  });

  child.on("error", (error) => {
    console.error(`Failed to launch Tauri CLI: ${String(error)}`);
    process.exit(1);
  });
}

await main();
