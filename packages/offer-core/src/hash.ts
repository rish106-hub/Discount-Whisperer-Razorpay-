/**
 * Ladder version: FNV-1a 64-bit over the UTF-8 bytes of canonical JSON, as 16 lower-case hex chars.
 * Canonical JSON = JSON with object keys sorted recursively (array order kept, undefined skipped).
 * offset basis 0xcbf29ce484222325, prime 0x100000001b3, arithmetic mod 2^64.
 * Not cryptographic; it only has to change when ladder content changes.
 */
const OFFSET = 0xcbf29ce484222325n;
const PRIME = 0x100000001b3n;
const MASK = 0xffffffffffffffffn;

export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null";
  if (Array.isArray(value)) return `[${value.map((v) => canonicalJson(v)).join(",")}]`;
  const obj = value as Record<string, unknown>;
  const parts: string[] = [];
  for (const k of Object.keys(obj).sort()) {
    if (obj[k] === undefined) continue;
    parts.push(`${JSON.stringify(k)}:${canonicalJson(obj[k])}`);
  }
  return `{${parts.join(",")}}`;
}

export function fnv1a64Hex(text: string): string {
  let h = OFFSET;
  for (const b of new TextEncoder().encode(text)) {
    h ^= BigInt(b);
    h = (h * PRIME) & MASK;
  }
  return h.toString(16).padStart(16, "0");
}
