# T5 report: widget and demo

Branch `dw-t5-widget-44cb56`. Status: **done; real build + size check pending T1 merge.**

## Acceptance
| Check | Result |
|---|---|
| `pnpm --filter @dw/widget test` | pass: 55 tests, 3 files (format, golden stand-in check, element) |
| `pnpm --filter @dw/widget typecheck` | pass |
| Build + `size-check` | **with test stand-in** (`DW_STANDIN=1`): 26.9 KB raw, **9.16 KB gzip** (budget 15 KB). Real offer-core is bigger than the stand-in (buildLadder/hash are tree-shaken, `lookup` + `savingPaise` stay). Re-run after T1 merge: `pnpm --filter @dw/widget build:check` |
| Demo `?api=mock` at Rs 1,800 | shows "Add a gamcha (Rs 199)" nudge + UPI cashback conditional (browser-verified) |
| No zod / supabase in widget | pass: test greps `src/`; root `@dw/contracts` imported with `import type` only |

## Files
- `packages/widget/src/`: `element.ts` (custom element, lifecycle), `view.tsx` (Preact view + CSS), `client.ts` (fetch, 800 ms timeout), `events.ts` (sendBeacon text/plain, fetch keepalive fallback), `format.ts` (en-IN Rs), `index.ts`.
- `packages/widget/{vite.config.ts,vitest.config.ts,scripts/size-check.mjs,test/**}`.
- `apps/demo/public/{index.html,demo.js,styles.css,mock-ladder.json}`, `apps/demo/screenshots/*.jpg`.

## Behaviour notes
- Fetch only when visible (IntersectionObserver), once per (api, merchant) per page (module cache). Failure = render nothing + one `console.debug`.
- Disconnect: removes `dw:cart` listener, disconnects IO, aborts fetch, unmounts Preact. Tests cover each.
- `dw:cart` `method` omitted = keep last method; `null` = clear. Junk cart values ignored.
- `seen` once per element when something rendered; `nudge_click` on nudge click; `addon` on Add (Add does not also fire nudge_click). `dw:add` bubbles + composed.
- Added read-only `element.lookupResult` so the demo's Pay uses the same offer the widget shows (`applicable[0]`).
- Money text: `Rs 1,998.99`, whole rupees drop `.00`. Used "Rs" (not the rupee glyph) to match acceptance string.
- Mock mode: demo.js patches `fetch`/`sendBeacon` before the widget loads; widget code unchanged. Pay in mock mode skips Razorpay.
- Context7 had no Razorpay web Checkout docs; Standard Checkout options (`key, order_id, amount, currency, handler, modal.ondismiss, rzp.on("payment.failed")`) from prior knowledge. Verify on the first real test payment.

## Open risks
- **Stand-in only**: `packages/widget/test/offer-core-standin.ts` is test-only (matches all 16 golden m1 lookup cases). `vitest.config.ts` aliases to it only while `packages/offer-core/src/index.ts` is absent; `tsconfig` `paths` falls back likewise. After T1 merge the real package is used automatically.
- Two stacked "applicable" offers (case 9: O1 + O2) are both shown as applied, but Pay sends one offerId (highest saving). Shopper may expect both. Product decision for the human.
- `mock-ladder.json` `version` hand-computed FNV-1a/canonical JSON per contract doc; may differ from T1 `buildLadder`. Widget ignores `version`. Regenerate with real `buildLadder` after T1.
- Clock skew: widget uses `Date.now()`; per checkpoint decision 12 a slow clock shows fewer offers, never wrong money.
- Real Razorpay Checkout flow and `/v1/payments/*` not exercised here (needs T2/T4 + keys).

## Requests
1. **T7**: copy `packages/widget/dist/dw-offers.js` to `apps/demo/public/dw-offers.js` before serving assets (`pnpm --filter @dw/widget build:demo` does build + size-check + copy; file is gitignored). `index.html` loads `./dw-offers.js`.
2. **T7/T0**: `pnpm install` modifies root `pnpm-lock.yaml` (new widget deps). I did not commit it; regenerate at merge. `pnpm install` also needs `packages/offer-core/package.json` to exist for `workspace:*` (I used an untracked local stub; arrives with T1).
3. Pinned: preact 10.29.8, vite 8.3.8, vitest 5.1.0, happy-dom 21.0.4.

## Screenshots
`apps/demo/screenshots/`: `1-cart-1800.jpg` (desktop), `3-320px-1800-nudge.jpg`, `2-320px-hdfc-5400-applicable.jpg`. No horizontal scroll at 320 px (scrollWidth 320).
