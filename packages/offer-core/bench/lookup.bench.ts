import { performance } from "node:perf_hooks";
import type { Offer } from "@dw/contracts";
import { buildLadder, lookup } from "../src";

const NOW = 1_780_000_000_000;
const offers: Offer[] = Array.from({ length: 250 }, (_, i) => ({
  id: `b_O${i}`,
  merchantId: "b",
  code: `O${i}`,
  kind: (["pct", "flat", "cashback_pct"] as const)[i % 3]!,
  value: i % 3 === 1 ? 5000 + i * 10 : 5 + (i % 20),
  maxPaise: i % 3 === 1 ? null : 30000,
  minOrderPaise: i * 4000,
  method: i % 4 === 0 ? "UPI" : i % 7 === 0 ? "HDFC_CC" : null,
  startsAt: NOW - 1000,
  endsAt: NOW + 1_000_000,
  fundedBy: i % 2 ? "merchant" : "bank",
  razorpayOfferId: null,
  active: true,
  updatedAt: NOW,
}));
const fillers = [19900, 44900, 69900, 129900].map((p, i) => ({ sku: `f${i}`, name: "f", pricePaise: p }));
const ladder = buildLadder({ merchantId: "b", offers, fillers, nowMs: NOW });

const carts = [0, 100_000, 250_000, 500_000, 750_000, 999_999];
const methods = [null, "UPI", "HDFC_CC"];
let sink = 0;
const N = 200;
const samples: number[] = [];
for (let r = 0; r < 300; r++) {
  const t0 = performance.now();
  for (let i = 0; i < N; i++) {
    sink += lookup(ladder, { cartPaise: carts[i % carts.length]!, method: methods[i % 3]!, nowMs: NOW }).step;
  }
  if (r >= 50) samples.push(((performance.now() - t0) / N) * 1000); // warm-up dropped; µs per lookup
}
samples.sort((a, b) => a - b);
const median = samples[samples.length >> 1]!;
console.log(`lookup 250 offers: median ${median.toFixed(2)} µs, p95 ${samples[Math.floor(samples.length * 0.95)]!.toFixed(2)} µs (sink ${sink})`);
if (median >= 50) {
  console.error("FAIL: over 50 µs budget");
  process.exit(1);
}
