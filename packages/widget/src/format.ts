/** Integer paise -> "Rs 1,99,900" with en-IN (lakh/crore) grouping. No floats, no Intl (small + deterministic). */
export function groupIndian(n: number): string {
  const s = String(Math.floor(Math.abs(n)));
  if (s.length <= 3) return s;
  const head = s.slice(0, -3).replace(/\B(?=(\d\d)+$)/g, ",");
  return `${head},${s.slice(-3)}`;
}

/** Whole rupees drop the ".00"; odd paise keep two digits. Negative or non-integer input is clamped to 0. */
export function formatRupees(paise: number): string {
  const p = Number.isSafeInteger(paise) && paise > 0 ? paise : 0;
  const rupees = Math.floor(p / 100);
  const rem = p % 100;
  const frac = rem === 0 ? "" : `.${String(rem).padStart(2, "0")}`;
  return `Rs ${groupIndian(rupees)}${frac}`;
}
