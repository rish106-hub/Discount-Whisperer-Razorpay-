import { z } from "zod";
import { CartPaise, EpochMs, MerchantId, OfferId, Paise } from "./common";

export const PaymentStatusSchema = z.enum(["created", "verified", "failed"]);
export const PaymentModeSchema = z.enum(["razorpay_offer", "server_discount"]);

export const PaymentRecordSchema = z
  .object({
    id: z.number().int().positive(),
    merchantId: MerchantId,
    offerId: OfferId.nullable(),
    razorpayOrderId: z.string().min(1),
    razorpayPaymentId: z.string().min(1).nullable(),
    amountPaise: Paise,
    cartPaise: CartPaise,
    expectedSavingPaise: Paise,
    mode: PaymentModeSchema,
    status: PaymentStatusSchema,
    createdAt: EpochMs,
    updatedAt: EpochMs,
  })
  .strict();
