/**
 * STAND-IN for @dw/offer-core.validateSelection (T1 builds the real one in parallel).
 * Test-only, implements the documented semantics so route tests can run. Never imported by src.
 * T7: delete after the T1 merge and rerun the tests against the real package.
 */
import type { Offer, ValidateInput, ValidateResult } from "@dw/contracts";

function saving(o: Offer, cart: number): number {
  if (o.kind === "flat") return Math.min(o.value, cart);
  const raw = Math.floor((cart * o.value) / 100);
  return o.maxPaise === null ? raw : Math.min(raw, o.maxPaise);
}

export function validateSelection(offers: readonly Offer[], input: ValidateInput): ValidateResult {
  const { cartPaise, method, offerId, nowMs } = input;
  const bad = (reason: ValidateResult["reason"]): ValidateResult => ({
    valid: false,
    reason,
    savingPaise: 0,
    chargePaise: cartPaise,
  });
  if (offerId === null) return { valid: true, reason: "ok", savingPaise: 0, chargePaise: cartPaise };
  const o = offers.find((x) => x.id === offerId);
  if (!o) return bad("unknown_offer");
  if (!o.active) return bad("inactive");
  if (nowMs < o.startsAt) return bad("not_started");
  if (nowMs >= o.endsAt) return bad("expired");
  if (cartPaise < o.minOrderPaise) return bad("below_min");
  if (o.method !== null && o.method !== method) return bad("method_mismatch");
  const s = saving(o, cartPaise);
  return { valid: true, reason: "ok", savingPaise: s, chargePaise: o.kind === "cashback_pct" ? cartPaise : cartPaise - s };
}
