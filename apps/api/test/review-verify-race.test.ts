import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Offer, PaymentRecord } from "@dw/contracts";
import { buildLadder, lookup, validateSelection } from "@dw/offer-core";
import { paymentsRoutes } from "../src/routes/payments";
import type { Env } from "../src/env";
import { computeSignature } from "../src/razorpay/signature";
import { memoryRepo } from "./payments/memoryRepo";

const NOW = 1_800_000_000_000;
const SECRET = "fake_secret_for_tests";
const env = { RAZORPAY_KEY_ID: "rzp_test_k1", RAZORPAY_KEY_SECRET: SECRET } as unknown as Env;
const mk = (p: Partial<Offer>): Offer => ({
  id: "m1_X", merchantId: "m1", code: "X", kind: "pct", value: 10, maxPaise: null, minOrderPaise: 0, method: null,
  startsAt: NOW - 1000, endsAt: NOW + 100000, fundedBy: "merchant", razorpayOfferId: null, active: true, updatedAt: 0, ...p,
});
let seq = 0;
let fetchMock: ReturnType<typeof vi.fn>;
beforeEach(() => {
  seq = 0;
  fetchMock = vi.fn(async (_u: string, init: RequestInit) => {
    const b = JSON.parse(init.body as string) as { amount: number };
    return new Response(JSON.stringify({ id: `order_T${++seq}`, amount: b.amount, currency: "INR" }), { status: 200 });
  });
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => vi.unstubAllGlobals());
const sent = (i = 0) => JSON.parse((fetchMock.mock.calls[i]![1] as RequestInit).body as string);
function app(offers: Offer[], repo = memoryRepo(offers, () => NOW)) {
  const a = paymentsRoutes({ repo: () => repo, now: () => NOW });
  const post = (path: string, body: unknown) =>
    a.request(path, { method: "POST", body: JSON.stringify(body), headers: { "content-type": "application/json" } }, env);
  return { repo, post };
}
void computeSignature; void validateSelection; void buildLadder; void lookup;
type _P = PaymentRecord;
describe("verify TOCTOU: status read then unconditional update", () => {
  function racyRepo(offers: Offer[]) {
    const r = memoryRepo(offers, () => NOW);
    const get = r.getPaymentByOrderId;
    // Real Supabase returns a snapshot; add a tick so two requests interleave.
    r.getPaymentByOrderId = async (id) => {
      const p = await get(id);
      const snap = p ? { ...p } : null;
      await new Promise((res) => setTimeout(res, 5));
      return snap;
    };
    return r;
  }
  it("good + bad signature in flight together: verified payment ends up 'failed'", async () => {
    const repo = racyRepo([]);
    const { post } = app([], repo);
    await post("/order", { merchantId: "m1", cartPaise: 50000, method: null, offerId: null });
    const sig = await computeSignature(SECRET, "order_T1", "pay_A");
    const [a, b] = await Promise.all([
      post("/verify", { razorpay_order_id: "order_T1", razorpay_payment_id: "pay_A", razorpay_signature: sig }),
      new Promise((r) => setTimeout(r, 1)).then(() =>
        post("/verify", { razorpay_order_id: "order_T1", razorpay_payment_id: "pay_A", razorpay_signature: "0".repeat(64) })),
    ]);
    expect(await a.json()).toEqual({ verified: true });
    expect(await b.json()).toEqual({ verified: false });
    expect(repo.payments[0]!.status).toBe("verified"); // actual: "failed"
  });
  it("two valid payments on one order: second payment_id overwrites, two payment_verified events", async () => {
    const repo = racyRepo([]);
    const { post } = app([], repo);
    await post("/order", { merchantId: "m1", cartPaise: 50000, method: null, offerId: null });
    const s1 = await computeSignature(SECRET, "order_T1", "pay_A");
    const s2 = await computeSignature(SECRET, "order_T1", "pay_B");
    await Promise.all([
      post("/verify", { razorpay_order_id: "order_T1", razorpay_payment_id: "pay_A", razorpay_signature: s1 }),
      post("/verify", { razorpay_order_id: "order_T1", razorpay_payment_id: "pay_B", razorpay_signature: s2 }),
    ]);
    expect(repo.events.length).toBe(1);
  });
});
