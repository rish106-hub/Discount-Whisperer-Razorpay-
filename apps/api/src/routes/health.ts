/** Owner: T2. Mounted at "/". GET /healthz */
import { Hono } from "hono";
import type { HealthResponse } from "@dw/contracts";
import type { AppEnv, Deps } from "../env";

export function healthRoutes(_deps: Deps): Hono<AppEnv> {
  const app = new Hono<AppEnv>();
  app.get("/healthz", (c) => c.json<HealthResponse>({ ok: true, version: "0.1.0" }));
  return app;
}
