/**
 * T7 integration check: every golden validate case gives the same numbers in
 * offer-core, POST /v1/checkout/validate and POST /v1/payments/order.
 * Also: every offer lookup() shows as applicable can be ordered for exactly that saving.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import golden from "@dw/contracts/golden.json";
import type { GoldenFile, ValidateResult } from "@dw/contracts";
import { RAZORPAY_MIN_AMOUNT_PAISE } from "@dw/contracts";
import { buildLadder, lookup, validateSelection } from "@dw/offer-core";
import { createApp } from "../src/index";
import { createMemoryRepo } from "../src/repo";
import type { Env } from "../src/env";
import { fakeKV } from "./helpers";

const G = golden as unknown as GoldenFile;
const allOffers = Object.values(G.sets).flatMap((s) => s.offers);
const allFillers = Object.fromEntries(Object.values(G.sets).map((s) => [s.merchantId, s.fillers]));

const env = {
  LADDERS: fakeKV(),
  SUPABASE_URL: "http://x",
  SUPABASE_SERVICE_ROLE_KEY: "x",
  RAZORPAY_KEY_ID: "rzp_test_x",
  RAZORPAY_KEY_SECRET: "x",
  ADMIN_TOKEN: "a".repeat(32),
  REBUILD_HOOK_SECRET: "h".repeat(32),
} as Env;

function appAt(nowMs: number) {
  const repo = createMemoryRepo({ offers: allOffers, fillers: allFillers, now: () => nowMs });
  const app = createApp({ repo: () => repo, now: () => nowMs });
  const post = (path: string, body: unknown) =>
    app.request(path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }, env);
  return { repo, post };
}

let orderSeq = 0;
beforeEach(() => {
  // Razorpay Orders API mock: echo the requested amount back.
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url: string, init: RequestInit) => {
      const sent = JSON.parse(String(init.body)) as { amount: number };
      return new Response(JSON.stringify({ id: `order_T7${++orderSeq}`, amount: sent.amount, currency: "INR" }), { status: 200 });
    }),
  );
});
afterEach(() => vi.unstubAllGlobals());

const validateCases = G.cases.filter((c) => c.kind === "validate");

describe("golden validate cases agree in core, validate route and order route", () => {
  for (const c of validateCases) {
    it(c.name, async () => {
      const set = G.sets[c.set]!;
      const core = validateSelection(set.offers, c.input);
      expect(core).toEqual(c.expected);

      const { post } = appAt(c.input.nowMs);
      const body = { merchantId: set.merchantId, cartPaise: c.input.cartPaise, method: c.input.method };

      if (c.input.offerId !== null) {
        const res = await post("/v1/checkout/validate", { ...body, offerId: c.input.offerId });
        expect(res.status).toBe(200);
        expect((await res.json()) as ValidateResult).toEqual(c.expected);
      }

      const order = await post("/v1/payments/order", { ...body, offerId: c.input.offerId });
      const json = (await order.json()) as Record<string, unknown>;
      if (!c.expected.valid) {
        expect(order.status).toBe(409);
        expect(json).toMatchObject({ error: "invalid_offer", detail: c.expected.reason });
      } else if (c.expected.chargePaise < RAZORPAY_MIN_AMOUNT_PAISE) {
        expect(order.status).toBe(409);
        expect(json).toMatchObject({ error: "amount_too_low" });
      } else {
        expect(order.status).toBe(200);
        // Golden offers have no razorpayOfferId, so the server applies the discount itself.
        expect(json).toMatchObject({
          mode: "server_discount",
          amountPaise: c.expected.chargePaise,
          expectedSavingPaise: c.expected.savingPaise,
          currency: "INR",
        });
      }
    });
  }
});

describe("what the widget shows as applicable can be ordered for the same saving", () => {
  const lookupCases = G.cases.filter((c) => c.kind === "lookup");
  for (const c of lookupCases) {
    it(c.name, async () => {
      const set = G.sets[c.set]!;
      const ladder = buildLadder({ merchantId: set.merchantId, offers: set.offers, fillers: set.fillers, nowMs: c.input.nowMs });
      const shown = lookup(ladder, c.input);
      const { post } = appAt(c.input.nowMs);
      for (const a of shown.applicable) {
        const res = await post("/v1/checkout/validate", {
          merchantId: set.merchantId,
          cartPaise: c.input.cartPaise,
          method: c.input.method,
          offerId: a.offerId,
        });
        const v = (await res.json()) as ValidateResult;
        expect(v.valid).toBe(true);
        expect(v.savingPaise).toBe(a.savingPaise);
      }
    });
  }
});
