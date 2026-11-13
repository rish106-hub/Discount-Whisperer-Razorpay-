import { z } from "zod";
import { EpochMs, MerchantId, Method, OfferCode, OfferId, Paise } from "./common";

export const OfferKindSchema = z.enum(["pct", "flat", "cashback_pct"]);
export const FundedBySchema = z.enum(["merchant", "bank"]);

const offerFields = {
  code: OfferCode,
  kind: OfferKindSchema,
  value: z.number().int().positive().max(2_147_483_647),
  maxPaise: Paise.nullable().default(null),
  minOrderPaise: Paise.default(0),
  method: Method.nullable().default(null),
  startsAt: EpochMs,
  endsAt: EpochMs,
  fundedBy: FundedBySchema,
  razorpayOfferId: z.string().min(1).max(64).nullable().default(null),
  active: z.boolean().default(true),
};

type OfferShape = {
  kind: z.infer<typeof OfferKindSchema>;
  value: number;
  maxPaise: number | null;
  startsAt: number;
  endsAt: number;
};

/** Cross-field rules shared by NewOffer and Offer. */
function offerRules(o: OfferShape, ctx: z.RefinementCtx): void {
  if (o.kind !== "flat" && o.value > 100) {
    ctx.addIssue({ code: "custom", path: ["value"], message: "percent must be 1..100" });
  }
  if (o.kind === "flat" && o.maxPaise !== null) {
    ctx.addIssue({ code: "custom", path: ["maxPaise"], message: "flat offers have no cap" });
  }
  if (o.endsAt <= o.startsAt) {
    ctx.addIssue({ code: "custom", path: ["endsAt"], message: "endsAt must be after startsAt" });
  }
}

/** POST /v1/admin/merchants/:merchantId/offers body. */
export const NewOfferSchema = z.object(offerFields).strict().superRefine(offerRules);

/** PATCH body: field-level checks only; the server re-parses the merged result with NewOfferSchema. */
export const OfferPatchSchema = z
  .object({
    kind: offerFields.kind,
    value: offerFields.value,
    maxPaise: Paise.nullable(),
    minOrderPaise: Paise,
    method: Method.nullable(),
    startsAt: EpochMs,
    endsAt: EpochMs,
    fundedBy: FundedBySchema,
    razorpayOfferId: z.string().min(1).max(64).nullable(),
    active: z.boolean(),
  })
  .partial()
  .strict();

/** A stored offer (repo output, fixtures). */
export const OfferSchema = z
  .object({
    id: OfferId,
    merchantId: MerchantId,
    code: OfferCode,
    kind: OfferKindSchema,
    value: offerFields.value,
    maxPaise: Paise.nullable(),
    minOrderPaise: Paise,
    method: Method.nullable(),
    startsAt: EpochMs,
    endsAt: EpochMs,
    fundedBy: FundedBySchema,
    razorpayOfferId: z.string().min(1).max(64).nullable(),
    active: z.boolean(),
    updatedAt: EpochMs,
  })
  .strict()
  .superRefine((o, ctx) => {
    offerRules(o, ctx);
    if (o.id !== `${o.merchantId}_${o.code}`) {
      ctx.addIssue({ code: "custom", path: ["id"], message: "id must equal merchantId_code" });
    }
  });
