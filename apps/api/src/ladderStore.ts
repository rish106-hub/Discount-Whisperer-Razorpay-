/** Owner: T2. KV access for ladders. */
import { ladderKey, type Ladder } from "@dw/contracts";
import type { Env } from "./env";

export async function getLadderRaw(env: Env, merchantId: string): Promise<string | null> {
  return env.LADDERS.get(ladderKey(merchantId), "text");
}

export async function getLadder(env: Env, merchantId: string): Promise<Ladder | null> {
  const raw = await getLadderRaw(env, merchantId);
  return raw === null ? null : (JSON.parse(raw) as Ladder);
}

export async function putLadder(env: Env, ladder: Ladder): Promise<void> {
  await env.LADDERS.put(ladderKey(ladder.merchantId), JSON.stringify(ladder));
}
