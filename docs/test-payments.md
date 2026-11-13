# Test payments

Razorpay test mode only (guardrail G6). Key ids start with `rzp_test_`. The server refuses any other prefix.

## Official references

- Test card details: https://razorpay.com/docs/payments/payments/test-card-details/
- Test UPI details: https://razorpay.com/docs/payments/payments/test-upi-details/

Use the test cards and UPI ids listed on those pages. The repo does not copy card numbers, so the docs stay current with Razorpay.

## Smoke flow (manual Razorpay step)

1. Start the Worker and demo locally.
2. `pnpm --filter @dw/tools smoke` runs until the order result appears.
3. To finish the payment by hand, open the demo, pick a method, and click Pay.
4. In the Razorpay modal, enter a test card or UPI id from the official pages above.
5. The handler posts the three `razorpay_*` fields to `/v1/payments/verify`. The demo shows the verify result.

Never type live credentials or real card numbers into the test modal.

## Signature check

The server computes HMAC-SHA256 of `order_id|payment_id` with the key secret and compares in constant time. A wrong signature returns `verified: false`. To test this, change one character of `razorpay_signature` by hand.
