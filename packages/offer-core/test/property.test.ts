import fc from "fast-check";
import { describe, expect, it } from "vitest";
import type { Filler, Offer } from "@dw/contracts";
import { bruteForce, buildLadder, lookup, savingPaise, validateSelection } from "../src";

// FC_SEED lets CI / the acceptance run pin two different seeds.
const seed = process.env["FC_SEED"] ? Number(process.env["FC_SEED"]) : undefined;
const params = (numRuns: number) => ({ numRuns, ...(seed !== undefined ? { seed } : {}) });

const T0 = 1_000_000;
const METHODS = ["UPI", "HDFC_CC", "ICICI_CC"];

// Small ranges on purpose: ties in score, gap, saving and funding are the interesting cases.
const offerArb = (i: number): fc.Arbitrary<Offer> =>
  fc
    .record({
      kind: fc.constantFrom("pct", "flat", "cashback_pct" as const),
      pctValue: fc.integer({ min: 1, max: 100 }),
      flatValue: fc.integer({ min: 0, max: 60 }).map((n) => n * 1000),
      cap: fc.option(fc.integer({ min: 0, max: 40 }).map((n) => n * 500), { nil: null }),
      min: fc.integer({ min: 0, max: 20 }).map((n) => n * 1000),
      method: fc.option(fc.constantFrom(...METHODS), { nil: null }),
      start: fc.integer({ min: -3, max: 3 }),
      end: fc.integer({ min: -3, max: 6 }),
      fundedBy: fc.constantFrom("merchant", "bank" as const),
      active: fc.boolean(),
    })
    .map((r) => ({
      id: `m_O${i}`,
      merchantId: "m",
      code: `O${i}`,
      kind: r.kind,
      value: r.kind === "flat" ? r.flatValue : r.pctValue,
      maxPaise: r.kind === "flat" ? null : r.cap,
      minOrderPaise: r.min,
      method: r.method,
      startsAt: T0 + r.start * 1000,
      endsAt: T0 + r.end * 1000,
      fundedBy: r.fundedBy,
      razorpayOfferId: null,
      active: r.active,
      updatedAt: T0,
    }));

const offersArb = fc.integer({ min: 0, max: 12 }).chain((n) =>
  fc.tuple(...Array.from({ length: n }, (_, i) => offerArb(i))).map((a) => a as Offer[]),
);
const fillersArb = fc.array(
  fc.record({
    sku: fc.constantFrom("a", "b", "c", "d", "e"),
    name: fc.constant("n"),
    pricePaise: fc.integer({ min: 1, max: 30 }).map((n) => n * 1000),
  }),
  { maxLength: 6 },
) as fc.Arbitrary<Filler[]>;
const inputArb = fc.record({
  // Mix of arbitrary carts and carts sitting on / next to an offer minimum (boundary cases).
  cartPaise: fc.oneof(
    fc.integer({ min: 0, max: 25_000 }),
    fc.tuple(fc.integer({ min: 0, max: 25 }), fc.integer({ min: -1, max: 1 })).map(([n, d]) => n * 1000 + d),
  ),
  method: fc.option(fc.constantFrom(...METHODS), { nil: null }),
  // nowMs >= build time (contract: ladder drops offers ended before builtAt).
  dt: fc.integer({ min: 0, max: 8000 }),
});
const buildOffset = fc.integer({ min: -3000, max: 3000 });

const scenario = fc.tuple(offersArb, fillersArb, buildOffset, inputArb);

describe("properties", () => {
  it("lookup == bruteForce (10,000 runs)", () => {
    fc.assert(
      fc.property(scenario, ([offers, fillers, bo, inp]) => {
        const buildNow = T0 + bo;
        const input = { cartPaise: Math.max(0, inp.cartPaise), method: inp.method, nowMs: buildNow + inp.dt };
        const ladder = buildLadder({ merchantId: "m", offers, fillers, nowMs: buildNow });
        expect(lookup(ladder, input)).toEqual(bruteForce(offers, fillers, input));
      }),
      params(10_000),
    );
  });

  it("applicable passes validateSelection with the same saving", () => {
    fc.assert(
      fc.property(scenario, ([offers, fillers, bo, inp]) => {
        const buildNow = T0 + bo;
        const input = { cartPaise: Math.max(0, inp.cartPaise), method: inp.method, nowMs: buildNow + inp.dt };
        const ladder = buildLadder({ merchantId: "m", offers, fillers, nowMs: buildNow });
        for (const a of lookup(ladder, input).applicable) {
          const v = validateSelection(offers, { ...input, offerId: a.offerId });
          expect(v.valid).toBe(true);
          expect(v.savingPaise).toBe(a.savingPaise);
        }
      }),
      params(3_000),
    );
  });

  it("savings never exceed cart or cap; charge sane", () => {
    fc.assert(
      fc.property(scenario, ([offers, , , inp]) => {
        const cart = Math.max(0, inp.cartPaise);
        for (const o of offers) {
          const s = savingPaise(o, cart);
          expect(Number.isInteger(s)).toBe(true);
          expect(s).toBeGreaterThanOrEqual(0);
          expect(s).toBeLessThanOrEqual(cart);
          if (o.maxPaise !== null) expect(s).toBeLessThanOrEqual(o.maxPaise);
          const v = validateSelection(offers, { cartPaise: cart, method: o.method, offerId: o.id, nowMs: T0 });
          expect(v.chargePaise).toBeGreaterThanOrEqual(0);
          expect(v.chargePaise).toBeLessThanOrEqual(cart);
          if (!v.valid) expect(v.savingPaise).toBe(0);
        }
      }),
      params(3_000),
    );
  });

  it("buildLadder deterministic and order-independent", () => {
    fc.assert(
      fc.property(offersArb, fillersArb, (offers, fillers) => {
        const a = buildLadder({ merchantId: "m", offers, fillers, nowMs: T0 });
        const b = buildLadder({ merchantId: "m", offers: [...offers].reverse(), fillers: [...fillers].reverse(), nowMs: T0 });
        expect(a.version).toBe(b.version);
        expect(a.offers).toEqual(b.offers);
        expect(buildLadder({ merchantId: "m", offers, fillers, nowMs: T0 })).toEqual(a);
      }),
      params(2_000),
    );
  });

  it("ladder sorted: offers by min then id, mins parallel, fillers by price then sku", () => {
    fc.assert(
      fc.property(offersArb, fillersArb, (offers, fillers) => {
        const l = buildLadder({ merchantId: "m", offers, fillers, nowMs: T0 });
        expect(l.mins).toEqual(l.offers.map((o) => o.minOrderPaise));
        for (let i = 1; i < l.offers.length; i++) {
          const p = l.offers[i - 1]!, c = l.offers[i]!;
          expect(p.minOrderPaise < c.minOrderPaise || (p.minOrderPaise === c.minOrderPaise && p.id < c.id)).toBe(true);
        }
        for (let i = 1; i < l.fillers.length; i++) {
          const p = l.fillers[i - 1]!, c = l.fillers[i]!;
          expect(p.pricePaise < c.pricePaise || (p.pricePaise === c.pricePaise && p.sku <= c.sku)).toBe(true);
        }
      }),
      params(2_000),
    );
  });
});
