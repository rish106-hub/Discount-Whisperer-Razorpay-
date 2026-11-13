/** Owner: T2. In-memory Repo for tests and local use. Mirrors the Supabase RPC semantics. */
import type {
  EventRequest, EventType, Filler, NewPayment, Offer, OfferUpsert, PaymentRecord, PaymentUpdate, PendingOutbox, Repo,
} from "@dw/contracts";
import { EVENT_TYPES } from "@dw/contracts";

export interface MemoryRepo extends Repo {
  /** Test inspection. */
  readonly state: {
    offers: Map<string, Offer>;
    fillers: Map<string, Filler[]>;
    outbox: { id: number; merchantId: string; processed: boolean }[];
    events: EventRequest[];
    payments: PaymentRecord[];
  };
}

export function createMemoryRepo(seed?: { offers?: Offer[]; fillers?: Record<string, Filler[]>; now?: () => number }): MemoryRepo {
  const now = seed?.now ?? (() => Date.now());
  const state: MemoryRepo["state"] = {
    offers: new Map((seed?.offers ?? []).map((o) => [o.id, { ...o }])),
    fillers: new Map(Object.entries(seed?.fillers ?? {})),
    outbox: [],
    events: [],
    payments: [],
  };
  let outboxId = 0;
  let paymentId = 0;
  const bump = (merchantId: string) => state.outbox.push({ id: ++outboxId, merchantId, processed: false });
  const forMerchant = (m: string) => [...state.offers.values()].filter((o) => o.merchantId === m);

  return {
    state,
    async getActiveOffers(m) { return forMerchant(m).filter((o) => o.active); },
    async getAllOffers(m) { return forMerchant(m); },
    async getFillers(m) { return [...(state.fillers.get(m) ?? [])]; },
    async upsertOffer(offer: OfferUpsert) {
      const stored: Offer = { ...offer, updatedAt: now() };
      state.offers.set(stored.id, stored);
      bump(stored.merchantId);
      return { ...stored };
    },
    async deactivateOffer(m, id) {
      const o = state.offers.get(id);
      if (!o || o.merchantId !== m) return false;
      state.offers.set(id, { ...o, active: false, updatedAt: now() });
      bump(m);
      return true;
    },
    async setFillers(m, fillers) {
      state.fillers.set(m, fillers.map((f) => ({ ...f })));
      bump(m);
      return fillers.length;
    },
    async pendingOutboxMerchants(limit): Promise<PendingOutbox[]> {
      const by = new Map<string, number>();
      for (const r of state.outbox) if (!r.processed) by.set(r.merchantId, Math.max(by.get(r.merchantId) ?? 0, r.id));
      return [...by].slice(0, limit).map(([merchantId, maxOutboxId]) => ({ merchantId, maxOutboxId }));
    },
    async pendingOutboxMaxId(m) {
      const ids = state.outbox.filter((r) => r.merchantId === m && !r.processed).map((r) => r.id);
      return ids.length ? Math.max(...ids) : null;
    },
    async markOutboxProcessed(m, upTo) {
      for (const r of state.outbox) if (r.merchantId === m && r.id <= upTo) r.processed = true;
    },
    async insertEvent(e) { state.events.push({ ...e }); },
    async metrics(m) {
      const out = Object.fromEntries(EVENT_TYPES.map((t) => [t, 0])) as Record<EventType, number>;
      for (const e of state.events) if (e.merchantId === m) out[e.type]++;
      return out;
    },
    async insertPayment(p: NewPayment) {
      const rec: PaymentRecord = { ...p, id: ++paymentId, razorpayPaymentId: null, status: "created", createdAt: now(), updatedAt: now() };
      state.payments.push(rec);
      return { ...rec };
    },
    async getPaymentByOrderId(id) {
      const r = state.payments.find((p) => p.razorpayOrderId === id);
      return r ? { ...r } : null;
    },
    async updatePaymentByOrderId(id, u: PaymentUpdate) {
      const r = state.payments.find((p) => p.razorpayOrderId === id);
      if (!r) return null;
      r.status = u.status;
      if (u.razorpayPaymentId !== undefined) r.razorpayPaymentId = u.razorpayPaymentId;
      r.updatedAt = now();
      return { ...r };
    },
  };
}
