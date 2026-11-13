/**
 * Owner: T2. T0 stub so index.ts compiles. Keep the export name and signature.
 * T2: createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
 * and implement Repo with the TABLES / RPC names from @dw/contracts.
 */
import type { Repo } from "@dw/contracts";
import type { Env } from "./env";

export function createSupabaseRepo(_env: Env): Repo {
  throw new Error("supabaseRepo not implemented");
}
