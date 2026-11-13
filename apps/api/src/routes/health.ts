/**
 * Owner: T2. Mounted by index.ts at "/" (paths below are relative to that prefix).
 * Keep the export name and signature: index.ts (frozen) depends on them.
 * Routes to implement: GET /healthz
 */
import { Hono } from "hono";
import type { AppEnv, Deps } from "../env";

export function healthRoutes(_deps: Deps): Hono<AppEnv> {
  const app = new Hono<AppEnv>();
  return app;
}
