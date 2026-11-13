import type { Offer, PaymentMode, ValidateResult } from "@dw/contracts";

export interface OrderPlan {
  mode: PaymentMode;
  /** Amount sent to the Razorpay order, paise. */
  amountPaise: number;
  /** Only set in razorpay_offer mode. */
  offers?: string[];
}

/**
 * razorpay_offer: the offer maps to a Razorpay offer id; the order carries the full cart and Razorpay
 * applies the discount at Checkout. server_discount: we send the already-discounted charge.
 * `offer` must be the offer that `validation` was computed for (null when no offer selected).
 */
export function planOrder(offer: Offer | null, validation: ValidateResult, cartPaise: number): OrderPlan {
  if (offer && validation.valid && offer.razorpayOfferId) {
    return { mode: "razorpay_offer", amountPaise: cartPaise, offers: [offer.razorpayOfferId] };
  }
  return { mode: "server_discount", amountPaise: validation.chargePaise };
}
