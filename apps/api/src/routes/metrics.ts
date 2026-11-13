/**
 * Owner: T2. Mounted by index.ts at "/v1/metrics" (paths below are relative to that prefix).
 * Keep the export name and signature: index.ts (frozen) depends on them.
 * Routes to implement: GET /:merchantId
 */
import { Hono } from "hono";
import type { AppEnv, Deps } from "../env";

export function metricsRoutes(_deps: Deps): Hono<AppEnv> {
  const app = new Hono<AppEnv>();
  return app;
}
