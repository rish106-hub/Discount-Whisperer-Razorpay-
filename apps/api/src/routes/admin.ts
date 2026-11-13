/**
 * Owner: T2. Mounted by index.ts at "/v1/admin" (paths below are relative to that prefix).
 * Keep the export name and signature: index.ts (frozen) depends on them.
 * Routes to implement: POST /merchants/:merchantId/offers, PATCH|DELETE /merchants/:merchantId/offers/:offerId, PUT /merchants/:merchantId/fillers, POST /merchants/:merchantId/rebuild
 */
import { Hono } from "hono";
import type { AppEnv, Deps } from "../env";

export function adminRoutes(_deps: Deps): Hono<AppEnv> {
  const app = new Hono<AppEnv>();
  return app;
}
