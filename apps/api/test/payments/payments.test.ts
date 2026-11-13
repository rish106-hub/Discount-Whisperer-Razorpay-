import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Offer } from "@dw/contracts";
import { paymentsRoutes } from "../../src/routes/payments";
import type { Env } from "../../src/env";
import { computeSignature } from "../../src/razorpay/signature";
import { memoryRepo } from "./memoryRepo";

const NOW = 1_800_000_000_000;
const SECRET = "fake_secret_for_tests";
const env = { RAZORPAY_KEY_ID: "rzp_test_k1", RAZORPAY_KEY_SECRET: SECRET } as unknown as Env;

const base: Offer = {
  id: "m1_O1", merchantId: "m1", code: "O1", kind: "pct", value: 10, maxPaise: 30000, minOrderPaise: 199900,
  method: null, startsAt: NOW - 1000, endsAt: NOW + 1000, fundedBy: "merchant", razorpayOfferId: null, active: true, updatedAt: 0,
};
const mapped: Offer = { ...base, id: "m1_O2", code: "O2", kind: "flat", value: 25000, maxPaise: null, minOrderPaise: 249900,
  method: "HDFC_CC", fundedBy: "bank", razorpayOfferId: "offer_ABC123" };
const flatBig: Offer = { ...base, id: "m1_F", code: "F", kind: "flat", value: 99999999, maxPaise: null, minOrderPaise: 0 };

function setup(offers: Offer[] = [base, mapped, flatBig]) {
  const repo = memoryRepo(offers, () => NOW);
  const app = paymentsRoutes({ repo: () => repo, now: () => NOW });
  const post = (path: string, body: unknown, e: Env = env) =>
    app.request(path, { method: "POST", body: typeof body === "string" ? body : JSON.stringify(body), headers: { "content-type": "text/plain" } }, e);
  return { repo, post };
}

let orderSeq = 0;
let fetchMock: ReturnType<typeof vi.fn>;
beforeEach(() => {
  orderSeq = 0;
  fetchMock = vi.fn(async (_u: string, init: RequestInit) => {
    const b = JSON.parse(init.body as string) as { amount: number };
    return new Response(JSON.stringify({ id: `order_T${++orderSeq}`, amount: b.amount, currency: "INR" }), { status: 200 });
  });
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

const sent = (i = 0) => JSON.parse((fetchMock.mock.calls[i]![1] as RequestInit).body as string);

describe("POST /order", () => {
  it("unmapped offer -> server_discount with reduced amount, no offers array", async () => {
    const { post, repo } = setup();
    const res = await post("/order", { merchantId: "m1", cartPaise: 260000, method: null, offerId: "m1_O1" });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ keyId: "rzp_test_k1", orderId: "order_T1", amountPaise: 234000, currency: "INR", expectedSavingPaise: 26000, mode: "server_discount" });
    expect(sent().offers).toBeUndefined();
    expect(sent().amount).toBe(234000);
    expect(sent().receipt).toBe(`dw_m1_${NOW}`);
    expect(repo.payments[0]).toMatchObject({ status: "created", mode: "server_discount", cartPaise: 260000, amountPaise: 234000, expectedSavingPaise: 26000, offerId: "m1_O1" });
  });
  it("mapped offer -> razorpay_offer, full cart amount plus offers[]", async () => {
    const { post, repo } = setup();
    const res = await post("/order", { merchantId: "m1", cartPaise: 260000, method: "HDFC_CC", offerId: "m1_O2" });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ amountPaise: 260000, expectedSavingPaise: 25000, mode: "razorpay_offer" });
    expect(sent().offers).toEqual(["offer_ABC123"]);
    expect(sent().amount).toBe(260000);
    expect(repo.payments[0]).toMatchObject({ mode: "razorpay_offer", amountPaise: 260000, cartPaise: 260000 });
  });
  it("offerId null is valid: full price, saving 0", async () => {
    const { post } = setup();
    const res = await post("/order", { merchantId: "m1", cartPaise: 180000, method: null, offerId: null });
    expect(await res.json()).toMatchObject({ amountPaise: 180000, expectedSavingPaise: 0, mode: "server_discount" });
  });
  it("invalid offer -> 409 invalid_offer with reason, Razorpay never called", async () => {
    const { post, repo } = setup();
    const cases: Array<[unknown, string]> = [
      [{ cartPaise: 180000, method: null, offerId: "m1_O1" }, "below_min"],
      [{ cartPaise: 260000, method: "UPI", offerId: "m1_O2" }, "method_mismatch"],
      [{ cartPaise: 260000, method: null, offerId: "m1_NOPE" }, "unknown_offer"],
    ];
    for (const [rest, reason] of cases) {
      const res = await post("/order", { merchantId: "m1", ...(rest as object) });
      expect(res.status).toBe(409);
      expect(await res.json()).toEqual({ error: "invalid_offer", detail: reason });
    }
    expect(fetchMock).not.toHaveBeenCalled();
    expect(repo.payments).toHaveLength(0);
  });
  it("expired offer uses the injected clock", async () => {
    const { post } = setup([{ ...base, endsAt: NOW }]);
    const res = await post("/order", { merchantId: "m1", cartPaise: 260000, method: null, offerId: "m1_O1" });
    expect(await res.json()).toEqual({ error: "invalid_offer", detail: "expired" });
  });
  it("charge below 100 paise -> 409 amount_too_low (also when cart itself is tiny)", async () => {
    const { post } = setup();
    const a = await post("/order", { merchantId: "m1", cartPaise: 5000, method: null, offerId: "m1_F" });
    expect(a.status).toBe(409);
    expect(await a.json()).toEqual({ error: "amount_too_low" });
    const b = await post("/order", { merchantId: "m1", cartPaise: 99, method: null, offerId: null });
    expect(b.status).toBe(409);
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it("bad bodies -> 400 validation_failed", async () => {
    const { post } = setup();
    for (const body of ["not json", {}, { merchantId: "m1", cartPaise: 1.5, method: null, offerId: null }, { merchantId: "m1", cartPaise: 1000, method: null, offerId: null, extra: 1 }]) {
      const res = await post("/order", body);
      expect(res.status).toBe(400);
      expect((await res.json() as { error: string }).error).toBe("validation_failed");
    }
  });
  it("Razorpay 500 then 200 succeeds after one retry", async () => {
    const { post } = setup();
    fetchMock.mockReset();
    fetchMock.mockResolvedValueOnce(new Response("boom", { status: 500 })).mockResolvedValueOnce(new Response(JSON.stringify({ id: "order_R", amount: 180000, currency: "INR" }), { status: 200 }));
    const res = await post("/order", { merchantId: "m1", cartPaise: 180000, method: null, offerId: null });
    expect(res.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
  it("Razorpay down -> 502 upstream_error, no payment row, no upstream detail", async () => {
    const { post, repo } = setup();
    fetchMock.mockReset();
    fetchMock.mockResolvedValue(new Response("secret upstream text", { status: 500 }));
    const res = await post("/order", { merchantId: "m1", cartPaise: 180000, method: null, offerId: null });
    expect(res.status).toBe(502);
    expect(await res.json()).toEqual({ error: "upstream_error" });
    expect(repo.payments).toHaveLength(0);
  });
  it("refuses non-test keys and never leaks the secret in responses", async () => {
    const { post } = setup();
    const res = await post("/order", { merchantId: "m1", cartPaise: 180000, method: null, offerId: null }, { ...env, RAZORPAY_KEY_ID: "rzp_live_x" } as Env);
    expect(res.status).toBe(500);
    expect(await res.text()).not.toContain(SECRET);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("POST /verify", () => {
  async function ordered() {
    const s = setup();
    await s.post("/order", { merchantId: "m1", cartPaise: 260000, method: null, offerId: "m1_O1" });
    return s;
  }
  const body = async (sig?: string, pay = "pay_P1") => ({
    razorpay_order_id: "order_T1",
    razorpay_payment_id: pay,
    razorpay_signature: sig ?? (await computeSignature(SECRET, "order_T1", pay)),
  });

  it("good signature -> verified, row updated, one payment_verified event", async () => {
    const { post, repo } = await ordered();
    const res = await post("/verify", await body());
    expect(await res.json()).toEqual({ verified: true });
    expect(repo.payments[0]).toMatchObject({ status: "verified", razorpayPaymentId: "pay_P1" });
    expect(repo.events).toEqual([{ merchantId: "m1", sessionId: "order_T1", type: "payment_verified", cartPaise: 260000, offerId: "m1_O1" }]);
  });
  it("bad signature -> 200 verified false, row failed, no event", async () => {
    const { post, repo } = await ordered();
    const res = await post("/verify", await body("0".repeat(64)));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ verified: false });
    expect(repo.payments[0]!.status).toBe("failed");
    expect(repo.events).toHaveLength(0);
  });
  it("malformed signature -> verified false, not 400", async () => {
    const { post } = await ordered();
    const res = await post("/verify", await body("zz"));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ verified: false });
  });
  it("duplicate verify is idempotent: still true, one event", async () => {
    const { post, repo } = await ordered();
    await post("/verify", await body());
    const again = await post("/verify", await body());
    expect(await again.json()).toEqual({ verified: true });
    expect(repo.events).toHaveLength(1);
  });
  it("a bad signature never downgrades a verified payment", async () => {
    const { post, repo } = await ordered();
    await post("/verify", await body());
    const res = await post("/verify", await body("0".repeat(64)));
    expect(await res.json()).toEqual({ verified: false });
    expect(repo.payments[0]!.status).toBe("verified");
  });
  it("a different payment id on an already verified order is not verified", async () => {
    const { post, repo } = await ordered();
    await post("/verify", await body());
    const res = await post("/verify", await body(undefined, "pay_OTHER"));
    expect(await res.json()).toEqual({ verified: false });
    expect(repo.payments[0]!.razorpayPaymentId).toBe("pay_P1");
  });
  it("failed order can still be verified by a later good signature", async () => {
    const { post, repo } = await ordered();
    await post("/verify", await body("0".repeat(64)));
    const res = await post("/verify", await body());
    expect(await res.json()).toEqual({ verified: true });
    expect(repo.payments[0]!.status).toBe("verified");
  });
  it("unknown order -> 404; bad ids -> 400", async () => {
    const { post } = setup();
    expect((await post("/verify", await body())).status).toBe(404);
    expect((await post("/verify", { razorpay_order_id: "x", razorpay_payment_id: "y", razorpay_signature: "z" })).status).toBe(400);
  });
});
