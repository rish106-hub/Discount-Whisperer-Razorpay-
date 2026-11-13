/** Owner: T2. One JSON line per request. Never logs keys, signatures, tokens or bodies. */
import type { MiddlewareHandler } from "hono";
import type { AppEnv } from "./env";

export function requestLogger(): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    const t0 = Date.now();
    try {
      await next();
    } finally {
      const line: Record<string, unknown> = {
        ts: t0,
        route: c.req.routePath,
        method: c.req.method,
        merchantId: c.get("merchantId"),
        status: c.res.status,
        ms: Date.now() - t0,
      };
      const v = c.get("ladderVersion");
      if (v) line.ladderVersion = v;
      const o = c.get("razorpayOrderId");
      if (o) line.razorpayOrderId = o;
      console.log(JSON.stringify(line));
    }
  };
}
