import golden from "@dw/contracts/golden.json";
import type { Offer } from "@dw/contracts";
import { createApp } from "../src/index";
import { createMemoryRepo, type MemoryRepo } from "../src/repo";
import type { Env } from "../src/env";

export const NOW = Date.UTC(2026, 5, 1); // golden "now"
export const ADMIN = "admin-token-for-tests-0123456789abcdef";
export const HOOK = "hook-secret-for-tests-0123456789abcdef";

/** Minimal in-memory KV (get/put only: all the Worker uses). */
export function fakeKV(): KVNamespace & { store: Map<string, string> } {
  const store = new Map<string, string>();
  return {
    store,
    get: async (k: string) => store.get(k) ?? null,
    put: async (k: string, v: string) => void store.set(k, v),
  } as unknown as KVNamespace & { store: Map<string, string> };
}

export function setup(opts: { seed?: boolean; env?: Partial<Env> } = {}) {
  const m1 = (golden as unknown as { sets: { m1: { offers: Offer[]; fillers: unknown[] } } }).sets.m1;
  const repo: MemoryRepo = createMemoryRepo({
    offers: opts.seed === false ? [] : m1.offers,
    fillers: opts.seed === false ? {} : { m1: m1.fillers as never },
    now: () => NOW,
  });
  const kv = fakeKV();
  const env = {
    LADDERS: kv, SUPABASE_URL: "http://x", SUPABASE_SERVICE_ROLE_KEY: "x", RAZORPAY_KEY_ID: "rzp_test_x",
    RAZORPAY_KEY_SECRET: "x", ADMIN_TOKEN: ADMIN, REBUILD_HOOK_SECRET: HOOK, ...opts.env,
  } as Env;
  const deps = { repo: () => repo, now: () => NOW };
  const app = createApp(deps);
  const call = (path: string, init?: RequestInit) => app.request(path, init, env);
  const admin = (extra: Record<string, string> = {}) => ({ authorization: `Bearer ${ADMIN}`, "content-type": "application/json", ...extra });
  return { app, repo, kv, env, deps, call, admin };
}
