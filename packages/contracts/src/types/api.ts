import type { EventType } from "./events";
import type { Filler } from "./filler";
import type { Offer, PaymentMethod } from "./offer";
import type { PaymentMode } from "./payments";
import type { ValidateResult } from "./validate";

/** Every error response. Never includes stack traces or upstream secrets. */
export interface ErrorBody {
  error: ErrorCode;
  detail?: string;
}

export type ErrorCode =
  | "bad_request"
  | "validation_failed"
  | "unauthorized"
  | "not_found"
  | "unknown_merchant"
  | "unknown_offer"
  | "payload_too_large"
  | "invalid_offer"
  | "amount_too_low"
  | "upstream_error"
  | "internal_error";

// GET /healthz
export interface HealthResponse {
  ok: true;
  version: string;
}

// GET /v1/ladder/:merchantId -> Ladder (see ladder.ts). 404 ErrorBody{error:"unknown_merchant"}.

// POST /v1/admin/merchants/:merchantId/offers  body NewOfferInput (schemas)  -> 201
// PATCH /v1/admin/merchants/:merchantId/offers/:offerId  body OfferPatch -> 200
export interface OfferResponse {
  offer: Offer;
}
// DELETE /v1/admin/merchants/:merchantId/offers/:offerId -> 200 {}
export type EmptyResponse = Record<string, never>;
// PUT /v1/admin/merchants/:merchantId/fillers  body Filler[] (max 20)
export type PutFillersRequest = Filler[];
export interface PutFillersResponse {
  count: number;
}
// POST /v1/admin/merchants/:merchantId/rebuild  and  POST /internal/rebuild
export interface RebuildResponse {
  version: string;
}
// POST /internal/rebuild (header x-rebuild-secret). snake_case: it comes from the pg_net trigger.
export interface InternalRebuildRequest {
  merchant_id: string;
}

// POST /v1/checkout/validate -> ValidateResult
export interface CheckoutValidateRequest {
  merchantId: string;
  cartPaise: number;
  method: PaymentMethod | null;
  offerId: string;
}
export type CheckoutValidateResponse = ValidateResult;

// POST /v1/payments/order. 409 {error:"invalid_offer", detail: ValidateReason} when invalid.
export interface PaymentOrderRequest {
  merchantId: string;
  cartPaise: number;
  method: PaymentMethod | null;
  offerId: string | null;
}
export interface PaymentOrderResponse {
  keyId: string;
  orderId: string;
  amountPaise: number;
  currency: "INR";
  expectedSavingPaise: number;
  mode: PaymentMode;
}

// POST /v1/payments/verify (fields exactly as the Razorpay Checkout handler returns them)
export interface PaymentVerifyRequest {
  razorpay_order_id: string;
  razorpay_payment_id: string;
  razorpay_signature: string;
}
export interface PaymentVerifyResponse {
  verified: boolean;
}

// POST /v1/events -> 202 {}. Body is EventRequest JSON, max 1 KB.
// The widget sends it with navigator.sendBeacon as text/plain (no CORS preflight),
// so the server must parse the body as JSON regardless of Content-Type.

// GET /v1/metrics/:merchantId
export interface MetricsResponse {
  merchantId: string;
  counts: Record<EventType, number>;
  /** Ratios are null when the denominator is 0. widget_seen_rate is always null: no page_view event exists. */
  ratios: {
    widget_seen_rate: number | null;
    nudge_click_rate: number | null;
    addon_rate: number | null;
    paid_rate: number | null;
  };
}
