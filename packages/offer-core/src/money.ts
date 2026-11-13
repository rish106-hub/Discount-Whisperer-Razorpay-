import type { Offer } from "@dw/contracts";

/**
 * Saving in integer paise for one offer on a cart.
 * pct / cashback_pct: floor(cart * value / 100), capped at maxPaise when set.
 * flat: min(value, cart). Never exceeds the cart, never negative.
 * cart * value <= 2e9 * 100, far below 2^53, so plain number math is exact.
 */
export function savingPaise(
  offer: Pick<Offer, "kind" | "value" | "maxPaise">,
  cartPaise: number,
): number {
  if (cartPaise <= 0) return 0;
  if (offer.kind === "flat") return Math.min(offer.value, cartPaise);
  const raw = Math.floor((cartPaise * offer.value) / 100);
  const capped = offer.maxPaise === null ? raw : Math.min(raw, offer.maxPaise);
  return Math.min(capped, cartPaise);
}

/** Amount the shopper is charged. Cashback is paid later, so it never lowers the charge. */
export function chargeFor(kind: Offer["kind"], cartPaise: number, saving: number): number {
  return kind === "cashback_pct" ? cartPaise : cartPaise - saving;
}
