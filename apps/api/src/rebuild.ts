/** Owner: T2. Rebuild one merchant's ladder following the Repo rebuild protocol. */
import { buildLadder } from "@dw/offer-core";
import type { Deps, Env } from "./env";
import { getLadder, putLadder } from "./ladderStore";

let failedOnce = false; // per isolate

export async function rebuild(env: Env, deps: Deps, merchantId: string): Promise<string> {
  if (env.DEBUG_FAIL_REBUILD && !failedOnce) {
    failedOnce = true; // drills only: fail the first rebuild, then recover
    throw new Error("debug_fail_rebuild");
  }
  const repo = deps.repo(env);
  const maxId = await repo.pendingOutboxMaxId(merchantId); // BEFORE reading offers
  const [offers, fillers] = await Promise.all([repo.getActiveOffers(merchantId), repo.getFillers(merchantId)]);
  // Preserve a kill switch set directly in KV (drill); nothing in the DB stores it yet.
  const prev = await getLadder(env, merchantId);
  const ladder = buildLadder({ merchantId, offers, fillers, nowMs: deps.now(), disabled: prev?.disabled ?? false });
  await putLadder(env, ladder);
  if (maxId !== null) await repo.markOutboxProcessed(merchantId, maxId);
  return ladder.version;
}
