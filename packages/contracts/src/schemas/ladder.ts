import { z } from "zod";
import { EpochMs, MerchantId } from "./common";
import { FillerSchema } from "./filler";
import { FundedBySchema, OfferKindSchema } from "./offer";
import { Method, OfferCode, OfferId, Paise } from "./common";

export const LadderOfferSchema = z
  .object({
    id: OfferId,
    code: OfferCode,
    kind: OfferKindSchema,
    value: z.number().int().positive(),
    maxPaise: Paise.nullable(),
    minOrderPaise: Paise,
    method: Method.nullable(),
    startsAt: EpochMs,
    endsAt: EpochMs,
    fundedBy: FundedBySchema,
  })
  .strict();

export const LadderSchema = z
  .object({
    v: z.literal(1),
    merchantId: MerchantId,
    version: z.string().regex(/^[0-9a-f]{16}$/),
    builtAt: EpochMs,
    disabled: z.boolean(),
    mins: z.array(Paise),
    offers: z.array(LadderOfferSchema),
    fillers: z.array(FillerSchema),
  })
  .strict()
  .refine((l) => l.mins.length === l.offers.length, "mins must parallel offers");
