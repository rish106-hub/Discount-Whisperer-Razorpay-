import { z } from "zod";
import { CartPaise, EpochMs, Method, OfferId, Paise } from "./common";
import { FillerSchema } from "./filler";

export const LookupInputSchema = z
  .object({ cartPaise: CartPaise, method: Method.nullable(), nowMs: EpochMs })
  .strict();

export const LookupResultSchema = z
  .object({
    step: z.number().int().nonnegative(),
    applicable: z.array(z.object({ offerId: OfferId, savingPaise: Paise }).strict()),
    conditional: z.array(z.object({ offerId: OfferId, method: Method, savingPaise: Paise }).strict()),
    unlockable: z
      .array(
        z
          .object({
            offerId: OfferId,
            gapPaise: Paise,
            savingPaise: Paise,
            score: z.number().nonnegative(),
            method: Method.nullable(),
          })
          .strict(),
      )
      .max(3),
    filler: FillerSchema.nullable(),
  })
  .strict();
