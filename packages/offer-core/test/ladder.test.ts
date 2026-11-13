import { describe, expect, it } from "vitest";
import type { GoldenFile } from "@dw/contracts";
import golden from "@dw/contracts/golden.json";
import { buildLadder, fnv1a64Hex, savingPaise } from "../src";

const g = golden as unknown as GoldenFile;
const m1 = g.sets["m1"]!;
const NOW = 1780272000000;

describe("fnv1a64", () => {
  it("matches published test vectors", () => {
    expect(fnv1a64Hex("")).toBe("cbf29ce484222325");
    expect(fnv1a64Hex("a")).toBe("af63dc4c8601ec8c");
    expect(fnv1a64Hex("foobar")).toBe("85944171f73967e8");
  });
});

describe("buildLadder", () => {
  const base = { merchantId: "m1", offers: m1.offers, fillers: m1.fillers };
  it("version is 16 hex chars and ignores builtAt", () => {
    const a = buildLadder({ ...base, nowMs: NOW });
    const b = buildLadder({ ...base, nowMs: NOW + 1000 });
    expect(a.version).toMatch(/^[0-9a-f]{16}$/);
    expect(a.version).toBe(b.version);
    expect(a.builtAt).not.toBe(b.builtAt);
  });
  it("kill switch and content change the version", () => {
    const a = buildLadder({ ...base, nowMs: NOW });
    expect(buildLadder({ ...base, nowMs: NOW, disabled: true }).version).not.toBe(a.version);
    expect(buildLadder({ ...base, nowMs: NOW, offers: m1.offers.slice(1) }).version).not.toBe(a.version);
  });
  it("drops inactive and ended offers, strips server-only fields", () => {
    const [o1, o2, o3] = m1.offers as [typeof m1.offers[0], typeof m1.offers[0], typeof m1.offers[0]];
    const l = buildLadder({
      ...base,
      nowMs: NOW,
      offers: [{ ...o1, active: false }, { ...o2, endsAt: NOW }, { ...o3, razorpayOfferId: "offer_secret" }],
    });
    expect(l.offers.map((o) => o.id)).toEqual(["m1_O3"]);
    expect(JSON.stringify(l)).not.toContain("offer_secret");
    expect(l.offers[0]).not.toHaveProperty("active");
    expect(l.mins).toEqual([0]);
  });
});

describe("savingPaise", () => {
  const pct = { kind: "pct", value: 10, maxPaise: null } as const;
  it("floors percentages", () => expect(savingPaise(pct, 199899)).toBe(19989));
  it("caps", () => expect(savingPaise({ ...pct, maxPaise: 100 }, 199899)).toBe(100));
  it("flat never exceeds cart", () => expect(savingPaise({ kind: "flat", value: 80000, maxPaise: null }, 70000)).toBe(70000));
  it("zero cart", () => expect(savingPaise(pct, 0)).toBe(0));
});
