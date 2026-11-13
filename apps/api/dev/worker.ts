/**
 * LOCAL-ONLY dev entry (T7). Never deployed: production uses src/index.ts via wrangler.toml.
 * Same createApp and routes as production, but:
 *   - in-memory Repo instead of Supabase (plain local Postgres has no PostgREST);
 *   - Razorpay Orders API faked in-process (no network, no keys needed).
 * KV is wrangler's local simulation, so ladder build, ETag and rebuild run for real.
 * Run: pnpm --filter @dw/api dev:local
 */
import { createApp } from "../src/index";
import type { Deps, Env } from "../src/env";
import { createMemoryRepo } from "../src/repo";
import { runReconciler } from "../src/reconciler";

const realFetch = globalThis.fetch;
let seq = 0;
globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  if (url.startsWith("https://api.razorpay.com/v1/orders")) {
    const body = JSON.parse(String(init?.body ?? "{}")) as { amount: number; currency: string; receipt: string };
    seq += 1;
    return Response.json({ id: `order_DEV${Date.now()}${seq}`, entity: "order", status: "created", ...body });
  }
  return realFetch(input, init);
}) as typeof fetch;

const repo = createMemoryRepo();
const deps: Deps = { repo: () => repo, now: () => Date.now() };
const app = createApp(deps);

export default {
  fetch: app.fetch,
  scheduled(_controller, env, ctx) {
    ctx.waitUntil(runReconciler(env, deps));
  },
} satisfies ExportedHandler<Env>;
