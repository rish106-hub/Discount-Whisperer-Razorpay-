/** Owner: T2. Mounted at "/v1/admin". Bearer ADMIN_TOKEN. Every write also kicks a rebuild (local dev has no trigger). */
import { Hono } from "hono";
import { MAX_FILLERS, MERCHANT_ID_PATTERN } from "@dw/contracts";
import type { Offer, OfferResponse, PutFillersResponse, RebuildResponse, OfferUpsert } from "@dw/contracts";
import { NewOfferSchema, OfferPatchSchema, PutFillersSchema } from "@dw/contracts/schemas";
import type { Context } from "hono";
import type { AppEnv, Deps } from "../env";
import { requireAdmin } from "../auth";
import { background, fail, parseBody } from "../http";
import { rebuild } from "../rebuild";

export function adminRoutes(deps: Deps): Hono<AppEnv> {
  const app = new Hono<AppEnv>();
  app.use("*", requireAdmin());

  const merchantOf = (c: Context<AppEnv>): string | null => {
    const id = c.req.param("merchantId") ?? "";
    if (!MERCHANT_ID_PATTERN.test(id)) return null;
    c.set("merchantId", id);
    return id;
  };
  const kick = (c: Context<AppEnv>, merchantId: string) => background(c, rebuild(c.env, deps, merchantId));

  app.post("/merchants/:merchantId/offers", async (c) => {
    const merchantId = merchantOf(c);
    if (!merchantId) return fail(c, 400, "bad_request", "invalid merchantId");
    const body = await parseBody(c, NewOfferSchema);
    if (!body.ok) return body.res;
    const upsert: OfferUpsert = { ...body.data, id: `${merchantId}_${body.data.code}`, merchantId };
    try {
      const offer = await deps.repo(c.env).upsertOffer(upsert);
      kick(c, merchantId);
      return c.json<OfferResponse>({ offer }, 201);
    } catch {
      return fail(c, 500, "internal_error");
    }
  });

  app.patch("/merchants/:merchantId/offers/:offerId", async (c) => {
    const merchantId = merchantOf(c);
    if (!merchantId) return fail(c, 400, "bad_request", "invalid merchantId");
    const body = await parseBody(c, OfferPatchSchema);
    if (!body.ok) return body.res;
    try {
      const repo = deps.repo(c.env);
      const existing = (await repo.getAllOffers(merchantId)).find((o) => o.id === c.req.param("offerId"));
      if (!existing) return fail(c, 404, "unknown_offer");
      const { id: _id, merchantId: _m, updatedAt: _u, ...fields } = existing;
      // Merge then re-validate the whole offer so cross-field rules still hold.
      const merged = NewOfferSchema.safeParse({ ...fields, ...body.data });
      if (!merged.success) {
        const detail = merged.error.issues.slice(0, 5).map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
        return fail(c, 400, "validation_failed", detail);
      }
      const offer: Offer = await repo.upsertOffer({ ...merged.data, id: existing.id, merchantId });
      kick(c, merchantId);
      return c.json<OfferResponse>({ offer });
    } catch {
      return fail(c, 500, "internal_error");
    }
  });

  app.delete("/merchants/:merchantId/offers/:offerId", async (c) => {
    const merchantId = merchantOf(c);
    if (!merchantId) return fail(c, 400, "bad_request", "invalid merchantId");
    try {
      const found = await deps.repo(c.env).deactivateOffer(merchantId, c.req.param("offerId"));
      if (!found) return fail(c, 404, "unknown_offer");
      kick(c, merchantId);
      return c.json({}, 200);
    } catch {
      return fail(c, 500, "internal_error");
    }
  });

  app.put("/merchants/:merchantId/fillers", async (c) => {
    const merchantId = merchantOf(c);
    if (!merchantId) return fail(c, 400, "bad_request", "invalid merchantId");
    const body = await parseBody(c, PutFillersSchema);
    if (!body.ok) return body.res;
    if (body.data.length > MAX_FILLERS) return fail(c, 400, "validation_failed", "too many fillers");
    try {
      const count = await deps.repo(c.env).setFillers(merchantId, body.data);
      kick(c, merchantId);
      return c.json<PutFillersResponse>({ count });
    } catch {
      return fail(c, 500, "internal_error");
    }
  });

  app.post("/merchants/:merchantId/rebuild", async (c) => {
    const merchantId = merchantOf(c);
    if (!merchantId) return fail(c, 400, "bad_request", "invalid merchantId");
    try {
      const version = await rebuild(c.env, deps, merchantId);
      c.set("ladderVersion", version);
      return c.json<RebuildResponse>({ version });
    } catch {
      return fail(c, 500, "internal_error");
    }
  });
  return app;
}
