import { describe, expect, it } from "vitest";
import type { GoldenFile, GoldenLookupCase, GoldenValidateCase, LookupResult } from "@dw/contracts";
import golden from "@dw/contracts/golden.json";
import { bruteForce, buildLadder, lookup, validateSelection } from "../src";

const g = golden as unknown as GoldenFile;
const lookups = g.cases.filter((c): c is GoldenLookupCase => c.kind === "lookup");
const validates = g.cases.filter((c): c is GoldenValidateCase => c.kind === "validate");

/** Scores are floats: compare with 1e-9 tolerance, everything else exactly. */
function expectSame(actual: LookupResult, expected: LookupResult): void {
  const strip = (r: LookupResult) => ({ ...r, unlockable: r.unlockable.map(({ score: _s, ...u }) => u) });
  expect(strip(actual)).toEqual(strip(expected));
  actual.unlockable.forEach((u, i) => {
    expect(Math.abs(u.score - (expected.unlockable[i]?.score ?? NaN))).toBeLessThan(1e-9);
  });
}

describe("golden file", () => {
  it("has all 32 cases", () => {
    expect(lookups.length).toBe(16);
    expect(validates.length).toBe(16);
  });

  describe.each(lookups)("lookup: $name", (c) => {
    const set = g.sets[c.set]!;
    it("ladder lookup matches", () => {
      const ladder = buildLadder({ merchantId: set.merchantId, offers: set.offers, fillers: set.fillers, nowMs: c.input.nowMs });
      expectSame(lookup(ladder, c.input), c.expected);
    });
    it("bruteForce matches", () => {
      expectSame(bruteForce(set.offers, set.fillers, c.input), c.expected);
    });
  });

  describe.each(validates)("validate: $name", (c) => {
    it("matches", () => {
      expect(validateSelection(g.sets[c.set]!.offers, c.input)).toEqual(c.expected);
    });
  });
});
