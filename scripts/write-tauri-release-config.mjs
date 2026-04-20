import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const publicKey = process.env.TAURI_UPDATER_PUBLIC_KEY?.trim();
const endpoint =
  process.env.TAURI_UPDATER_ENDPOINT?.trim() ||
  "https://github.com/AI4S-YB/distill-studio/releases/latest/download/latest.json";
const outputPath = path.resolve("src-tauri/tauri.release.conf.json");

if (!publicKey) {
  console.error("Missing TAURI_UPDATER_PUBLIC_KEY.");
  process.exit(1);
}

const config = {
  bundle: {
    createUpdaterArtifacts: true
  },
  plugins: {
    updater: {
      pubkey: publicKey,
      endpoints: [endpoint]
    }
  }
};

await mkdir(path.dirname(outputPath), { recursive: true });
await writeFile(outputPath, `${JSON.stringify(config, null, 2)}\n`, "utf8");
console.log(`Wrote ${outputPath}`);
