import type { EventRequest, EventType } from "./events";
import type { Filler } from "./filler";
import type { Offer, OfferUpsert } from "./offer";
import type { NewPayment, PaymentRecord, PaymentUpdate } from "./payments";

export interface PendingOutbox {
  merchantId: string;
  /** Highest unprocessed outbox id for this merchant at read time. */
  maxOutboxId: number;
}

/**
 * Data access used by the Worker. Implemented by supabaseRepo (T2) and in-memory fakes in tests.
 *
 * Rebuild protocol (prevents losing an edit that lands mid-rebuild):
 *   1. maxId = await pendingOutboxMaxId(m)        // read BEFORE reading offers
 *   2. read offers + fillers, build, KV put
 *   3. if (maxId !== null) await markOutboxProcessed(m, maxId)   // only rows with id <= maxId
 * An edit committed after step 1 has a larger outbox id, stays pending, and triggers its own rebuild.
 */
export interface Repo {
  /** active = true, any time window. */
  getActiveOffers(merchantId: string): Promise<Offer[]>;
  /** Every offer incl. inactive (checkout validation needs "inactive" vs "unknown_offer"). */
  getAllOffers(merchantId: string): Promise<Offer[]>;
  getFillers(merchantId: string): Promise<Filler[]>;
  /** rpc upsert_offer_with_outbox. */
  upsertOffer(offer: OfferUpsert): Promise<Offer>;
  /** rpc deactivate_offer_with_outbox. Returns false if the offer does not exist for this merchant. */
  deactivateOffer(merchantId: string, offerId: string): Promise<boolean>;
  /** rpc set_fillers_with_outbox. Replaces all fillers. Returns the new count. */
  setFillers(merchantId: string, fillers: Filler[]): Promise<number>;
  pendingOutboxMerchants(limit: number): Promise<PendingOutbox[]>;
  pendingOutboxMaxId(merchantId: string): Promise<number | null>;
  /** Sets processed_at = now() for this merchant's rows with id <= upToId and processed_at null. */
  markOutboxProcessed(merchantId: string, upToId: number): Promise<void>;
  insertEvent(event: EventRequest): Promise<void>;
  /** rpc metrics_for_merchant. Missing types are 0. */
  metrics(merchantId: string): Promise<Record<EventType, number>>;
  insertPayment(payment: NewPayment): Promise<PaymentRecord>;
  getPaymentByOrderId(razorpayOrderId: string): Promise<PaymentRecord | null>;
  /** null if no row has this order id. */
  updatePaymentByOrderId(razorpayOrderId: string, update: PaymentUpdate): Promise<PaymentRecord | null>;
}
