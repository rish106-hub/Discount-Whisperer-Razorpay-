/**
 * Database names shared by T2 (supabaseRepo), T3 (migrations) and T4 (payments).
 * Columns are snake_case in Postgres and camelCase in TypeScript. Times are timestamptz in
 * Postgres and epoch ms in TypeScript; the repo converts.
 */
export const TABLES = {
  offers: "offers",
  fillers: "fillers",
  outbox: "outbox",
  events: "events",
  payments: "payments",
  appConfig: "app_config",
} as const;

export const RPC = {
  /** (p_offer jsonb) returns offers. p_offer keys are the snake_case column names below. */
  upsertOfferWithOutbox: "upsert_offer_with_outbox",
  /** (p_merchant_id text, p_fillers jsonb) returns int. p_fillers = [{sku, name, price_paise}]. */
  setFillersWithOutbox: "set_fillers_with_outbox",
  /** (p_offer_id text) returns void. */
  deactivateOfferWithOutbox: "deactivate_offer_with_outbox",
  /** (p_merchant_id text) returns jsonb {seen, nudge_click, addon, checkout, payment_verified}. */
  metricsForMerchant: "metrics_for_merchant",
} as const;

/** TS field -> Postgres column. */
export const OFFER_COLUMNS = {
  id: "id",
  merchantId: "merchant_id",
  code: "code",
  kind: "kind",
  value: "value",
  maxPaise: "max_paise",
  minOrderPaise: "min_order_paise",
  method: "method",
  startsAt: "starts_at",
  endsAt: "ends_at",
  fundedBy: "funded_by",
  razorpayOfferId: "razorpay_offer_id",
  active: "active",
  updatedAt: "updated_at",
} as const;

export const FILLER_COLUMNS = {
  merchantId: "merchant_id",
  sku: "sku",
  name: "name",
  pricePaise: "price_paise",
} as const;

export const OUTBOX_COLUMNS = {
  id: "id",
  merchantId: "merchant_id",
  createdAt: "created_at",
  processedAt: "processed_at",
} as const;

export const EVENT_COLUMNS = {
  id: "id",
  merchantId: "merchant_id",
  sessionId: "session_id",
  type: "type",
  cartPaise: "cart_paise",
  offerId: "offer_id",
  createdAt: "created_at",
} as const;

/** cart_paise and mode are additions to the original plan (flagged at checkpoint 1). */
export const PAYMENT_COLUMNS = {
  id: "id",
  merchantId: "merchant_id",
  offerId: "offer_id",
  razorpayOrderId: "razorpay_order_id",
  razorpayPaymentId: "razorpay_payment_id",
  amountPaise: "amount_paise",
  cartPaise: "cart_paise",
  expectedSavingPaise: "expected_saving_paise",
  mode: "mode",
  status: "status",
  createdAt: "created_at",
  updatedAt: "updated_at",
} as const;

export const APP_CONFIG_KEYS = {
  rebuildUrl: "rebuild_url",
  rebuildSecret: "rebuild_secret",
} as const;
