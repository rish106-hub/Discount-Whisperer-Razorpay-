/** Owner: T2. Mounted at "/v1/checkout". POST /validate. Always reads Supabase, never KV. */
import { Hono } from "hono";
import { validateSelection } from "@dw/offer-core";
import type { CheckoutValidateResponse } from "@dw/contracts";
import { CheckoutValidateRequestSchema } from "@dw/contracts/schemas";
import type { AppEnv, Deps } from "../env";
import { fail, parseBody } from "../http";

export function checkoutRoutes(deps: Deps): Hono<AppEnv> {
  const app = new Hono<AppEnv>();

  app.post("/validate", async (c) => {
    const body = await parseBody(c, CheckoutValidateRequestSchema);
    if (!body.ok) return body.res;
    const { merchantId, cartPaise, method, offerId } = body.data;
    c.set("merchantId", merchantId);
    try {
      const offers = await deps.repo(c.env).getAllOffers(merchantId);
      return c.json<CheckoutValidateResponse>(validateSelection(offers, { cartPaise, method, offerId, nowMs: deps.now() }));
    } catch {
      return fail(c, 500, "internal_error");
    }
  });
  return app;
}
