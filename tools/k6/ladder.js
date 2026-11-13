// Load test: GET /v1/ladder/:merchantId (the widget's hot path, served from KV).
// Local target only. Env: DW_API (default http://localhost:8787), MERCHANT (default m1), VUS (10), DURATION (30s).
import http from "k6/http";
import { check, sleep } from "k6";

const BASE = __ENV.DW_API || "http://localhost:8787";
const MERCHANT = __ENV.MERCHANT || "m1";

export const options = {
  vus: Number(__ENV.VUS || 10),
  duration: __ENV.DURATION || "30s",
  thresholds: {
    http_req_failed: ["rate<0.01"],
  },
};

export default function () {
  const res = http.get(`${BASE}/v1/ladder/${MERCHANT}`, { tags: { route: "ladder" } });
  check(res, { "ladder 200": (r) => r.status === 200 });
  sleep(0.1);
}
