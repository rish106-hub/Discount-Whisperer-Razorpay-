import { describe, expect, it } from "vitest";
import { offerFromRow, offerToRpc, paymentFromRow } from "../src/supabaseRepo";

describe("supabaseRepo row mapping", () => {
  const row = {
    id: "m1_O1", merchant_id: "m1", code: "O1", kind: "pct", value: 10, max_paise: 30000, min_order_paise: 199900,
    method: null, starts_at: "2026-01-01T00:00:00+00:00", ends_at: "2030-01-01T00:00:00+00:00", funded_by: "merchant",
    razorpay_offer_id: null, active: true, updated_at: "2026-01-01T00:00:00.000Z",
  };
  it("converts timestamptz to epoch ms and snake to camel", () => {
    const o = offerFromRow(row);
    expect(o).toMatchObject({ merchantId: "m1", startsAt: 1767225600000, endsAt: 1893456000000, maxPaise: 30000, method: null });
  });
  it("round-trips to RPC payload with snake_case keys and ISO times", () => {
    const { updatedAt: _u, ...up } = offerFromRow(row);
    const p = offerToRpc(up);
    expect(p).toMatchObject({ merchant_id: "m1", min_order_paise: 199900, starts_at: "2026-01-01T00:00:00.000Z" });
    expect(Object.keys(p).every((k) => k === k.toLowerCase())).toBe(true);
  });
  it("maps payments", () => {
    const p = paymentFromRow({ id: 1, merchant_id: "m1", offer_id: null, razorpay_order_id: "order_1", razorpay_payment_id: null,
      amount_paise: 5, cart_paise: 5, expected_saving_paise: 0, mode: "server_discount", status: "created",
      created_at: "2026-01-01T00:00:00Z", updated_at: "2026-01-01T00:00:00Z" });
    expect(p).toMatchObject({ razorpayOrderId: "order_1", cartPaise: 5, mode: "server_discount" });
  });
});
