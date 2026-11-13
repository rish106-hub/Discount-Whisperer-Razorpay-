import golden from "@dw/contracts/golden.json";
import type { Ladder } from "@dw/contracts";

/** Ladder for golden merchant m1, built by hand to the contract shape (real buildLadder lives in T1). */
export function makeLadder(nowMs = 1780272000000, over: Partial<Ladder> = {}): Ladder {
  const m1 = golden.sets.m1;
  const offers = m1.offers
    .filter((o) => o.active && o.endsAt > nowMs)
    .map(({ razorpayOfferId: _r, active: _a, merchantId: _m, updatedAt: _u, ...o }) => o)
    .sort((a, b) => a.minOrderPaise - b.minOrderPaise || (a.id < b.id ? -1 : 1));
  return {
    v: 1,
    merchantId: "m1",
    version: "test",
    builtAt: nowMs,
    disabled: false,
    mins: offers.map((o) => o.minOrderPaise),
    offers: offers as Ladder["offers"],
    fillers: [...m1.fillers].sort((a, b) => a.pricePaise - b.pricePaise || (a.sku < b.sku ? -1 : 1)),
    ...over,
  };
}
