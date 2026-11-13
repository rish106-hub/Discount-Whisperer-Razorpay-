import { z } from "zod";
import { MAX_FILLERS } from "../constants";
import { Paise, Sku } from "./common";

export const FillerSchema = z
  .object({
    sku: Sku,
    name: z.string().min(1).max(80),
    pricePaise: Paise.refine((n) => n > 0, "price must be positive"),
  })
  .strict();

/** PUT /v1/admin/merchants/:merchantId/fillers body. */
export const PutFillersSchema = z
  .array(FillerSchema)
  .max(MAX_FILLERS)
  .refine((fs) => new Set(fs.map((f) => f.sku)).size === fs.length, "skus must be unique");
