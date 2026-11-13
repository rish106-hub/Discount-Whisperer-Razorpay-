/** Owner: T2. Mounted at "/v1/ladder". GET /:merchantId -> ladder JSON from KV. */
import { Hono } from "hono";
import { LADDER_CACHE_MAX_AGE_S, MERCHANT_ID_PATTERN } from "@dw/contracts";
import type { Ladder } from "@dw/contracts";
import type { AppEnv, Deps } from "../env";
import { CORS } from "../http";
import { getLadderRaw } from "../ladderStore";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const stripEtag = (v: string) => v.trim().replace(/^W\//, "").replace(/^"|"$/g, "");

export function ladderRoutes(_deps: Deps): Hono<AppEnv> {
  const app = new Hono<AppEnv>();

  app.get("/:merchantId", async (c) => {
    const merchantId = c.req.param("merchantId");
    c.set("merchantId", merchantId);
    const slow = Number(c.env.DEBUG_SLOW_LADDER_MS);
    if (slow > 0) await sleep(slow); // drills only
    const raw = MERCHANT_ID_PATTERN.test(merchantId) ? await getLadderRaw(c.env, merchantId) : null;
    if (raw === null) {
      return c.json({ error: "unknown_merchant" }, 404, CORS);
    }
    const ladder = JSON.parse(raw) as Ladder;
    c.set("ladderVersion", ladder.version);
    const headers = {
      ...CORS,
      etag: `"${ladder.version}"`,
      "cache-control": `public, max-age=${LADDER_CACHE_MAX_AGE_S}`,
    };
    const inm = c.req.header("if-none-match");
    if (inm && inm.split(",").some((t) => t.trim() === "*" || stripEtag(t) === ladder.version)) {
      return new Response(null, { status: 304, headers });
    }
    return new Response(raw, { status: 200, headers: { ...headers, "content-type": "application/json" } });
  });

  return app;
}
