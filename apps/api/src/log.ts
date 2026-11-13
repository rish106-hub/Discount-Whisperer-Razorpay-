/**
 * Owner: T2. T0 stub so index.ts compiles. Keep the export name and signature.
 * T2: emit one JSON line per request {ts, route, merchantId, status, ms, ladderVersion?, razorpayOrderId?}
 * reading c.get("merchantId") etc. after `await next()`. Never log secrets or signatures.
 */
import type { MiddlewareHandler } from "hono";
import type { AppEnv } from "./env";

export function requestLogger(): MiddlewareHandler<AppEnv> {
  return async (_c, next) => {
    await next();
  };
}
