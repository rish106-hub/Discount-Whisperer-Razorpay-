/** T4's own in-memory Repo (does not import T2's fake). Only payments, offers and events are real. */
import type { EventRequest, NewPayment, Offer, PaymentRecord, PaymentUpdate, Repo } from "@dw/contracts";

export interface MemoryRepo extends Repo {
  payments: PaymentRecord[];
  events: EventRequest[];
}

export function memoryRepo(offers: Offer[], now = () => 0): MemoryRepo {
  const payments: PaymentRecord[] = [];
  const events: EventRequest[] = [];
  const unused = async (): Promise<never> => {
    throw new Error("not used by payments");
  };
  return {
    payments,
    events,
    getAllOffers: async (m) => offers.filter((o) => o.merchantId === m),
    getActiveOffers: async (m) => offers.filter((o) => o.merchantId === m && o.active),
    getFillers: async () => [],
    upsertOffer: unused,
    deactivateOffer: unused,
    setFillers: unused,
    pendingOutboxMerchants: unused,
    pendingOutboxMaxId: unused,
    markOutboxProcessed: unused,
    metrics: unused,
    insertEvent: async (e) => {
      events.push(e);
    },
    insertPayment: async (p: NewPayment) => {
      const row: PaymentRecord = {
        ...p,
        id: payments.length + 1,
        razorpayPaymentId: null,
        status: "created",
        createdAt: now(),
        updatedAt: now(),
      };
      payments.push(row);
      return row;
    },
    getPaymentByOrderId: async (id) => payments.find((p) => p.razorpayOrderId === id) ?? null,
    updatePaymentByOrderId: async (id, u: PaymentUpdate) => {
      const p = payments.find((x) => x.razorpayOrderId === id);
      if (!p) return null;
      p.status = u.status;
      if (u.razorpayPaymentId) p.razorpayPaymentId = u.razorpayPaymentId;
      return p;
    },
  };
}
