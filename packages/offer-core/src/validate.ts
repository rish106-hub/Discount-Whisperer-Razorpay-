import type { Offer, ValidateInput, ValidateResult } from "@dw/contracts";
import { chargeFor, savingPaise } from "./money";

/** Server-side truth for checkout. Check order is part of the contract: first failure wins. */
export function validateSelection(offers: readonly Offer[], input: ValidateInput): ValidateResult {
  const { cartPaise, method, offerId, nowMs } = input;
  const fail = (reason: ValidateResult["reason"]): ValidateResult => ({
    valid: false,
    reason,
    savingPaise: 0,
    chargePaise: cartPaise,
  });
  if (offerId === null) return { valid: true, reason: "ok", savingPaise: 0, chargePaise: cartPaise };

  const o = offers.find((x) => x.id === offerId);
  if (!o) return fail("unknown_offer");
  if (!o.active) return fail("inactive");
  if (nowMs < o.startsAt) return fail("not_started");
  if (nowMs >= o.endsAt) return fail("expired");
  if (cartPaise < o.minOrderPaise) return fail("below_min");
  if (o.method !== null && o.method !== method) return fail("method_mismatch");

  const saving = savingPaise(o, cartPaise);
  return { valid: true, reason: "ok", savingPaise: saving, chargePaise: chargeFor(o.kind, cartPaise, saving) };
}
