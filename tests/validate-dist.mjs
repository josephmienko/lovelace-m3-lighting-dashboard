import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const distPath = resolve(root, "dist", "lovelace-m3-lighting-dashboard.js");
const source = await readFile(distPath, "utf8");

assert.match(source, /customElements\.define\(\s*"m3-lighting-dashboard"/);
assert.match(source, /custom:m3-lighting-dashboard/);
assert.match(source, /customElements\.get\("m3-slider"\)/);
assert.match(source, /customElements\.whenDefined\("m3-slider"\)/);
assert.match(source, /m3-slider-interaction-start/);
assert.match(source, /lovelace-m3-core-cards/);
assert.match(source, /Missing dependency: lovelace-m3-core-cards/);
assert.match(source, /window\.customCards/);
assert.doesNotMatch(source, /custom:crooked-sentry|crooked-sentry-m3-lighting-dashboard|crooked-sentry-m3-slider|Crooked Sentry M3 Lighting Dashboard/);
