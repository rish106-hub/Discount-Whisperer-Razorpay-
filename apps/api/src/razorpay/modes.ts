import type { Offer, PaymentMode, ValidateResult } from "@dw/contracts";

export interface OrderPlan {
  mode: PaymentMode;
  /** Amount sent to the Razorpay order, paise. */
  amountPaise: number;
  /** Only set in razorpay_offer mode. */
  offers?: string[];
}

/**
 * Money-review #1 (human decision: "Razorpay-only"). Only Razorpay sees how the shopper actually pays,
 * so an instant discount that requires a payment method may be used only as a Razorpay offer, where
 * Razorpay enforces the method. Cashback never lowers the charge, so it stays allowed.
 * Used by the order route (refuse) and by rebuild (never advertise it in the ladder).
 */
export function isPayableOffer(offer: Pick<Offer, "method" | "kind" | "razorpayOfferId">): boolean {
  return offer.method === null || offer.kind === "cashback_pct" || offer.razorpayOfferId !== null;
}

/** Detail sent with 409 invalid_offer when isPayableOffer is false. */
export const METHOD_NEEDS_RAZORPAY_OFFER = "method_needs_razorpay_offer";

/**
 * razorpay_offer: the offer maps to a Razorpay offer id; the order carries the full cart and Razorpay
 * applies the discount at Checkout. server_discount: we send the already-discounted charge.
 * `offer` must be the offer that `validation` was computed for (null when no offer selected).
 */
export function planOrder(offer: Offer | null, validation: ValidateResult, cartPaise: number): OrderPlan {
  // Cashback is paid after capture; sending offers=[id] could let Razorpay deduct it at checkout.
  if (offer && validation.valid && offer.razorpayOfferId && offer.kind !== "cashback_pct") {
    return { mode: "razorpay_offer", amountPaise: cartPaise, offers: [offer.razorpayOfferId] };
  }
  return { mode: "server_discount", amountPaise: validation.chargePaise };
}
