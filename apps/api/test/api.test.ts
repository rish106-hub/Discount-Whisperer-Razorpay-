import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Ladder } from "@dw/contracts";
import { runReconciler } from "../src/reconciler";
import { rebuild } from "../src/rebuild";
import { ADMIN, HOOK, setup } from "./helpers";

const newOffer = { code: "O9", kind: "pct", value: 5, startsAt: 1767225600000, endsAt: 1893456000000, fundedBy: "merchant" };

beforeEach(() => void vi.spyOn(console, "log").mockImplementation(() => {}));

describe("health", () => {
  it("ok", async () => {
    const { call } = setup();
    const r = await call("/healthz");
    expect(r.status).toBe(200);
    expect(await r.json()).toMatchObject({ ok: true });
  });
});

describe("ladder", () => {
  it("404 unknown_merchant with CORS when not in KV", async () => {
    const { call } = setup();
    const r = await call("/v1/ladder/m1");
    expect(r.status).toBe(404);
    expect(await r.json()).toEqual({ error: "unknown_merchant" });
    expect(r.headers.get("access-control-allow-origin")).toBe("*");
  });

  it("serves ladder with ETag, cache and CORS; If-None-Match gives 304", async () => {
    const { call, env, deps } = setup();
    const version = await rebuild(env, deps, "m1");
    const r = await call("/v1/ladder/m1");
    expect(r.status).toBe(200);
    expect(r.headers.get("etag")).toBe(`"${version}"`);
    expect(r.headers.get("cache-control")).toBe("public, max-age=60");
    expect(r.headers.get("access-control-allow-origin")).toBe("*");
    const body = (await r.json()) as Ladder;
    expect(body.version).toBe(version);
    const r2 = await call("/v1/ladder/m1", { headers: { "if-none-match": `"${version}"` } });
    expect(r2.status).toBe(304);
    const r3 = await call("/v1/ladder/m1", { headers: { "if-none-match": '"other"' } });
    expect(r3.status).toBe(200);
  });

  it("DEBUG_SLOW_LADDER_MS delays the response", async () => {
    const { call, env, deps } = setup({ env: { DEBUG_SLOW_LADDER_MS: "60" } });
    await rebuild(env, deps, "m1");
    const t = Date.now();
    await call("/v1/ladder/m1");
    expect(Date.now() - t).toBeGreaterThanOrEqual(55);
  });
});

describe("admin", () => {
  it("401 without or with wrong token", async () => {
    const { call } = setup();
    const url = "/v1/admin/merchants/m1/offers";
    expect((await call(url, { method: "POST", body: JSON.stringify(newOffer) })).status).toBe(401);
    const bad = await call(url, { method: "POST", headers: { authorization: "Bearer nope" }, body: JSON.stringify(newOffer) });
    expect(bad.status).toBe(401);
    expect(await bad.json()).toEqual({ error: "unauthorized" });
  });

  it("empty configured ADMIN_TOKEN never authorizes", async () => {
    const { call } = setup({ env: { ADMIN_TOKEN: "" } });
    const r = await call("/v1/admin/merchants/m1/offers", { method: "POST", headers: { authorization: "Bearer " }, body: "{}" });
    expect(r.status).toBe(401);
  });

  it("create offer -> 201, and ladder version changes after rebuild", async () => {
    const { call, admin, env, deps } = setup();
    const v1 = await rebuild(env, deps, "m1");
    const r = await call("/v1/admin/merchants/m1/offers", { method: "POST", headers: admin(), body: JSON.stringify(newOffer) });
    expect(r.status).toBe(201);
    expect(((await r.json()) as { offer: { id: string } }).offer.id).toBe("m1_O9");
    await new Promise((res) => setTimeout(res, 10)); // background rebuild (no ExecutionContext in tests)
    const lad = (await (await call("/v1/ladder/m1")).json()) as Ladder;
    expect(lad.version).not.toBe(v1);
    expect(lad.offers.map((o) => o.id)).toContain("m1_O9");
  });

  it("400 validation_failed on bad body, 400 on non-JSON", async () => {
    const { call, admin } = setup();
    const url = "/v1/admin/merchants/m1/offers";
    const r = await call(url, { method: "POST", headers: admin(), body: JSON.stringify({ ...newOffer, value: 500 }) });
    expect(r.status).toBe(400);
    expect(((await r.json()) as { error: string }).error).toBe("validation_failed");
    const r2 = await call(url, { method: "POST", headers: admin(), body: "not json" });
    expect(r2.status).toBe(400);
    expect(((await r2.json()) as { error: string }).error).toBe("bad_request");
  });

  it("PATCH merges then re-validates", async () => {
    const { call, admin } = setup();
    const ok = await call("/v1/admin/merchants/m1/offers/m1_O1", { method: "PATCH", headers: admin(), body: JSON.stringify({ value: 12 }) });
    expect(ok.status).toBe(200);
    expect(((await ok.json()) as { offer: { value: number; minOrderPaise: number } }).offer).toMatchObject({ value: 12, minOrderPaise: 199900 });
    // endsAt before startsAt must be rejected by the merged re-validation.
    const bad = await call("/v1/admin/merchants/m1/offers/m1_O1", { method: "PATCH", headers: admin(), body: JSON.stringify({ endsAt: 1 }) });
    expect(bad.status).toBe(400);
    const missing = await call("/v1/admin/merchants/m1/offers/m1_ZZ", { method: "PATCH", headers: admin(), body: JSON.stringify({ value: 1 }) });
    expect(missing.status).toBe(404);
  });

  it("DELETE soft-deletes; unknown offer 404", async () => {
    const { call, admin, repo } = setup();
    const r = await call("/v1/admin/merchants/m1/offers/m1_O3", { method: "DELETE", headers: admin() });
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({});
    expect(repo.state.offers.get("m1_O3")?.active).toBe(false);
    expect((await call("/v1/admin/merchants/m1/offers/nope", { method: "DELETE", headers: admin() })).status).toBe(404);
    // Another merchant cannot delete m1's offer.
    expect((await call("/v1/admin/merchants/m2/offers/m1_O1", { method: "DELETE", headers: admin() })).status).toBe(404);
  });

  it("PUT fillers: count, max 20, unique skus", async () => {
    const { call, admin } = setup();
    const url = "/v1/admin/merchants/m1/fillers";
    const f = (i: number) => ({ sku: `s${i}`, name: `N${i}`, pricePaise: 1000 + i });
    const ok = await call(url, { method: "PUT", headers: admin(), body: JSON.stringify([f(1), f(2)]) });
    expect(await ok.json()).toEqual({ count: 2 });
    const many = await call(url, { method: "PUT", headers: admin(), body: JSON.stringify(Array.from({ length: 21 }, (_, i) => f(i))) });
    expect(many.status).toBe(400);
    const dup = await call(url, { method: "PUT", headers: admin(), body: JSON.stringify([f(1), f(1)]) });
    expect(dup.status).toBe(400);
  });

  it("forced rebuild returns version and writes KV", async () => {
    const { call, admin, kv } = setup();
    const r = await call("/v1/admin/merchants/m1/rebuild", { method: "POST", headers: admin() });
    expect(r.status).toBe(200);
    expect(kv.store.has("ladder:m1")).toBe(true);
  });
});

describe("internal rebuild", () => {
  it("401 wrong or missing secret", async () => {
    const { call } = setup();
    const body = JSON.stringify({ merchant_id: "m1" });
    expect((await call("/internal/rebuild", { method: "POST", body })).status).toBe(401);
    expect((await call("/internal/rebuild", { method: "POST", headers: { "x-rebuild-secret": "wrong" }, body })).status).toBe(401);
  });

  it("rebuilds and marks outbox processed", async () => {
    const { call, repo, kv } = setup();
    await repo.setFillers("m1", [{ sku: "a", name: "A", pricePaise: 100 }]); // creates an outbox row
    expect(await repo.pendingOutboxMaxId("m1")).not.toBeNull();
    const r = await call("/internal/rebuild", { method: "POST", headers: { "x-rebuild-secret": HOOK }, body: JSON.stringify({ merchant_id: "m1" }) });
    expect(r.status).toBe(200);
    expect(kv.store.has("ladder:m1")).toBe(true);
    expect(await repo.pendingOutboxMaxId("m1")).toBeNull();
  });

  it("an edit landing mid-rebuild stays pending (protocol)", async () => {
    const { env, deps, repo } = setup();
    await repo.setFillers("m1", []);
    const real = repo.getFillers.bind(repo);
    repo.getFillers = async (m) => {
      await repo.setFillers(m, []); // concurrent edit after maxId was read
      return real(m);
    };
    await rebuild(env, deps, "m1");
    expect(await repo.pendingOutboxMaxId("m1")).not.toBeNull();
  });

  it("400 on bad merchant_id", async () => {
    const { call } = setup();
    const r = await call("/internal/rebuild", { method: "POST", headers: { "x-rebuild-secret": HOOK }, body: JSON.stringify({ merchant_id: "BAD ID" }) });
    expect(r.status).toBe(400);
  });

  it("DEBUG_FAIL_REBUILD fails once then recovers", async () => {
    const { call } = setup({ env: { DEBUG_FAIL_REBUILD: "1" } });
    const req = () => call("/internal/rebuild", { method: "POST", headers: { "x-rebuild-secret": HOOK }, body: JSON.stringify({ merchant_id: "m1" }) });
    expect((await req()).status).toBe(500);
    expect((await req()).status).toBe(200);
  });
});

describe("reconciler", () => {
  it("processes pending outbox rows", async () => {
    const { env, deps, repo, kv } = setup();
    await repo.setFillers("m1", []);
    await repo.setFillers("m2", []);
    await runReconciler(env, deps);
    expect(kv.store.has("ladder:m1")).toBe(true);
    expect(kv.store.has("ladder:m2")).toBe(true);
    expect(await repo.pendingOutboxMerchants(50)).toEqual([]);
  });

  it("one failing merchant does not stop the rest", async () => {
    const { env, deps, repo, kv } = setup();
    await repo.setFillers("m1", []);
    await repo.setFillers("m2", []);
    const orig = repo.getActiveOffers.bind(repo);
    repo.getActiveOffers = async (m) => { if (m === "m1") throw new Error("boom"); return orig(m); };
    await runReconciler(env, deps);
    expect(kv.store.has("ladder:m2")).toBe(true);
    expect(await repo.pendingOutboxMaxId("m1")).not.toBeNull();
  });
});

describe("checkout validate", () => {
  const post = (call: ReturnType<typeof setup>["call"], b: unknown) =>
    call("/v1/checkout/validate", { method: "POST", body: JSON.stringify(b) });

  it("golden: m1 260000 HDFC_CC O2 -> valid 25000 / 235000", async () => {
    const { call } = setup();
    const r = await post(call, { merchantId: "m1", cartPaise: 260000, method: "HDFC_CC", offerId: "m1_O2" });
    expect(await r.json()).toEqual({ valid: true, reason: "ok", savingPaise: 25000, chargePaise: 235000 });
  });

  it("below_min", async () => {
    const { call } = setup();
    const r = await post(call, { merchantId: "m1", cartPaise: 180000, method: null, offerId: "m1_O1" });
    expect(await r.json()).toMatchObject({ valid: false, reason: "below_min", savingPaise: 0, chargePaise: 180000 });
  });

  it("reads the repo, never KV: stale KV ladder does not matter", async () => {
    const { call, env, deps, repo, kv } = setup();
    await rebuild(env, deps, "m1");
    const stale = kv.store.get("ladder:m1");
    await repo.deactivateOffer("m1", "m1_O1"); // KV still lists O1
    expect(kv.store.get("ladder:m1")).toBe(stale);
    const r = await post(call, { merchantId: "m1", cartPaise: 300000, method: null, offerId: "m1_O1" });
    expect(await r.json()).toMatchObject({ valid: false, reason: "inactive" });
  });

  it("unknown offer, bad body", async () => {
    const { call } = setup();
    expect(await (await post(call, { merchantId: "m1", cartPaise: 1, method: null, offerId: "m1_NOPE" })).json()).toMatchObject({ reason: "unknown_offer" });
    expect((await post(call, { merchantId: "m1", cartPaise: 1.5, method: null, offerId: "m1_O1" })).status).toBe(400);
    expect((await post(call, { merchantId: "m1", cartPaise: -1, method: null, offerId: "m1_O1" })).status).toBe(400);
  });

  it("500 internal_error when repo throws, no detail leaked", async () => {
    const { call, repo } = setup();
    repo.getAllOffers = async () => { throw new Error("secret-db-detail"); };
    const r = await post(call, { merchantId: "m1", cartPaise: 1, method: null, offerId: "m1_O1" });
    expect(r.status).toBe(500);
    expect(await r.text()).not.toContain("secret-db-detail");
  });
});

describe("events", () => {
  const ev = { merchantId: "m1", sessionId: "sess-12345678", type: "seen", cartPaise: 180000 };

  it("accepts text/plain JSON (sendBeacon), 202, CORS", async () => {
    const { call, repo } = setup();
    const r = await call("/v1/events", { method: "POST", headers: { "content-type": "text/plain;charset=UTF-8" }, body: JSON.stringify(ev) });
    expect(r.status).toBe(202);
    expect(r.headers.get("access-control-allow-origin")).toBe("*");
    expect(repo.state.events).toHaveLength(1);
  });

  it("413 over 1 KB, 400 bad type", async () => {
    const { call } = setup();
    const big = await call("/v1/events", { method: "POST", body: JSON.stringify({ ...ev, offerId: "x".repeat(1100) }) });
    expect(big.status).toBe(413);
    const bad = await call("/v1/events", { method: "POST", body: JSON.stringify({ ...ev, type: "nope" }) });
    expect(bad.status).toBe(400);
  });

  it("OPTIONS preflight", async () => {
    const { call } = setup();
    const r = await call("/v1/events", { method: "OPTIONS" });
    expect(r.status).toBe(204);
    expect(r.headers.get("access-control-allow-origin")).toBe("*");
  });
});

describe("metrics", () => {
  it("counts and ratios, null when denominator 0", async () => {
    const { call, repo } = setup();
    const empty = (await (await call("/v1/metrics/m1")).json()) as { ratios: Record<string, unknown> };
    expect(empty.ratios).toEqual({ widget_seen_rate: null, nudge_click_rate: null, addon_rate: null, paid_rate: null });
    for (const type of ["seen", "seen", "seen", "seen", "nudge_click", "nudge_click", "addon", "checkout"] as const)
      await repo.insertEvent({ merchantId: "m1", sessionId: "sess-12345678", type, cartPaise: 1 });
    const r = (await (await call("/v1/metrics/m1")).json()) as { counts: Record<string, number>; ratios: Record<string, number | null> };
    expect(r.counts).toMatchObject({ seen: 4, nudge_click: 2, addon: 1, checkout: 1, payment_verified: 0 });
    expect(r.ratios).toEqual({ widget_seen_rate: null, nudge_click_rate: 0.5, addon_rate: 0.5, paid_rate: 0 });
  });
});

describe("logging", () => {
  it("one JSON line per request, no secrets", async () => {
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    const { call } = setup();
    await call("/v1/admin/merchants/m1/rebuild", { method: "POST", headers: { authorization: `Bearer ${ADMIN}` } });
    const lines = spy.mock.calls.map((a) => String(a[0]));
    const line = JSON.parse(lines[lines.length - 1]!);
    expect(line).toMatchObject({ route: "/v1/admin/merchants/:merchantId/rebuild", merchantId: "m1", status: 200 });
    expect(line.ladderVersion).toBeTypeOf("string");
    expect(lines.join("\n")).not.toContain(ADMIN);
  });
});

describe("misc", () => {
  it("unknown route -> not_found JSON", async () => {
    const { call } = setup();
    const r = await call("/nope");
    expect(r.status).toBe(404);
    expect(await r.json()).toEqual({ error: "not_found" });
  });
});
