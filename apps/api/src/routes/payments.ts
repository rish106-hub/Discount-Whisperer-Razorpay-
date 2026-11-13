/**
 * Owner: T4. Mounted by index.ts at "/v1/payments".
 * POST /order  : re-validate the offer server-side, create a Razorpay test order, record it.
 * POST /verify : constant-time HMAC check, mark verified or failed, idempotent.
 */
import { Hono } from "hono";
import type { Context } from "hono";
import { validateSelection } from "@dw/offer-core";
import { RAZORPAY_MIN_AMOUNT_PAISE, RAZORPAY_RECEIPT_MAX } from "@dw/contracts";
import type { ErrorBody, ErrorCode, PaymentOrderResponse, PaymentVerifyResponse } from "@dw/contracts";
import { PaymentOrderRequestSchema, PaymentVerifyRequestSchema } from "@dw/contracts/schemas";
import type { AppEnv, Deps } from "../env";
import { assertTestKeys, createOrder, RazorpayError } from "../razorpay/client";
import { planOrder } from "../razorpay/modes";
import { verifySignature } from "../razorpay/signature";

type Ctx = Context<AppEnv>;

const fail = (c: Ctx, status: 400 | 404 | 409 | 500 | 502, error: ErrorCode, detail?: string) =>
  c.json<ErrorBody>(detail ? { error, detail } : { error }, status);

/** Body parse that ignores Content-Type and never throws. */
async function readJson(c: Ctx): Promise<unknown> {
  try {
    return JSON.parse(await c.req.text());
  } catch {
    return undefined;
  }
}

export function paymentsRoutes(deps: Deps): Hono<AppEnv> {
  const app = new Hono<AppEnv>();

  app.post("/order", async (c) => {
    const parsed = PaymentOrderRequestSchema.safeParse(await readJson(c));
    if (!parsed.success) return fail(c, 400, "validation_failed");
    const { merchantId, cartPaise, method, offerId } = parsed.data;
    c.set("merchantId", merchantId);

    try {
      assertTestKeys(c.env);
    } catch {
      return fail(c, 500, "internal_error", "payments_not_configured");
    }

    const repo = deps.repo(c.env);
    const now = deps.now();
    const offers = await repo.getAllOffers(merchantId); // never KV: checkout always re-reads the source of truth
    const validation = validateSelection(offers, { cartPaise, method, offerId, nowMs: now });
    if (!validation.valid) return fail(c, 409, "invalid_offer", validation.reason);
    // Compare the amount the shopper pays after discount, in both modes.
    if (validation.chargePaise < RAZORPAY_MIN_AMOUNT_PAISE) return fail(c, 409, "amount_too_low");

    const offer = offerId === null ? null : (offers.find((o) => o.id === offerId) ?? null);
    const plan = planOrder(offer, validation, cartPaise);

    let order;
    try {
      order = await createOrder(
        c.env,
        {
          amount: plan.amountPaise,
          currency: "INR",
          receipt: `dw_${merchantId}_${now}`.slice(0, RAZORPAY_RECEIPT_MAX),
          notes: { merchantId, offerId: offerId ?? "" },
          ...(plan.offers ? { offers: plan.offers } : {}),
        },
      );
    } catch (err) {
      const kind = err instanceof RazorpayError ? err.kind : "unknown";
      console.error(JSON.stringify({ route: "payments/order", merchantId, error: "razorpay_failed", kind }));
      return fail(c, 502, "upstream_error");
    }
    c.set("razorpayOrderId", order.id);

    await repo.insertPayment({
      merchantId,
      offerId,
      razorpayOrderId: order.id,
      amountPaise: plan.amountPaise,
      cartPaise,
      expectedSavingPaise: validation.savingPaise,
      mode: plan.mode,
    });

    return c.json<PaymentOrderResponse>({
      keyId: c.env.RAZORPAY_KEY_ID,
      orderId: order.id,
      amountPaise: plan.amountPaise,
      currency: "INR",
      expectedSavingPaise: validation.savingPaise,
      mode: plan.mode,
    });
  });

  app.post("/verify", async (c) => {
    const parsed = PaymentVerifyRequestSchema.safeParse(await readJson(c));
    if (!parsed.success) return fail(c, 400, "validation_failed");
    const { razorpay_order_id: orderId, razorpay_payment_id: paymentId, razorpay_signature: signature } = parsed.data;
    c.set("razorpayOrderId", orderId);

    if (!c.env.RAZORPAY_KEY_SECRET) return fail(c, 500, "internal_error", "payments_not_configured");

    const repo = deps.repo(c.env);
    const payment = await repo.getPaymentByOrderId(orderId);
    if (!payment) return fail(c, 404, "not_found");
    c.set("merchantId", payment.merchantId);

    const ok = await verifySignature(c.env.RAZORPAY_KEY_SECRET, orderId, paymentId, signature);

    if (payment.status === "verified") {
      // Idempotent: same payment again is still verified; never downgrade a verified order.
      return c.json<PaymentVerifyResponse>({ verified: ok && payment.razorpayPaymentId === paymentId });
    }
    if (!ok) {
      // A failed row can still become verified later by a good signature.
      await repo.updatePaymentByOrderId(orderId, { status: "failed" });
      return c.json<PaymentVerifyResponse>({ verified: false });
    }

    await repo.updatePaymentByOrderId(orderId, { status: "verified", razorpayPaymentId: paymentId });
    try {
      await repo.insertEvent({
        merchantId: payment.merchantId,
        sessionId: orderId,
        type: "payment_verified",
        cartPaise: payment.cartPaise,
        offerId: payment.offerId,
      });
    } catch {
      // Analytics must not fail a verified payment.
      console.error(JSON.stringify({ route: "payments/verify", error: "event_insert_failed", razorpayOrderId: orderId }));
    }
    return c.json<PaymentVerifyResponse>({ verified: true });
  });

  return app;
}
