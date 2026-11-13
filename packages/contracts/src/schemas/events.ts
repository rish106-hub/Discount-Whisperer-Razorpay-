import { z } from "zod";
import { EVENT_TYPES } from "../constants";
import { CartPaise, MerchantId, OfferId } from "./common";

export const EventTypeSchema = z.enum(EVENT_TYPES);

export const EventRequestSchema = z
  .object({
    merchantId: MerchantId,
    sessionId: z.string().regex(/^[A-Za-z0-9_-]{8,64}$/),
    type: EventTypeSchema,
    cartPaise: CartPaise,
    offerId: OfferId.nullable().optional(),
  })
  .strict();
