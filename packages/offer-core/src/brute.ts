import type { Filler, LookupInput, LookupResult, Offer, UnlockableOffer } from "@dw/contracts";
import { savingPaise } from "./money";

/**
 * Reference implementation: no ladder, no binary search, one pass per rule.
 * Property tests assert lookup(buildLadder(...)) deep-equals this.
 */
export function bruteForce(
  offers: readonly Offer[],
  fillers: readonly Filler[],
  input: LookupInput,
): LookupResult {
  const { cartPaise, method, nowMs } = input;
  const live = offers.filter((o) => o.active && o.startsAt <= nowMs && nowMs < o.endsAt);
  const reached = live.filter((o) => o.minOrderPaise <= cartPaise);
  const ahead = live.filter((o) => o.minOrderPaise > cartPaise);

  const applicable = reached
    .filter((o) => o.method === null || o.method === method)
    .map((o) => ({ offerId: o.id, savingPaise: savingPaise(o, cartPaise) }));
  const conditional = reached
    .filter((o) => o.method !== null && method === null)
    .map((o) => ({ offerId: o.id, method: o.method as string, savingPaise: savingPaise(o, cartPaise) }));
  const bySaving = (a: { savingPaise: number; offerId: string }, b: typeof a) =>
    b.savingPaise - a.savingPaise || (a.offerId < b.offerId ? -1 : a.offerId > b.offerId ? 1 : 0);
  applicable.sort(bySaving);
  conditional.sort(bySaving);

  const cands = ahead
    .filter((o) => o.method === null || method === null || o.method === method)
    .map((o) => {
      const gapPaise = o.minOrderPaise - cartPaise;
      const saving = savingPaise(o, o.minOrderPaise);
      return { o, u: { offerId: o.id, gapPaise, savingPaise: saving, score: saving / gapPaise, method: o.method } };
    });
  cands.sort((a, b) => {
    if (a.u.score !== b.u.score) return b.u.score - a.u.score;
    if (a.u.gapPaise !== b.u.gapPaise) return a.u.gapPaise - b.u.gapPaise;
    const af = a.o.fundedBy === "merchant" ? 0 : 1;
    const bf = b.o.fundedBy === "merchant" ? 0 : 1;
    if (af !== bf) return af - bf;
    return a.o.id < b.o.id ? -1 : a.o.id > b.o.id ? 1 : 0;
  });
  const unlockable: UnlockableOffer[] = cands.slice(0, 3).map((c) => c.u);

  let filler: Filler | null = null;
  const first = unlockable[0];
  if (first) {
    for (const f of fillers) {
      if (f.pricePaise < first.gapPaise) continue;
      if (!filler || f.pricePaise < filler.pricePaise || (f.pricePaise === filler.pricePaise && f.sku < filler.sku)) {
        filler = f;
      }
    }
  }

  return { step: reached.length, applicable, conditional, unlockable, filler };
}
