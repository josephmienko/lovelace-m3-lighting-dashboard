import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const sourcePath = resolve(root, "src", "m3-lighting-dashboard.js");
const outputPath = resolve(root, "dist", "lovelace-m3-lighting-dashboard.js");

const banner = `/**
 * Built file for the M3 Lighting Dashboard HACS artifact.
 * Edit src/m3-lighting-dashboard.js and rerun npm run build.
 */

`;

const source = await readFile(sourcePath, "utf8");
await mkdir(dirname(outputPath), { recursive: true });
await writeFile(outputPath, banner + source.trimEnd() + "\n", "utf8");
