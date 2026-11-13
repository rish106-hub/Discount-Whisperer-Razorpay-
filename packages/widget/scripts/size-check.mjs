// Fails (exit 1) when dist/dw-offers.js gzips above the 15 KB budget.
import { readFileSync } from "node:fs";
import { gzipSync } from "node:zlib";
import { fileURLToPath } from "node:url";

const BUDGET = 15 * 1024;
const file = fileURLToPath(new URL("../dist/dw-offers.js", import.meta.url));
let raw;
try {
  raw = readFileSync(file);
} catch {
  console.error("size-check: dist/dw-offers.js missing, run `pnpm --filter @dw/widget build` first");
  process.exit(1);
}
const gz = gzipSync(raw, { level: 9 }).length;
console.log(`dw-offers.js raw ${raw.length} B, gzip ${gz} B (${(gz / 1024).toFixed(2)} KB) / budget ${BUDGET} B`);
if (gz > BUDGET) {
  console.error("size-check: OVER BUDGET");
  process.exit(1);
}
