/**
 * Owner: T4. Mounted by index.ts at "/v1/payments" (paths below are relative to that prefix).
 * Keep the export name and signature: index.ts (frozen) depends on them.
 * Routes to implement: POST /order, POST /verify
 */
import { Hono } from "hono";
import type { AppEnv, Deps } from "../env";

export function paymentsRoutes(_deps: Deps): Hono<AppEnv> {
  const app = new Hono<AppEnv>();
  return app;
}
