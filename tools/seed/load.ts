/**
 * Loads tools/seed/out/m*.json through the admin API:
 * POST each offer (NewOffer body), PUT fillers, POST rebuild. Retries each call 3 times with backoff.
 * Env: DW_API (default http://localhost:8787), ADMIN_TOKEN (required, never printed or written).
 * Optional argv: merchant ids to load (e.g. `tsx seed/load.ts m1 m2`). Default: all files in out/.
 */
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import type { Filler, Offer } from "@dw/contracts";
import { NewOfferSchema, PutFillersSchema } from "@dw/contracts/schemas";

const OUT_DIR = join(dirname(fileURLToPath(import.meta.url)), "out");
const MAX_ATTEMPTS = 3;
const BACKOFF_MS = 500;

interface SeedSet {
  merchantId: string;
  offers: Offer[];
  fillers: Filler[];
}

interface Row {
  merchantId: string;
  offersOk: number;
  offersFailed: number;
  fillers: string;
  rebuild: string;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Retries a call on network error or non-2xx. Returns the parsed body or throws the last error. */
async function withRetry<T>(label: string, fn: () => Promise<T>): Promise<T> {
  let lastErr: unknown;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (attempt < MAX_ATTEMPTS) await sleep(BACKOFF_MS * 2 ** (attempt - 1));
    }
  }
  throw new Error(`${label} failed after ${MAX_ATTEMPTS} attempts: ${(lastErr as Error).message}`);
}

async function call(api: string, token: string, method: string, path: string, body?: unknown): Promise<unknown> {
  const res = await fetch(`${api}${path}`, {
    method,
    headers: {
      authorization: `Bearer ${token}`,
      ...(body === undefined ? {} : { "content-type": "application/json" }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${method} ${path} -> ${res.status} ${text.slice(0, 200)}`);
  return text ? JSON.parse(text) : {};
}

/** Strips server-owned fields so the body matches the strict NewOffer schema. */
function toNewOffer(o: Offer): unknown {
  const { id: _id, merchantId: _m, updatedAt: _u, ...rest } = o;
  return NewOfferSchema.parse(rest);
}

export async function loadMerchant(api: string, token: string, set: SeedSet): Promise<Row> {
  const m = set.merchantId;
  let offersOk = 0;
  let offersFailed = 0;
  for (const o of set.offers) {
    try {
      await withRetry(`offer ${o.id}`, () => call(api, token, "POST", `/v1/admin/merchants/${m}/offers`, toNewOffer(o)));
      offersOk++;
    } catch (err) {
      offersFailed++;
      console.error(`  ${(err as Error).message}`);
    }
  }
  const fillers = PutFillersSchema.parse(set.fillers);
  let fillerCell = "ok";
  try {
    await withRetry(`fillers ${m}`, () => call(api, token, "PUT", `/v1/admin/merchants/${m}/fillers`, fillers));
  } catch (err) {
    fillerCell = "failed";
    console.error(`  ${(err as Error).message}`);
  }
  let rebuildCell = "ok";
  try {
    const r = (await withRetry(`rebuild ${m}`, () => call(api, token, "POST", `/v1/admin/merchants/${m}/rebuild`))) as {
      version?: string;
    };
    rebuildCell = r.version ?? "ok";
  } catch (err) {
    rebuildCell = "failed";
    console.error(`  ${(err as Error).message}`);
  }
  return { merchantId: m, offersOk, offersFailed, fillers: fillerCell, rebuild: rebuildCell };
}

function printTable(rows: Row[]): void {
  const head = ["merchant", "offers ok", "offers failed", "fillers", "rebuild"];
  const body = rows.map((r) => [r.merchantId, String(r.offersOk), String(r.offersFailed), r.fillers, r.rebuild]);
  const widths = head.map((h, i) => Math.max(h.length, ...body.map((b) => (b[i] ?? "").length)));
  const line = (cells: string[]) => cells.map((c, i) => c.padEnd(widths[i] ?? 0)).join("  ");
  console.log(line(head));
  console.log(widths.map((w) => "-".repeat(w)).join("  "));
  for (const b of body) console.log(line(b));
}

async function main(): Promise<void> {
  const api = process.env.DW_API ?? "http://localhost:8787";
  const token = process.env.ADMIN_TOKEN;
  if (!token) throw new Error("ADMIN_TOKEN is not set (export it in the shell; it is never written to disk)");

  const wanted = new Set(process.argv.slice(2));
  const files = readdirSync(OUT_DIR)
    .filter((f) => /^m\d+\.json$/.test(f))
    .filter((f) => wanted.size === 0 || wanted.has(f.replace(/\.json$/, "")))
    .sort((a, b) => Number(a.slice(1, -5)) - Number(b.slice(1, -5)));
  if (files.length === 0) throw new Error(`no seed files in ${OUT_DIR}; run pnpm seed:generate first`);

  console.log(`loading ${files.length} merchant(s) into ${api}`);
  const rows: Row[] = [];
  for (const f of files) {
    const set = JSON.parse(readFileSync(join(OUT_DIR, f), "utf8")) as SeedSet;
    rows.push(await loadMerchant(api, token, set));
  }
  printTable(rows);
  const failed = rows.some((r) => r.offersFailed > 0 || r.fillers === "failed" || r.rebuild === "failed");
  if (failed) {
    console.error("load finished with failures");
    process.exitCode = 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err: unknown) => {
    console.error((err as Error).message);
    process.exitCode = 1;
  });
}
