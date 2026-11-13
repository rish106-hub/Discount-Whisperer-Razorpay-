// Demo store glue. Holds no keys: the Razorpay key id arrives in the server order response.
const MERCHANT = "m1";
const UNIT_PAISE = 180000; // Rs 1,800 tant saree
const CHECKOUT_JS = "https://checkout.razorpay.com/v1/checkout.js";

const params = new URLSearchParams(location.search);
const apiParam = params.get("api");
const MOCK = apiParam === "mock";
const API = MOCK ? "" : (apiParam || "").replace(/\/+$/, ""); // default: same origin

const $ = (id) => document.getElementById(id);
const el = document.querySelector("dw-offers");
if (API) el.setAttribute("api-base", API); // T7 fix: ?api= must reach the widget too (demo_contract)
const state = { qty: 1, extras: [] };

const rupees = (p) => {
  const r = Math.floor(p / 100), f = p % 100;
  return "Rs " + r.toLocaleString("en-IN") + (f ? "." + String(f).padStart(2, "0") : "");
};
const cartPaise = () => state.qty * UNIT_PAISE + state.extras.reduce((s, x) => s + x.pricePaise, 0);
const method = () => $("pay-method").value || null;
const show = (id, v) => { $(id).textContent = typeof v === "string" ? v : JSON.stringify(v, null, 2); };

// ?api=mock: serve the ladder from mock-ladder.json and swallow everything else. The widget code is unchanged.
if (MOCK) {
  const realFetch = window.fetch.bind(window);
  window.fetch = (input, init) => {
    const url = typeof input === "string" ? input : input.url;
    if (url.includes("/v1/ladder/")) return realFetch(new URL("./mock-ladder.json", location.href));
    if (url.includes("/v1/events")) return Promise.resolve(new Response("{}", { status: 202 }));
    return realFetch(input, init);
  };
  navigator.sendBeacon = () => true;
  show("order-result", "Mock mode (?api=mock): ladder from mock-ladder.json, no server, Razorpay is not called.");
}

function render() {
  const total = cartPaise();
  $("qty").textContent = String(state.qty);
  $("cart-value").textContent = rupees(total);
  $("qty-minus").disabled = state.qty <= 1;
  const ex = $("extras");
  ex.hidden = state.extras.length === 0;
  ex.textContent = state.extras.length ? "Add-ons: " + state.extras.map((x) => x.sku + " " + rupees(x.pricePaise)).join(", ") : "";
  el.setAttribute("cart-value-paise", String(total));
  window.dispatchEvent(new CustomEvent("dw:cart", { detail: { cartPaise: total, method: method() } }));
}

$("qty-plus").addEventListener("click", () => { state.qty += 1; render(); });
$("qty-minus").addEventListener("click", () => { if (state.qty > 1) { state.qty -= 1; render(); } });
$("pay-method").addEventListener("change", render);
window.addEventListener("dw:add", (e) => { state.extras.push({ sku: e.detail.sku, pricePaise: e.detail.pricePaise }); render(); });

async function postJson(path, body) {
  const res = await fetch(API + path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  let data = null;
  try { data = await res.json(); } catch { /* non-JSON error body */ }
  return { ok: res.ok, status: res.status, data };
}

let checkoutLoading = null;
function loadCheckout() { // only called from Pay
  if (window.Razorpay) return Promise.resolve();
  checkoutLoading ??= new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = CHECKOUT_JS;
    s.onload = resolve;
    s.onerror = () => { checkoutLoading = null; reject(new Error("could not load checkout.js")); };
    document.head.append(s);
  });
  return checkoutLoading;
}

async function pay() {
  const btn = $("pay-button");
  btn.disabled = true;
  show("verify-result", "Not started.");
  try {
    // Best offer the widget is showing for this method; null = pay full price. The server re-validates either way.
    const offerId = el.lookupResult?.applicable?.[0]?.offerId ?? null;
    const body = { merchantId: MERCHANT, cartPaise: cartPaise(), method: method(), offerId };
    if (MOCK) {
      show("order-result", { mock: true, request: body, note: "Razorpay not called in mock mode." });
      show("verify-result", "Skipped (mock mode).");
      return;
    }
    const order = await postJson("/v1/payments/order", body);
    show("order-result", { status: order.status, ...order.data });
    if (!order.ok) return;
    await loadCheckout();
    const o = order.data;
    await new Promise((resolve) => {
      const rzp = new window.Razorpay({
        key: o.keyId, order_id: o.orderId, amount: o.amountPaise, currency: o.currency,
        name: "Shantipur Tant House", description: "Test mode payment",
        handler: async (r) => {
          const v = await postJson("/v1/payments/verify", {
            razorpay_order_id: r.razorpay_order_id,
            razorpay_payment_id: r.razorpay_payment_id,
            razorpay_signature: r.razorpay_signature,
          });
          show("verify-result", { status: v.status, ...v.data });
          resolve();
        },
        modal: { ondismiss: () => { show("verify-result", "Checkout closed before payment."); resolve(); } },
      });
      rzp.on("payment.failed", (r) => { show("verify-result", { failed: true, reason: r?.error?.description ?? "unknown" }); resolve(); });
      rzp.open();
    });
  } catch (e) {
    show("order-result", "Error: " + (e && e.message ? e.message : "request failed"));
  } finally {
    btn.disabled = false;
  }
}
$("pay-button").addEventListener("click", pay);
render();
