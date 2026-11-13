/**
 * Deterministic seed generator. Writes tools/seed/out/m1..m50.json.
 * m1 is the golden merchant copied verbatim from golden.json (sets.m1). m2..m50 come from faker en_IN, seed 42.
 * Every record is parsed with the contract schemas before it is written. Money in paise, times epoch ms.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { Faker, base, en, en_IN } from "@faker-js/faker";
import golden from "@dw/contracts/golden.json" with { type: "json" };
import type { Offer } from "@dw/contracts";
import { FillerSchema, OfferSchema, PutFillersSchema } from "@dw/contracts/schemas";

export const SEED = 42;
export const MERCHANT_COUNT = 50;
const DAY_MS = 86_400_000;
const STARTS_AT = 1_767_225_600_000; // 2026-01-01T00:00:00Z, same as golden
const UPDATED_AT = STARTS_AT;

export interface MerchantSet {
  merchantId: string;
  offers: Offer[];
  fillers: { sku: string; name: string; pricePaise: number }[];
}

/** Fresh faker per call so output does not depend on call order across merchants. */
function makeFaker(): Faker {
  const f = new Faker({ locale: [en_IN, en, base] });
  f.seed(SEED);
  return f;
}

/** m1 = golden.sets.m1, verbatim. */
export function buildM1(): MerchantSet {
  return structuredClone(golden.sets.m1) as MerchantSet;
}

/** Builds one faker-driven merchant. Offer count is 3..8, except m50 which gets 250. */
export function buildMerchant(n: number): MerchantSet {
  const merchantId = `m${n}`;
  const f = makeFaker();
  // Mix the merchant index into the seed so each merchant differs but stays deterministic.
  f.seed(SEED + n);

  const offerCount = n === MERCHANT_COUNT ? 250 : f.number.int({ min: 3, max: 8 });
  const offers: Offer[] = [];
  for (let i = 1; i <= offerCount; i++) {
    const code = `O${i}`;
    const kind = f.helpers.arrayElement(["pct", "flat", "cashback_pct"] as const);
    // Flat values are paise (Rs 50..500). Percent values are 1..100.
    const value = kind === "flat" ? f.number.int({ min: 50, max: 500 }) * 100 : f.number.int({ min: 1, max: 100 });
    const cap = kind === "flat" ? null : f.helpers.arrayElement([null, f.number.int({ min: 100, max: 500 }) * 100]);
    const startsAt = STARTS_AT;
    const endsAt = startsAt + f.number.int({ min: 30, max: 1400 }) * DAY_MS;
    const offer = {
      id: `${merchantId}_${code}`,
      merchantId,
      code,
      kind,
      value,
      maxPaise: cap,
      minOrderPaise: f.number.int({ min: 0, max: 30 }) * 10_000,
      method: f.helpers.arrayElement([null, "UPI", "HDFC_CC"] as const),
      startsAt,
      endsAt,
      fundedBy: f.helpers.arrayElement(["merchant", "bank"] as const),
      razorpayOfferId: null,
      active: f.datatype.boolean({ probability: 0.85 }),
      updatedAt: UPDATED_AT,
    };
    offers.push(OfferSchema.parse(offer));
  }

  const fillerCount = f.number.int({ min: 3, max: 6 });
  const fillers: MerchantSet["fillers"] = [];
  for (let i = 1; i <= fillerCount; i++) {
    const name = f.commerce.productName().slice(0, 80);
    const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    fillers.push(
      FillerSchema.parse({
        sku: `${slug}-${i}`,
        name,
        pricePaise: f.number.int({ min: 99, max: 2999 }) * 100,
      }),
    );
  }
  PutFillersSchema.parse(fillers);
  return { merchantId, offers, fillers };
}

/** All 50 sets in order. */
export function buildAll(): MerchantSet[] {
  const sets: MerchantSet[] = [buildM1()];
  for (let n = 2; n <= MERCHANT_COUNT; n++) sets.push(buildMerchant(n));
  for (const s of sets) PutFillersSchema.parse(s.fillers);
  return sets;
}

const OUT_DIR = join(dirname(fileURLToPath(import.meta.url)), "out");

function main(): void {
  mkdirSync(OUT_DIR, { recursive: true });
  const sets = buildAll();
  console.log(`${"merchant".padEnd(10)}${"offers".padStart(8)}${"fillers".padStart(9)}`);
  for (const s of sets) {
    writeFileSync(join(OUT_DIR, `${s.merchantId}.json`), `${JSON.stringify(s, null, 2)}\n`);
    console.log(`${s.merchantId.padEnd(10)}${String(s.offers.length).padStart(8)}${String(s.fillers.length).padStart(9)}`);
  }
  const total = sets.reduce((a, s) => a + s.offers.length, 0);
  console.log(`wrote ${sets.length} files to ${OUT_DIR}; ${total} offers total; all records passed zod`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
