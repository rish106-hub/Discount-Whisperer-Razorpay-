import { z } from "zod";
import { CartPaise, EpochMs, Method, OfferId, Paise } from "./common";

export const ValidateReasonSchema = z.enum([
  "ok",
  "unknown_offer",
  "inactive",
  "not_started",
  "expired",
  "below_min",
  "method_mismatch",
]);

export const ValidateInputSchema = z
  .object({ cartPaise: CartPaise, method: Method.nullable(), offerId: OfferId.nullable(), nowMs: EpochMs })
  .strict();

export const ValidateResultSchema = z
  .object({ valid: z.boolean(), reason: ValidateReasonSchema, savingPaise: Paise, chargePaise: Paise })
  .strict();
