/**
 * Money-review #1 regression (human decision "Razorpay-only").
 * A discount that needs a payment method is only usable when Razorpay can enforce the method.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import golden from "@dw/contracts/golden.json";
import type { GoldenFile, Ladder, Offer } from "@dw/contracts";
import { createApp } from "../src/index";
import { createMemoryRepo } from "../src/repo";
import type { Env } from "../src/env";
import { fakeKV } from "./helpers";

const G = golden as unknown as GoldenFile;
const NOW = Date.UTC(2026, 5, 1);
const ADMIN = "a".repeat(32);

function setup(mapO2: boolean) {
  const offers: Offer[] = G.sets.m1!.offers.map((o) =>
    o.id === "m1_O2" && mapO2 ? { ...o, razorpayOfferId: "offer_TESTHDFC" } : o,
  );
  const repo = createMemoryRepo({ offers, fillers: { m1: G.sets.m1!.fillers }, now: () => NOW });
  const kv = fakeKV();
  const env = {
    LADDERS: kv, SUPABASE_URL: "http://x", SUPABASE_SERVICE_ROLE_KEY: "x", RAZORPAY_KEY_ID: "rzp_test_x",
    RAZORPAY_KEY_SECRET: "x", ADMIN_TOKEN: ADMIN, REBUILD_HOOK_SECRET: "h".repeat(32),
  } as Env;
  const app = createApp({ repo: () => repo, now: () => NOW });
  const post = (path: string, body: unknown, headers: Record<string, string> = {}) =>
    app.request(path, { method: "POST", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify(body) }, env);
  const ladder = async () => {
    await post("/v1/admin/merchants/m1/rebuild", {}, { authorization: `Bearer ${ADMIN}` });
    return JSON.parse(kv.store.get("ladder:m1")!) as Ladder;
  };
  return { post, ladder };
}

let sent: Array<Record<string, unknown>> = [];
beforeEach(() => {
  sent = [];
  vi.stubGlobal("fetch", vi.fn(async (_u: string, init: RequestInit) => {
    const body = JSON.parse(String(init.body)) as Record<string, unknown>;
    sent.push(body);
    return new Response(JSON.stringify({ id: "order_RV1", amount: body.amount, currency: "INR" }), { status: 200 });
  }));
});
afterEach(() => vi.unstubAllGlobals());

const O2_ORDER = { merchantId: "m1", cartPaise: 260000, method: "HDFC_CC", offerId: "m1_O2" };

describe("unmapped method-bound offer", () => {
  it("order is refused, nothing is sent to Razorpay", async () => {
    const { post } = setup(false);
    const res = await post("/v1/payments/order", O2_ORDER);
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: "invalid_offer", detail: "method_needs_razorpay_offer" });
    expect(sent).toEqual([]);
  });

  it("is left out of the ladder, so the widget never shows it", async () => {
    const { ladder } = setup(false);
    const ids = (await ladder()).offers.map((o) => o.id);
    expect(ids).toEqual(["m1_O3", "m1_O1"]); // O3: UPI cashback stays (never lowers the charge)
  });

  it("method-free offer still works in server_discount mode", async () => {
    const { post } = setup(false);
    const res = await post("/v1/payments/order", { ...O2_ORDER, offerId: "m1_O1" });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ mode: "server_discount", amountPaise: 234000, expectedSavingPaise: 26000 });
  });
});

describe("mapped method-bound offer", () => {
  it("goes through Razorpay: full cart amount plus offers=[id]; Razorpay enforces HDFC_CC", async () => {
    const { post } = setup(true);
    const res = await post("/v1/payments/order", O2_ORDER);
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ mode: "razorpay_offer", amountPaise: 260000, expectedSavingPaise: 25000 });
    expect(sent[0]).toMatchObject({ amount: 260000, offers: ["offer_TESTHDFC"] });
  });

  it("is in the ladder without leaking the Razorpay offer id", async () => {
    const { ladder } = setup(true);
    const l = await ladder();
    expect(l.offers.map((o) => o.id)).toContain("m1_O2");
    expect(JSON.stringify(l)).not.toContain("offer_TESTHDFC");
  });
});
