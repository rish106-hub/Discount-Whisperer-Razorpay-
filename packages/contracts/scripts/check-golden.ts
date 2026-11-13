/** Structural check of golden.json: every set and case parses with the contract schemas. */
import { readFileSync } from "node:fs";
import type { GoldenFile } from "../src/index";
import {
  LookupInputSchema,
  LookupResultSchema,
  OfferSchema,
  FillerSchema,
  ValidateInputSchema,
  ValidateResultSchema,
} from "../src/schemas/index";

const golden = JSON.parse(readFileSync(new URL("../fixtures/golden.json", import.meta.url), "utf8")) as GoldenFile;
let failures = 0;
const fail = (msg: string) => {
  failures++;
  console.error("FAIL", msg);
};

for (const [name, set] of Object.entries(golden.sets)) {
  for (const o of set.offers) if (!OfferSchema.safeParse(o).success) fail(`set ${name} offer ${o.id}`);
  for (const f of set.fillers) if (!FillerSchema.safeParse(f).success) fail(`set ${name} filler ${f.sku}`);
  for (const o of set.offers) if (o.merchantId !== set.merchantId) fail(`set ${name} offer ${o.id} merchant`);
}
for (const c of golden.cases) {
  if (!golden.sets[c.set]) fail(`${c.name}: unknown set ${c.set}`);
  const ok =
    c.kind === "lookup"
      ? LookupInputSchema.safeParse(c.input).success && LookupResultSchema.safeParse(c.expected).success
      : ValidateInputSchema.safeParse(c.input).success && ValidateResultSchema.safeParse(c.expected).success;
  if (!ok) fail(`case "${c.name}" does not match its schema`);
}
const lookups = golden.cases.filter((c) => c.kind === "lookup").length;
const validates = golden.cases.length - lookups;
if (lookups < 12) fail(`need >= 12 lookup cases, have ${lookups}`);
if (validates < 2) fail(`need >= 2 validate cases, have ${validates}`);

// Spec anchor: m1, Rs 1,800, no method.
const anchor = golden.cases.find(
  (c) => c.kind === "lookup" && c.set === "m1" && c.input.cartPaise === 180000 && c.input.method === null,
);
if (!anchor || anchor.kind !== "lookup") fail("missing m1 180000 null anchor case");
else {
  const e = anchor.expected;
  const top = e.unlockable[0];
  if (e.applicable.length !== 0) fail("anchor: applicable should be empty");
  if (e.conditional[0]?.offerId !== "m1_O3" || e.conditional[0]?.savingPaise !== 9000) fail("anchor: conditional");
  if (top?.offerId !== "m1_O1" || top?.gapPaise !== 19900) fail("anchor: top unlockable");
  if (e.filler?.sku !== "gamcha" || e.filler?.pricePaise !== 19900) fail("anchor: filler");
}

console.log(`golden.json: ${Object.keys(golden.sets).length} sets, ${lookups} lookup + ${validates} validate cases`);
if (failures > 0) {
  console.error(`${failures} failure(s)`);
  process.exit(1);
}
console.log("OK");
