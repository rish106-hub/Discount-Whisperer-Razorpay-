#!/usr/bin/env node
// Creates ONE real Razorpay TEST-mode order (Rs 1 = 100 paise) to prove the Orders API call works.
// Usage: RAZORPAY_KEY_ID=rzp_test_... RAZORPAY_KEY_SECRET=... node apps/api/test/payments/scripts/try-order.mjs
// Prints only the order id and amount. Never prints keys or headers.
const id = process.env.RAZORPAY_KEY_ID ?? "";
const secret = process.env.RAZORPAY_KEY_SECRET ?? "";
if (!id.startsWith("rzp_test_") || !secret) {
  console.error("refusing: RAZORPAY_KEY_ID must start with rzp_test_ and RAZORPAY_KEY_SECRET must be set");
  process.exit(1);
}
const res = await fetch("https://api.razorpay.com/v1/orders", {
  method: "POST",
  headers: { authorization: `Basic ${btoa(`${id}:${secret}`)}`, "content-type": "application/json" },
  body: JSON.stringify({ amount: 100, currency: "INR", receipt: `dw_try_${Date.now()}`, notes: { merchantId: "try", offerId: "" } }),
});
if (!res.ok) {
  console.error(`razorpay returned HTTP ${res.status}`);
  process.exit(1);
}
const order = await res.json();
console.log(`order id=${order.id} amount=${order.amount} currency=${order.currency}`);
