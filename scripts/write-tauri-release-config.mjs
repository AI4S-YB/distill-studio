import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import { constants } from "node:fs";
import os from "node:os";
import path from "node:path";

const cwd = process.cwd();
const outputPath = path.resolve("src-tauri/tauri.release.conf.json");
const defaultEndpoint =
  "https://github.com/AI4S-YB/distill-studio/releases/latest/download/latest.json";

async function fileExists(filePath) {
  try {
    await access(filePath, constants.F_OK);
    return true;
  } catch {
    return false;
  }
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

async function resolveUpdaterConfig() {
  const localConfigPath = path.join(cwd, "config", "local", "updater.json");
  const localConfig = await readJsonIfExists(localConfigPath);
  const fallbackPubkeyPath = path.join(os.homedir(), ".tauri", "distill-studio.key.pub");

  const pubkey =
    process.env.TAURI_UPDATER_PUBLIC_KEY?.trim() ||
    localConfig?.pubkey?.trim() ||
    (await readTextIfExists(fallbackPubkeyPath)) ||
    "";

  const endpoint =
    process.env.TAURI_UPDATER_ENDPOINT?.trim() ||
    localConfig?.endpoints?.find((value) => typeof value === "string" && value.trim()) ||
    defaultEndpoint;

  return { pubkey, endpoint, localConfigPath, fallbackPubkeyPath };
}

const { pubkey, endpoint, localConfigPath, fallbackPubkeyPath } = await resolveUpdaterConfig();

if (!pubkey) {
  console.error("Missing updater public key.");
  console.error("Checked in order:");
  console.error("- TAURI_UPDATER_PUBLIC_KEY");
  console.error(`- ${localConfigPath}`);
  console.error(`- ${fallbackPubkeyPath}`);
  process.exit(1);
}

const config = {
  bundle: {
    createUpdaterArtifacts: true
  },
  plugins: {
    updater: {
      pubkey,
      endpoints: [endpoint]
    }
  }
};

await mkdir(path.dirname(outputPath), { recursive: true });
await writeFile(outputPath, `${JSON.stringify(config, null, 2)}\n`, "utf8");
console.log(`Wrote ${outputPath}`);
