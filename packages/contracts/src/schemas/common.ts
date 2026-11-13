import { z } from "zod";
import {
  MAX_CART_PAISE,
  MERCHANT_ID_PATTERN,
  METHOD_PATTERN,
  OFFER_CODE_PATTERN,
  PG_INT_MAX,
  SKU_PATTERN,
} from "../constants";

/** Integer paise, never negative, fits a Postgres int. */
export const Paise = z.number().int().nonnegative().max(PG_INT_MAX);
export const CartPaise = z.number().int().nonnegative().max(MAX_CART_PAISE);
export const EpochMs = z.number().int().nonnegative();
export const MerchantId = z.string().regex(MERCHANT_ID_PATTERN);
export const OfferCode = z.string().regex(OFFER_CODE_PATTERN);
/** `${merchantId}_${code}` */
export const OfferId = z.string().min(3).max(53);
export const Method = z.string().regex(METHOD_PATTERN);
export const Sku = z.string().regex(SKU_PATTERN);
