# Metrics

Input metrics for the widget and checkout funnel. Served by `GET /v1/metrics/:merchantId`. Every value is computed from the `events` and `payments` tables.

| Metric | Definition | Null when |
|---|---|---|
| `widget_seen_rate` | `seen` events / page views | no `page_view` event exists |
| `nudge_click_rate` | `nudge_click` / `seen` | `seen` is 0 |
| `addon_rate` | `addon` / `nudge_click` | `nudge_click` is 0 |
| `paid_rate` | `payment_verified` / `checkout` | `checkout` is 0 |

North star: AOV uplift for sessions that saw the widget.

## Guardrails (must stay at zero)

- Shown-versus-validated mismatch: an offer the widget displayed that `POST /v1/checkout/validate` rejects for the same cart and method.
- Validated-versus-charged mismatch: `expectedSavingPaise` from `/v1/payments/order` that differs from what Razorpay charged.
- Discount spend within each offer's cap: total saving per offer does not exceed `maxPaise` when set.

## Log line

One JSON line per request: `{ts, route, merchantId, status, ms, ladderVersion?, razorpayOrderId?}`. Never logs keys, signatures or card data.

## Checking locally

```bash
curl -s http://localhost:8787/v1/metrics/m1
```

Do not commit output that contains merchant data. Seed data is synthetic.
