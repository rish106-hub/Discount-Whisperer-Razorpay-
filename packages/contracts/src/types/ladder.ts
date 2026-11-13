import type { Filler } from "./filler";
import type { Offer } from "./offer";

/** Offer as published to the edge. No razorpayOfferId, active, merchantId or updatedAt. */
export type LadderOffer = Pick<
  Offer,
  "id" | "code" | "kind" | "value" | "maxPaise" | "minOrderPaise" | "method" | "startsAt" | "endsAt" | "fundedBy"
>;

/**
 * Stored in KV at ladderKey(merchantId).
 * offers: active and endsAt > builtAt at build time, sorted by minOrderPaise asc then id asc.
 * mins: offers.map(o => o.minOrderPaise), parallel to offers (for binary search).
 * fillers: sorted by pricePaise asc then sku asc.
 * version: FNV-1a 64-bit, 16 lower-case hex chars, over canonical JSON (sorted keys) of
 *   { v, merchantId, disabled, offers, fillers }. builtAt is NOT hashed, so equal content => equal version.
 */
export interface Ladder {
  v: 1;
  merchantId: string;
  version: string;
  builtAt: number;
  /** Kill switch: when true the widget renders nothing. */
  disabled: boolean;
  mins: number[];
  offers: LadderOffer[];
  fillers: Filler[];
}

export interface BuildLadderInput {
  merchantId: string;
  offers: readonly Offer[];
  fillers: readonly Filler[];
  nowMs: number;
  disabled?: boolean;
}
