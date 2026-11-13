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
describe("razorpay_offer mode with a cashback offer", () => {
  it("cashback offer with razorpayOfferId is sent as offers=[id]; Razorpay may deduct it from the charge", async () => {
    const o = mk({ id: "m1_C", code: "C", kind: "cashback_pct", value: 5, method: "UPI", razorpayOfferId: "offer_CB1" });
    const { post } = app([o]);
    const res = await post("/order", { merchantId: "m1", cartPaise: 200000, method: "UPI", offerId: "m1_C" });
    expect(res.status).toBe(200);
    // Charge must equal cart (cashback not deducted). Attaching an instant-discount-capable Razorpay offer
    // lets Z = cart - x while X/Y say cart. Expect no offers[] for cashback (or server refuses the mapping).
    expect(sent().offers).toBeUndefined();
  });
});
