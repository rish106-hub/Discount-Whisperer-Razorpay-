/** m1 must equal the golden merchant exactly: both the committed out/m1.json and a fresh generator run. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import golden from "@dw/contracts/golden.json" with { type: "json" };
import { buildAll, buildM1 } from "./generate";

const here = dirname(fileURLToPath(import.meta.url));
const golden_m1 = golden.sets.m1;

test("committed out/m1.json equals golden sets.m1", () => {
  const onDisk = JSON.parse(readFileSync(join(here, "out", "m1.json"), "utf8"));
  assert.deepStrictEqual(onDisk, golden_m1);
});

test("generator m1 equals golden sets.m1", () => {
  assert.deepStrictEqual(buildM1(), golden_m1);
});

test("generator emits 50 merchants with m50 at 250 offers and offer ids merchantId_code", () => {
  const sets = buildAll();
  assert.equal(sets.length, 50);
  assert.equal(sets[49]?.offers.length, 250);
  for (const s of sets) {
    for (const o of s.offers) assert.equal(o.id, `${s.merchantId}_${o.code}`);
  }
});
