/** All money is integer paise (Rs 1 = 100). All times are epoch milliseconds, UTC. */

export type OfferKind = "pct" | "flat" | "cashback_pct";
export type FundedBy = "merchant" | "bank";
/** Upper-case payment method code, e.g. "UPI", "HDFC_CC". null on an offer = any method. */
export type PaymentMethod = string;

/** Full offer as stored in Supabase (camelCase view of the `offers` row). */
export interface Offer {
  id: string; // `${merchantId}_${code}`, e.g. "m1_O1"
  merchantId: string;
  code: string;
  kind: OfferKind;
  /** pct / cashback_pct: whole percent 1..100. flat: paise. */
  value: number;
  /** Cap on saving, paise. null = no cap. Always null for flat. */
  maxPaise: number | null;
  minOrderPaise: number;
  method: PaymentMethod | null;
  /** Live iff startsAt <= now < endsAt (end is exclusive). */
  startsAt: number;
  endsAt: number;
  fundedBy: FundedBy;
  /** Server-only. Never copied into a ladder. */
  razorpayOfferId: string | null;
  active: boolean;
  updatedAt: number;
}

/** Admin create body (after zod parsing; defaults applied). id is derived from merchantId + code. */
export interface NewOffer {
  code: string;
  kind: OfferKind;
  value: number;
  maxPaise: number | null;
  minOrderPaise: number;
  method: PaymentMethod | null;
  startsAt: number;
  endsAt: number;
  fundedBy: FundedBy;
  razorpayOfferId: string | null;
  active: boolean;
}

/** Admin PATCH body. Server merges onto the stored offer, then re-validates the full NewOffer. */
export type OfferPatch = Partial<Omit<NewOffer, "code">>;

/** What Repo.upsertOffer writes (updatedAt is set by the database). */
export type OfferUpsert = Omit<Offer, "updatedAt">;
