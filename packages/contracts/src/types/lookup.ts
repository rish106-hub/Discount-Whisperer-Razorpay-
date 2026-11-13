import type { Filler } from "./filler";
import type { PaymentMethod } from "./offer";

export interface LookupInput {
  cartPaise: number;
  /** null = shopper has not chosen a method yet. */
  method: PaymentMethod | null;
  nowMs: number;
}

export interface ApplicableOffer {
  offerId: string;
  savingPaise: number;
}

/** Would apply now if the shopper paid with `method`. */
export interface ConditionalOffer {
  offerId: string;
  method: PaymentMethod;
  savingPaise: number;
}

export interface UnlockableOffer {
  offerId: string;
  gapPaise: number;
  /** Saving at exactly minOrderPaise. */
  savingPaise: number;
  /** savingPaise / gapPaise. Float; compare with a tolerance. */
  score: number;
  /** Method the offer needs (null = any). Added for the widget's "if you pay with X" label. */
  method: PaymentMethod | null;
}

/**
 * Semantics (offer-core implements, golden.json pins):
 * - live offer: startsAt <= nowMs < endsAt (ladder already excludes inactive offers).
 * - step: number of live offers with minOrderPaise <= cartPaise.
 * - applicable / conditional: sorted by savingPaise desc, then offerId asc.
 * - unlockable: live, minOrderPaise > cartPaise, method-compatible; sorted by score desc,
 *   gapPaise asc, merchant-funded first, offerId asc; at most 3.
 * - filler: cheapest filler with pricePaise >= unlockable[0].gapPaise (ties: sku asc); null if none
 *   or if unlockable is empty.
 */
export interface LookupResult {
  step: number;
  applicable: ApplicableOffer[];
  conditional: ConditionalOffer[];
  unlockable: UnlockableOffer[];
  filler: Filler | null;
}
