/** Owner: T2. Mounted at "/v1/metrics". GET /:merchantId */
import { Hono } from "hono";
import { MERCHANT_ID_PATTERN } from "@dw/contracts";
import type { MetricsResponse } from "@dw/contracts";
import type { AppEnv, Deps } from "../env";
import { fail } from "../http";

const ratio = (n: number, d: number): number | null => (d > 0 ? n / d : null);

export function metricsRoutes(deps: Deps): Hono<AppEnv> {
  const app = new Hono<AppEnv>();

  app.get("/:merchantId", async (c) => {
    const merchantId = c.req.param("merchantId");
    if (!MERCHANT_ID_PATTERN.test(merchantId)) return fail(c, 400, "bad_request", "invalid merchantId");
    c.set("merchantId", merchantId);
    try {
      const counts = await deps.repo(c.env).metrics(merchantId);
      return c.json<MetricsResponse>({
        merchantId,
        counts,
        ratios: {
          widget_seen_rate: null, // no page_view event type exists
          nudge_click_rate: ratio(counts.nudge_click, counts.seen),
          addon_rate: ratio(counts.addon, counts.nudge_click),
          paid_rate: ratio(counts.payment_verified, counts.checkout),
        },
      });
    } catch {
      return fail(c, 500, "internal_error");
    }
  });
  return app;
}
