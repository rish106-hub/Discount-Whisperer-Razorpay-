/** Razorpay payment signature: hex HMAC-SHA256(key_secret, order_id + "|" + payment_id). */

const encoder = new TextEncoder();

export async function computeSignature(secret: string, orderId: string, paymentId: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, [
    "sign",
  ]);
  const mac = await crypto.subtle.sign("HMAC", key, encoder.encode(`${orderId}|${paymentId}`));
  return Array.from(new Uint8Array(mac), (b) => b.toString(16).padStart(2, "0")).join("");
}

/** XOR-accumulate over the full length so timing does not reveal the first differing byte. */
export function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false; // length of a SHA-256 hex digest is public
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** Malformed or wrong signatures return false (never throws, never 400). */
export async function verifySignature(
  secret: string,
  orderId: string,
  paymentId: string,
  signature: string,
): Promise<boolean> {
  if (!/^[0-9a-fA-F]{64}$/.test(signature)) return false;
  const expected = await computeSignature(secret, orderId, paymentId);
  return constantTimeEqual(expected, signature.toLowerCase());
}
