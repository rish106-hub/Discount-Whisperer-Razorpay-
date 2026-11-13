/**
 * Route registry. FROZEN after checkpoint 1 (owner T0, guardrail G2).
 * Each route module owns everything under its prefix; no other file registers routes.
 */
import { Hono } from "hono";
import type { ErrorBody } from "@dw/contracts";
import type { AppEnv, Deps, Env } from "./env";
import { requestLogger } from "./log";
import { runReconciler } from "./reconciler";
import { createSupabaseRepo } from "./supabaseRepo";
import { adminRoutes } from "./routes/admin";
import { checkoutRoutes } from "./routes/checkout";
import { eventsRoutes } from "./routes/events";
import { healthRoutes } from "./routes/health";
import { internalRoutes } from "./routes/internal";
import { ladderRoutes } from "./routes/ladder";
import { metricsRoutes } from "./routes/metrics";
import { paymentsRoutes } from "./routes/payments";

/** Build the app with injected deps. Tests call createApp(fakeDeps).request(...). */
export function createApp(deps: Deps): Hono<AppEnv> {
  const app = new Hono<AppEnv>();
  app.use("*", requestLogger());

  app.route("/", healthRoutes(deps)); //            GET  /healthz
  app.route("/v1/ladder", ladderRoutes(deps)); //   GET  /v1/ladder/:merchantId
  app.route("/v1/admin", adminRoutes(deps)); //     /v1/admin/merchants/:merchantId/...
  app.route("/internal", internalRoutes(deps)); //  POST /internal/rebuild
  app.route("/v1/checkout", checkoutRoutes(deps)); // POST /v1/checkout/validate
  app.route("/v1/events", eventsRoutes(deps)); //   POST /v1/events
  app.route("/v1/metrics", metricsRoutes(deps)); // GET  /v1/metrics/:merchantId
  app.route("/v1/payments", paymentsRoutes(deps)); // POST /v1/payments/order, /verify (T4)

  app.notFound((c) => c.json<ErrorBody>({ error: "not_found" }, 404));
  // Last-resort handler: never leak stack traces or upstream details.
  app.onError((_err, c) => c.json<ErrorBody>({ error: "internal_error" }, 500));
  return app;
}

const deps: Deps = { repo: createSupabaseRepo, now: () => Date.now() };
const app = createApp(deps);

export default {
  fetch: app.fetch,
  // Cron safety net (*/5 * * * *): rebuild merchants whose outbox rows the trigger missed.
  scheduled(_controller, env, ctx) {
    ctx.waitUntil(runReconciler(env, deps));
  },
} satisfies ExportedHandler<Env>;
