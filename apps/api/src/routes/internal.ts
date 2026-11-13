/** Owner: T2. Mounted at "/internal". POST /rebuild (pg_net trigger, x-rebuild-secret). */
import { Hono } from "hono";
import { REBUILD_SECRET_HEADER } from "@dw/contracts";
import type { RebuildResponse } from "@dw/contracts";
import { InternalRebuildRequestSchema } from "@dw/contracts/schemas";
import type { AppEnv, Deps } from "../env";
import { safeEqual, unauthorized } from "../auth";
import { fail, parseBody } from "../http";
import { rebuild } from "../rebuild";

export function internalRoutes(deps: Deps): Hono<AppEnv> {
  const app = new Hono<AppEnv>();

  app.post("/rebuild", async (c) => {
    const given = c.req.header(REBUILD_SECRET_HEADER) ?? "";
    const expected = c.env.REBUILD_HOOK_SECRET;
    if (!given || !expected || !(await safeEqual(given, expected))) return unauthorized(c);
    const body = await parseBody(c, InternalRebuildRequestSchema);
    if (!body.ok) return body.res;
    c.set("merchantId", body.data.merchant_id);
    try {
      const version = await rebuild(c.env, deps, body.data.merchant_id);
      c.set("ladderVersion", version);
      return c.json<RebuildResponse>({ version });
    } catch {
      return fail(c, 500, "internal_error"); // outbox rows stay pending; cron retries
    }
  });
  return app;
}
