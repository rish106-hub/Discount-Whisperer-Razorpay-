/** Owner: T2. Mounted at "/v1/events". POST / (sendBeacon text/plain, max 1 KB, CORS any origin). */
import { Hono } from "hono";
import { MAX_EVENT_BODY_BYTES } from "@dw/contracts";
import { EventRequestSchema } from "@dw/contracts/schemas";
import type { AppEnv, Deps } from "../env";
import { CORS, fail, parseBody } from "../http";

export function eventsRoutes(deps: Deps): Hono<AppEnv> {
  const app = new Hono<AppEnv>();

  app.options("/", (c) =>
    c.body(null, 204, { ...CORS, "access-control-allow-methods": "POST, OPTIONS", "access-control-allow-headers": "content-type" }),
  );

  app.post("/", async (c) => {
    c.header("access-control-allow-origin", "*");
    const declared = Number(c.req.header("content-length") ?? 0);
    if (declared > MAX_EVENT_BODY_BYTES) return fail(c, 413, "payload_too_large");
    const text = await c.req.text();
    if (new TextEncoder().encode(text).length > MAX_EVENT_BODY_BYTES) return fail(c, 413, "payload_too_large");
    const body = await parseBody(c, EventRequestSchema, text);
    if (!body.ok) return body.res;
    c.set("merchantId", body.data.merchantId);
    try {
      await deps.repo(c.env).insertEvent(body.data);
    } catch {
      return fail(c, 500, "internal_error");
    }
    return c.json({}, 202);
  });
  return app;
}
