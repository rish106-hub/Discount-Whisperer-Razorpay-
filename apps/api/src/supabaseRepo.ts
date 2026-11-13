/** Owner: T2. Repo backed by Supabase (service role, Worker only). Columns snake_case <-> camelCase here. */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import {
  EVENT_TYPES, RPC, TABLES, type EventRequest, type EventType, type Filler, type NewPayment, type Offer,
  type OfferUpsert, type PaymentRecord, type PaymentUpdate, type PendingOutbox, type Repo,
} from "@dw/contracts";
import type { Env } from "./env";

type Row = Record<string, unknown>;
const ms = (v: unknown): number => new Date(v as string).getTime();
const iso = (n: number): string => new Date(n).toISOString();

function fail(what: string, error: { message: string } | null): never {
  // Message only: supabase errors carry no secrets, but keep upstream text out of responses (handlers map to 500).
  throw new Error(`supabase ${what}: ${error?.message ?? "unknown"}`);
}

export function offerFromRow(r: Row): Offer {
  return {
    id: r.id as string, merchantId: r.merchant_id as string, code: r.code as string, kind: r.kind as Offer["kind"],
    value: r.value as number, maxPaise: (r.max_paise as number | null) ?? null, minOrderPaise: r.min_order_paise as number,
    method: (r.method as string | null) ?? null, startsAt: ms(r.starts_at), endsAt: ms(r.ends_at),
    fundedBy: r.funded_by as Offer["fundedBy"], razorpayOfferId: (r.razorpay_offer_id as string | null) ?? null,
    active: r.active as boolean, updatedAt: ms(r.updated_at),
  };
}

export function offerToRpc(o: OfferUpsert): Row {
  return {
    id: o.id, merchant_id: o.merchantId, code: o.code, kind: o.kind, value: o.value, max_paise: o.maxPaise,
    min_order_paise: o.minOrderPaise, method: o.method, starts_at: iso(o.startsAt), ends_at: iso(o.endsAt),
    funded_by: o.fundedBy, razorpay_offer_id: o.razorpayOfferId, active: o.active,
  };
}

export function paymentFromRow(r: Row): PaymentRecord {
  return {
    id: r.id as number, merchantId: r.merchant_id as string, offerId: (r.offer_id as string | null) ?? null,
    razorpayOrderId: r.razorpay_order_id as string, razorpayPaymentId: (r.razorpay_payment_id as string | null) ?? null,
    amountPaise: r.amount_paise as number, cartPaise: r.cart_paise as number,
    expectedSavingPaise: r.expected_saving_paise as number, mode: r.mode as PaymentRecord["mode"],
    status: r.status as PaymentRecord["status"], createdAt: ms(r.created_at), updatedAt: ms(r.updated_at),
  };
}

export function createSupabaseRepo(env: Env): Repo {
  const db: SupabaseClient = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const offersFor = async (merchantId: string, activeOnly: boolean): Promise<Offer[]> => {
    let q = db.from(TABLES.offers).select("*").eq("merchant_id", merchantId);
    if (activeOnly) q = q.eq("active", true);
    const { data, error } = await q;
    if (error) fail("offers", error);
    return (data as Row[]).map(offerFromRow);
  };

  return {
    getActiveOffers: (m) => offersFor(m, true),
    getAllOffers: (m) => offersFor(m, false),
    async getFillers(m): Promise<Filler[]> {
      const { data, error } = await db.from(TABLES.fillers).select("sku,name,price_paise").eq("merchant_id", m);
      if (error) fail("fillers", error);
      return (data as Row[]).map((r) => ({ sku: r.sku as string, name: r.name as string, pricePaise: r.price_paise as number }));
    },
    async upsertOffer(offer) {
      const { data, error } = await db.rpc(RPC.upsertOfferWithOutbox, { p_offer: offerToRpc(offer) });
      if (error) fail("upsert_offer", error);
      return offerFromRow((Array.isArray(data) ? data[0] : data) as Row);
    },
    async deactivateOffer(merchantId, offerId) {
      // RPC takes only the offer id: check ownership first so another merchant's offer is never touched.
      const { data, error } = await db.from(TABLES.offers).select("id").eq("id", offerId).eq("merchant_id", merchantId).maybeSingle();
      if (error) fail("deactivate lookup", error);
      if (!data) return false;
      const r = await db.rpc(RPC.deactivateOfferWithOutbox, { p_offer_id: offerId });
      if (r.error) fail("deactivate_offer", r.error);
      return true;
    },
    async setFillers(merchantId, fillers) {
      const p_fillers = fillers.map((f) => ({ sku: f.sku, name: f.name, price_paise: f.pricePaise }));
      const { data, error } = await db.rpc(RPC.setFillersWithOutbox, { p_merchant_id: merchantId, p_fillers });
      if (error) fail("set_fillers", error);
      return data as number;
    },
    async pendingOutboxMerchants(limit): Promise<PendingOutbox[]> {
      // Plain query: per-merchant max over unprocessed rows. Bounded read, grouped here.
      const { data, error } = await db.from(TABLES.outbox).select("id,merchant_id").is("processed_at", null)
        .order("id", { ascending: true }).limit(1000);
      if (error) fail("outbox", error);
      const by = new Map<string, number>();
      for (const r of data as Row[]) by.set(r.merchant_id as string, Math.max(by.get(r.merchant_id as string) ?? 0, r.id as number));
      return [...by].slice(0, limit).map(([merchantId, maxOutboxId]) => ({ merchantId, maxOutboxId }));
    },
    async pendingOutboxMaxId(m) {
      const { data, error } = await db.from(TABLES.outbox).select("id").eq("merchant_id", m).is("processed_at", null)
        .order("id", { ascending: false }).limit(1);
      if (error) fail("outbox max", error);
      return (data as Row[]).length ? ((data as Row[])[0]!.id as number) : null;
    },
    async markOutboxProcessed(m, upToId) {
      const { error } = await db.from(TABLES.outbox).update({ processed_at: iso(Date.now()) })
        .eq("merchant_id", m).lte("id", upToId).is("processed_at", null);
      if (error) fail("outbox mark", error);
    },
    async insertEvent(e: EventRequest) {
      const { error } = await db.from(TABLES.events).insert({
        merchant_id: e.merchantId, session_id: e.sessionId, type: e.type, cart_paise: e.cartPaise, offer_id: e.offerId ?? null,
      });
      if (error) fail("event", error);
    },
    async metrics(m) {
      const { data, error } = await db.rpc(RPC.metricsForMerchant, { p_merchant_id: m });
      if (error) fail("metrics", error);
      const raw = (data ?? {}) as Partial<Record<EventType, number>>;
      return Object.fromEntries(EVENT_TYPES.map((t) => [t, Number(raw[t] ?? 0)])) as Record<EventType, number>;
    },
    async insertPayment(p: NewPayment) {
      const { data, error } = await db.from(TABLES.payments).insert({
        merchant_id: p.merchantId, offer_id: p.offerId, razorpay_order_id: p.razorpayOrderId, amount_paise: p.amountPaise,
        cart_paise: p.cartPaise, expected_saving_paise: p.expectedSavingPaise, mode: p.mode, status: "created",
      }).select("*").single();
      if (error) fail("payment insert", error);
      return paymentFromRow(data as Row);
    },
    async getPaymentByOrderId(id) {
      const { data, error } = await db.from(TABLES.payments).select("*").eq("razorpay_order_id", id).maybeSingle();
      if (error) fail("payment get", error);
      return data ? paymentFromRow(data as Row) : null;
    },
    async updatePaymentByOrderId(id, u: PaymentUpdate) {
      const patch: Row = { status: u.status, updated_at: iso(Date.now()) };
      if (u.razorpayPaymentId !== undefined) patch.razorpay_payment_id = u.razorpayPaymentId;
      const { data, error } = await db.from(TABLES.payments).update(patch).eq("razorpay_order_id", id).select("*").maybeSingle();
      if (error) fail("payment update", error);
      return data ? paymentFromRow(data as Row) : null;
    },
  };
}
