/**
 * TEST-ONLY STAND-IN for @dw/offer-core (owned by T1, not on this branch).
 * Exists so widget tests can run before the T1 merge. NOT shipped: src/ imports the real package.
 * It is checked against golden.json lookup cases in standin.golden.test.ts so widget tests mean something.
 * Once T1 merges, vitest.config.ts stops aliasing to this file automatically.
 */
import type { Ladder, LadderOffer, LookupInput, LookupResult, UnlockableOffer } from "@dw/contracts";

export function savingPaise(o: LadderOffer, cart: number): number {
  const raw = o.kind === "flat" ? Math.min(o.value, cart) : Math.floor((cart * o.value) / 100);
  return o.maxPaise != null ? Math.min(raw, o.maxPaise) : raw;
}

export function lookup(ladder: Ladder, input: LookupInput): LookupResult {
  const { cartPaise: cart, method, nowMs } = input;
  const live = ladder.offers.filter((o) => o.startsAt <= nowMs && nowMs < o.endsAt);
  const reached = live.filter((o) => o.minOrderPaise <= cart);
  const bySaving = (a: { s: number; id: string }, b: { s: number; id: string }) => b.s - a.s || (a.id < b.id ? -1 : 1);
  const applicable = reached
    .filter((o) => o.method === null || o.method === method)
    .map((o) => ({ offerId: o.id, savingPaise: savingPaise(o, cart) }))
    .sort((a, b) => bySaving({ s: a.savingPaise, id: a.offerId }, { s: b.savingPaise, id: b.offerId }));
  const conditional = reached
    .filter((o) => o.method !== null && o.method !== method)
    .filter((o) => method === null)
    .map((o) => ({ offerId: o.id, method: o.method as string, savingPaise: savingPaise(o, cart) }))
    .sort((a, b) => bySaving({ s: a.savingPaise, id: a.offerId }, { s: b.savingPaise, id: b.offerId }));
  const unlockable: UnlockableOffer[] = live
    .filter((o) => o.minOrderPaise > cart && (o.method === null || method === null || o.method === method))
    .map((o) => {
      const gap = o.minOrderPaise - cart;
      const s = savingPaise(o, o.minOrderPaise);
      return { o, u: { offerId: o.id, gapPaise: gap, savingPaise: s, score: s / gap, method: o.method } };
    })
    .sort(
      (a, b) =>
        b.u.score - a.u.score ||
        a.u.gapPaise - b.u.gapPaise ||
        Number(b.o.fundedBy === "merchant") - Number(a.o.fundedBy === "merchant") ||
        (a.o.id < b.o.id ? -1 : 1),
    )
    .slice(0, 3)
    .map((x) => x.u);
  const top = unlockable[0];
  const filler = top ? (ladder.fillers.find((f) => f.pricePaise >= top.gapPaise) ?? null) : null;
  return { step: reached.length, applicable, conditional, unlockable, filler };
}
