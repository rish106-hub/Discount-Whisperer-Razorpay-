import type { PaymentMethod } from "./offer";

export interface ValidateInput {
  cartPaise: number;
  method: PaymentMethod | null;
  /** null = no offer selected: always valid, saving 0. */
  offerId: string | null;
  nowMs: number;
}

/** Checked in this order; the first failure wins. */
export type ValidateReason =
  | "ok"
  | "unknown_offer"
  | "inactive"
  | "not_started"
  | "expired"
  | "below_min"
  | "method_mismatch";

/**
 * valid=false => savingPaise 0, chargePaise = cartPaise.
 * chargePaise = cartPaise - savingPaise for pct and flat; = cartPaise for cashback_pct.
 * chargePaise can be 0 (flat >= cart); the payments route must reject amounts below
 * RAZORPAY_MIN_AMOUNT_PAISE.
 */
export interface ValidateResult {
  valid: boolean;
  reason: ValidateReason;
  savingPaise: number;
  chargePaise: number;
}
