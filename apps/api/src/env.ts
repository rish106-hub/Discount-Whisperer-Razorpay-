/** FROZEN after checkpoint 1 (owner T0). Worker bindings and shared route dependencies. */
import type { Repo } from "@dw/contracts";

export interface Env {
  /** KV namespace holding ladder:{merchantId}. */
  LADDERS: KVNamespace;
  SUPABASE_URL: string;
  /** Server only. Never sent to the widget or demo page. */
  SUPABASE_SERVICE_ROLE_KEY: string;
  /** Must start with rzp_test_. */
  RAZORPAY_KEY_ID: string;
  RAZORPAY_KEY_SECRET: string;
  ADMIN_TOKEN: string;
  REBUILD_HOOK_SECRET: string;
  /** Drills only: delay the ladder route by this many ms. */
  DEBUG_SLOW_LADDER_MS?: string;
  /** Drills only: make the next rebuild throw once. */
  DEBUG_FAIL_REBUILD?: string;
}

/**
 * Injected into every route module so tests can swap Supabase for an in-memory Repo and freeze time.
 * Production wiring lives in index.ts.
 */
export interface Deps {
  repo: (env: Env) => Repo;
  now: () => number;
}

/** Per-request fields a handler sets so the request logger can include them. */
export interface AppVariables {
  merchantId: string;
  ladderVersion: string;
  razorpayOrderId: string;
}

export type AppEnv = { Bindings: Env; Variables: Partial<AppVariables> };
