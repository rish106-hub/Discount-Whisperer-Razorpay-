// Load test: POST /v1/checkout/validate (re-reads Supabase, the money path).
// Local target only. Env: DW_API (default http://localhost:8787), MERCHANT (m1), OFFER (m1_O1), VUS (10), DURATION (30s).
import http from "k6/http";
import { check, sleep } from "k6";

const BASE = __ENV.DW_API || "http://localhost:8787";
const MERCHANT = __ENV.MERCHANT || "m1";
const OFFER = __ENV.OFFER || "m1_O1";

export const options = {
  vus: Number(__ENV.VUS || 10),
  duration: __ENV.DURATION || "30s",
  thresholds: {
    http_req_failed: ["rate<0.01"],
  },
};

const headers = { "content-type": "application/json" };

export default function () {
  const body = JSON.stringify({ merchantId: MERCHANT, cartPaise: 220000, method: null, offerId: OFFER });
  const res = http.post(`${BASE}/v1/checkout/validate`, body, { headers, tags: { route: "validate" } });
  check(res, { "validate 200": (r) => r.status === 200 });
  sleep(0.1);
}
