import type {
  ApplicableOffer,
  ConditionalOffer,
  Filler,
  Ladder,
  LadderOffer,
  LookupInput,
  LookupResult,
  UnlockableOffer,
} from "@dw/contracts";
import { savingPaise } from "./money";

/** Number of entries in sorted `mins` that are <= cart (upper bound). */
function countAtOrBelow(mins: readonly number[], cart: number): number {
  let lo = 0;
  let hi = mins.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if ((mins[mid] as number) <= cart) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

const isLive = (o: LadderOffer, now: number): boolean => o.startsAt <= now && now < o.endsAt;

interface Cand {
  o: LadderOffer;
  gap: number;
  saving: number;
  score: number;
}

/** True if a ranks before b. */
function better(a: Cand, b: Cand): boolean {
  if (a.score !== b.score) return a.score > b.score;
  if (a.gap !== b.gap) return a.gap < b.gap;
  const af = a.o.fundedBy === "merchant";
  const bf = b.o.fundedBy === "merchant";
  if (af !== bf) return af;
  return a.o.id < b.o.id;
}

/** Hot path: runs in the browser on every cart change. Binary search splits reached / ahead offers. */
export function lookup(ladder: Ladder, input: LookupInput): LookupResult {
  const { cartPaise, method, nowMs } = input;
  const split = countAtOrBelow(ladder.mins, cartPaise);
  const offers = ladder.offers;

  let step = 0;
  const applicable: ApplicableOffer[] = [];
  const conditional: ConditionalOffer[] = [];
  for (let i = 0; i < split; i++) {
    const o = offers[i] as LadderOffer;
    if (!isLive(o, nowMs)) continue;
    step++;
    if (o.method === null || o.method === method) {
      applicable.push({ offerId: o.id, savingPaise: savingPaise(o, cartPaise) });
    } else if (method === null) {
      conditional.push({ offerId: o.id, method: o.method, savingPaise: savingPaise(o, cartPaise) });
    }
  }
  const bySaving = (a: { savingPaise: number; offerId: string }, b: typeof a) =>
    b.savingPaise - a.savingPaise || (a.offerId < b.offerId ? -1 : a.offerId > b.offerId ? 1 : 0);
  applicable.sort(bySaving);
  conditional.sort(bySaving);

  // Keep a running top 3 (insertion into a tiny sorted array).
  const top: Cand[] = [];
  for (let i = split; i < offers.length; i++) {
    const o = offers[i] as LadderOffer;
    if (!isLive(o, nowMs)) continue;
    if (o.method !== null && method !== null && o.method !== method) continue;
    const gap = o.minOrderPaise - cartPaise;
    const saving = savingPaise(o, o.minOrderPaise);
    const c: Cand = { o, gap, saving, score: saving / gap };
    let pos = top.length;
    while (pos > 0 && better(c, top[pos - 1] as Cand)) pos--;
    if (pos < 3) {
      top.splice(pos, 0, c);
      if (top.length > 3) top.pop();
    }
  }
  const unlockable: UnlockableOffer[] = top.map((c) => ({
    offerId: c.o.id,
    gapPaise: c.gap,
    savingPaise: c.saving,
    score: c.score,
    method: c.o.method,
  }));

  let filler: Filler | null = null;
  const first = unlockable[0];
  if (first) {
    // fillers sorted by price asc then sku asc: first fit is the cheapest, ties by sku.
    for (const f of ladder.fillers) {
      if (f.pricePaise >= first.gapPaise) {
        filler = f;
        break;
      }
    }
  }
  return { step, applicable, conditional, unlockable, filler };
}
