/** Shared limits and keys. Runtime values, but tiny and dependency-free (safe for the widget). */

export const LADDER_SCHEMA_VERSION = 1 as const;
export const ladderKey = (merchantId: string): string => `ladder:${merchantId}`;

/** merchantId: lower-case, max 20 chars so the Razorpay receipt "dw_{id}_{13-digit ms}" fits 40. */
export const MERCHANT_ID_PATTERN = /^[a-z0-9_-]{1,20}$/;
export const OFFER_CODE_PATTERN = /^[A-Za-z0-9_-]{1,32}$/;
export const METHOD_PATTERN = /^[A-Z0-9_]{2,32}$/;
export const SKU_PATTERN = /^[A-Za-z0-9_.-]{1,64}$/;

/** Rs 2 crore. Fits Postgres int (cart_paise columns) and keeps cart * percent far below 2^53. */
export const MAX_CART_PAISE = 2_000_000_000;
export const MAX_FILLERS = 20;
export const MAX_EVENT_BODY_BYTES = 1024;
export const RAZORPAY_MIN_AMOUNT_PAISE = 100;
export const RAZORPAY_RECEIPT_MAX = 40;

export const WIDGET_FETCH_TIMEOUT_MS = 800;
export const LADDER_CACHE_MAX_AGE_S = 60;
export const RECONCILER_BATCH = 50;
export const REBUILD_SECRET_HEADER = "x-rebuild-secret";

/** Postgres int is 32-bit; schemas cap every paise column at this. */
export const PG_INT_MAX = 2_147_483_647;

export const EVENT_TYPES = ["seen", "nudge_click", "addon", "checkout", "payment_verified"] as const;
