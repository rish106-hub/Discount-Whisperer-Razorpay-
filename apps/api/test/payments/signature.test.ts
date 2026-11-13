import { describe, expect, it } from "vitest";
import { computeSignature, constantTimeEqual, verifySignature } from "../../src/razorpay/signature";

// Vector made offline with node:crypto createHmac("sha256", FAKE_SECRET).update("order_ABC123|pay_XYZ789"). Fake secret.
const FAKE_SECRET = "test_secret_not_real";
const VECTOR = "bfd95f4511c0cc81ab4b1f3dbf9c9bd4edb86a605af472413216667d263a9a83";

describe("signature", () => {
  it("matches the node:crypto reference vector", async () => {
    expect(await computeSignature(FAKE_SECRET, "order_ABC123", "pay_XYZ789")).toBe(VECTOR);
  });
  it("accepts the right signature, also upper-case hex", async () => {
    expect(await verifySignature(FAKE_SECRET, "order_ABC123", "pay_XYZ789", VECTOR)).toBe(true);
    expect(await verifySignature(FAKE_SECRET, "order_ABC123", "pay_XYZ789", VECTOR.toUpperCase())).toBe(true);
  });
  it("rejects wrong secret, swapped ids, tampered ids", async () => {
    expect(await verifySignature("other", "order_ABC123", "pay_XYZ789", VECTOR)).toBe(false);
    expect(await verifySignature(FAKE_SECRET, "pay_XYZ789", "order_ABC123", VECTOR)).toBe(false);
    expect(await verifySignature(FAKE_SECRET, "order_ABC123", "pay_XYZ780", VECTOR)).toBe(false);
  });
  it("returns false (not a throw) for malformed signatures", async () => {
    for (const bad of ["", "abc", "z".repeat(64), VECTOR.slice(1), `${VECTOR}0`]) {
      expect(await verifySignature(FAKE_SECRET, "order_ABC123", "pay_XYZ789", bad)).toBe(false);
    }
  });
  it("constantTimeEqual compares by value and length", () => {
    expect(constantTimeEqual("abc", "abc")).toBe(true);
    expect(constantTimeEqual("abc", "abd")).toBe(false);
    expect(constantTimeEqual("abc", "abcd")).toBe(false);
  });
});
