// Smoke test against the hosted project. Zero deps (fetch -> PostgREST), Node 18+.
// Env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (required); SUPABASE_ANON_KEY (optional, RLS check).
// Uses merchant id "smoke_t3" and cleans up after itself. Never prints keys.
const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY: SRK, SUPABASE_ANON_KEY: ANON } = process.env;
if (!SUPABASE_URL || !SRK) { console.error("need SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY"); process.exit(2); }
const M = "smoke_t3";
let failed = 0;
const ok = (name, cond, extra = "") => { console.log(`${cond ? "PASS" : "FAIL"} ${name}${extra ? " " + extra : ""}`); if (!cond) failed++; };

const call = async (key, path, { method = "GET", body, prefer } = {}) => {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    method, body: body === undefined ? undefined : JSON.stringify(body),
    headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json", ...(prefer ? { Prefer: prefer } : {}) },
  });
  const text = await res.text();
  let json; try { json = text ? JSON.parse(text) : null; } catch { json = text; }
  return { status: res.status, json };
};
const svc = (p, o) => call(SRK, p, o);
const rpc = (fn, args) => svc(`rpc/${fn}`, { method: "POST", body: args });
const offer = (over = {}) => ({ id: `${M}_T1`, merchant_id: M, code: "T1", kind: "pct", value: 10, max_paise: 30000,
  min_order_paise: 199900, method: null, starts_at: 1767225600000, ends_at: 1893456000000, funded_by: "merchant",
  razorpay_offer_id: null, active: true, ...over });
const pending = async () => (await svc(`outbox?merchant_id=eq.${M}&processed_at=is.null&select=id&order=id`)).json;

async function cleanup() {
  for (const t of ["events", "fillers", "outbox", "offers"]) await svc(`${t}?merchant_id=eq.${M}`, { method: "DELETE" });
  await svc(`payments?merchant_id=eq.${M}`, { method: "DELETE" });
}

try {
  await cleanup();

  // upsert -> offer row + outbox row
  let r = await rpc("upsert_offer_with_outbox", { p_offer: offer() });
  ok("upsert_offer returns offer", r.status === 200 && r.json?.id === `${M}_T1` && r.json.value === 10, `status=${r.status}`);
  ok("upsert wrote outbox row", (await pending()).length === 1);
  ok("starts_at stored from epoch ms", r.json && Date.parse(r.json.starts_at) === 1767225600000);

  // update path (same id) keeps one offer row, adds outbox row
  r = await rpc("upsert_offer_with_outbox", { p_offer: offer({ value: 15 }) });
  ok("upsert updates in place", r.status === 200 && r.json?.value === 15);
  ok("outbox now 2", (await pending()).length === 2);

  // validation raises
  for (const [name, bad] of [["flat with max_paise", offer({ kind: "flat", value: 500, max_paise: 100 })],
    ["pct > 100", offer({ value: 101 })], ["ends <= starts", offer({ ends_at: 1767225600000 })],
    ["negative min", offer({ min_order_paise: -1 })], ["bad kind", offer({ kind: "bogus" })], ["id mismatch", offer({ id: "x_T1" })]]) {
    r = await rpc("upsert_offer_with_outbox", { p_offer: bad });
    ok(`rejects ${name}`, r.status >= 400, `status=${r.status}`);
  }
  ok("rejects did not add outbox rows", (await pending()).length === 2);

  // fillers
  r = await rpc("set_fillers_with_outbox", { p_merchant_id: M, p_fillers: [{ sku: "a", name: "A", price_paise: 100 }, { sku: "b", name: "B", price_paise: 200 }] });
  ok("set_fillers returns count 2", r.status === 200 && r.json === 2);
  r = await rpc("set_fillers_with_outbox", { p_merchant_id: M, p_fillers: [{ sku: "a", name: "A", price_paise: 150 }] });
  ok("set_fillers replaces", r.json === 1 && (await svc(`fillers?merchant_id=eq.${M}`)).json.length === 1);
  r = await rpc("set_fillers_with_outbox", { p_merchant_id: M, p_fillers: [{ sku: "a", name: "A", price_paise: -5 }] });
  ok("set_fillers rejects negative price", r.status >= 400);
  ok("outbox now 4", (await pending()).length === 4);

  // deactivate
  r = await rpc("deactivate_offer_with_outbox", { p_offer_id: `${M}_T1` });
  ok("deactivate ok", r.status === 204 || r.status === 200);
  ok("offer inactive", (await svc(`offers?id=eq.${M}_T1&select=active`)).json[0]?.active === false);
  r = await rpc("deactivate_offer_with_outbox", { p_offer_id: `${M}_nope` });
  ok("deactivate unknown raises", r.status >= 400);

  // markOutboxProcessed style update (plain table query, id <= upTo)
  const ids = await pending(); const upTo = ids[ids.length - 2].id;
  await svc(`outbox?merchant_id=eq.${M}&id=lte.${upTo}&processed_at=is.null`, { method: "PATCH", body: { processed_at: new Date().toISOString() } });
  ok("partial mark processed leaves later rows", (await pending()).length === 1);

  // events + metrics
  const ev = (type) => ({ merchant_id: M, session_id: "s1", type, cart_paise: 1000 });
  r = await svc("events", { method: "POST", body: [ev("seen"), ev("seen"), ev("addon"), ev("payment_verified")] });
  ok("insert events", r.status === 201);
  r = await rpc("metrics_for_merchant", { p_merchant_id: M });
  ok("metrics counts", r.json?.seen === 2 && r.json?.addon === 1 && r.json?.payment_verified === 1 && r.json?.nudge_click === 0 && r.json?.checkout === 0, JSON.stringify(r.json));
  r = await svc("events", { method: "POST", body: ev("bogus") });
  ok("events type check constraint", r.status >= 400);

  // payments unique order id
  const pay = { merchant_id: M, offer_id: `${M}_T1`, razorpay_order_id: "order_smoke_t3", amount_paise: 100, cart_paise: 200, expected_saving_paise: 100, mode: "server_discount" };
  r = await svc("payments", { method: "POST", body: pay });
  ok("insert payment", r.status === 201);
  r = await svc("payments", { method: "POST", body: pay });
  ok("duplicate order id rejected", r.status === 409);

  // outbox insert with app_config empty succeeds (trigger is a no-op)
  const cfg = (await svc("app_config?select=key")).json;
  if (Array.isArray(cfg) && cfg.length === 0) {
    r = await svc("outbox", { method: "POST", body: { merchant_id: M } });
    ok("outbox insert with empty app_config", r.status === 201);
  } else console.log("SKIP outbox-empty-config check (app_config already populated)");

  // RLS: anon sees nothing
  if (ANON) {
    for (const t of ["offers", "fillers", "outbox", "events", "payments", "app_config"]) {
      r = await call(ANON, `${t}?select=*&limit=1`);
      ok(`anon select ${t} blocked`, r.status >= 400 || (Array.isArray(r.json) && r.json.length === 0), `status=${r.status}`);
    }
    r = await call(ANON, "rpc/metrics_for_merchant", { method: "POST", body: { p_merchant_id: M } });
    ok("anon cannot call rpc", r.status >= 400, `status=${r.status}`);
  } else console.log("SKIP anon RLS checks (export SUPABASE_ANON_KEY to enable)");
} catch (e) { console.error("ERROR", e.message); failed++; }
finally { await cleanup(); }
console.log(failed ? `\n${failed} FAILED` : "\nall passed");
process.exit(failed ? 1 : 0);
