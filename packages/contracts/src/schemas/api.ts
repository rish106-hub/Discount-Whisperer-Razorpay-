import { z } from "zod";
import { CartPaise, MerchantId, Method, OfferId } from "./common";
import { PaymentModeSchema } from "./payments";

export const ErrorCodeSchema = z.enum([
  "bad_request",
  "validation_failed",
  "unauthorized",
  "not_found",
  "unknown_merchant",
  "unknown_offer",
  "payload_too_large",
  "invalid_offer",
  "amount_too_low",
  "upstream_error",
  "internal_error",
]);

export const ErrorBodySchema = z.object({ error: ErrorCodeSchema, detail: z.string().optional() }).strict();

export const InternalRebuildRequestSchema = z.object({ merchant_id: MerchantId }).strict();

export const CheckoutValidateRequestSchema = z
  .object({ merchantId: MerchantId, cartPaise: CartPaise, method: Method.nullable(), offerId: OfferId })
  .strict();

export const PaymentOrderRequestSchema = z
  .object({ merchantId: MerchantId, cartPaise: CartPaise, method: Method.nullable(), offerId: OfferId.nullable() })
  .strict();

export const PaymentOrderResponseSchema = z
  .object({
    keyId: z.string().startsWith("rzp_test_"),
    orderId: z.string().min(1),
    amountPaise: z.number().int().positive(),
    currency: z.literal("INR"),
    expectedSavingPaise: z.number().int().nonnegative(),
    mode: PaymentModeSchema,
  })
  .strict();

/** Razorpay ids look like order_XXXX / pay_XXXX. Signature format is NOT checked here: a malformed
 * signature must reach the HMAC compare and return {verified:false}, not a 400. */
export const PaymentVerifyRequestSchema = z
  .object({
    razorpay_order_id: z.string().regex(/^order_[A-Za-z0-9]{1,40}$/),
    razorpay_payment_id: z.string().regex(/^pay_[A-Za-z0-9]{1,40}$/),
    razorpay_signature: z.string().min(1).max(128),
  })
  .strict();
