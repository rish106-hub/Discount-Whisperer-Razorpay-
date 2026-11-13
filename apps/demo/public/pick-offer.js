// Pure helper for the demo: pick the applicable offer with the biggest saving whose charge is payable.
const MIN_CHARGE_PAISE = 100; // Razorpay minimum order amount

/**
 * applicable: LookupResult.applicable; offersById: Map(id -> {kind}); returns offerId or null.
 * Cashback does not reduce the charge (charge = cart); other kinds charge cart - saving.
 */
export function pickOffer(applicable, offersById, cartPaise) {
  let best = null;
  for (const a of applicable || []) {
    const cashback = offersById.get(a.offerId)?.kind === "cashback_pct";
    const charge = cashback ? cartPaise : cartPaise - a.savingPaise;
    if (charge < MIN_CHARGE_PAISE) continue;
    if (!best || a.savingPaise > best.savingPaise) best = a;
  }
  return best ? best.offerId : null;
}
