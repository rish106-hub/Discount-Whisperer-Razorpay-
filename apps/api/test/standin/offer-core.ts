/**
 * LOCAL TEST STAND-IN for @dw/offer-core (T1 builds the real one on another branch).
 * Written from PLAN.xml lookup_semantics only, minimal, test-only. NOT the production rules brain:
 * the real package replaces it after the T1 merge (T7). The version hash here is NOT FNV-1a.
 */
import type { BuildLadderInput, Ladder, Offer, ValidateInput, ValidateResult } from "@dw/contracts";

export function savingPaise(o: Pick<Offer, "kind" | "value" | "maxPaise">, cart: number): number {
  if (o.kind === "flat") return Math.min(o.value, cart);
  const s = Math.floor((cart * o.value) / 100);
  return o.maxPaise === null ? s : Math.min(s, o.maxPaise);
}

export function validateSelection(offers: readonly Offer[], i: ValidateInput): ValidateResult {
  const bad = (reason: ValidateResult["reason"]): ValidateResult => ({
    valid: false, reason, savingPaise: 0, chargePaise: i.cartPaise,
  });
  if (i.offerId === null) return { valid: true, reason: "ok", savingPaise: 0, chargePaise: i.cartPaise };
  const o = offers.find((x) => x.id === i.offerId);
  if (!o) return bad("unknown_offer");
  if (!o.active) return bad("inactive");
  if (i.nowMs < o.startsAt) return bad("not_started");
  if (i.nowMs >= o.endsAt) return bad("expired");
  if (i.cartPaise < o.minOrderPaise) return bad("below_min");
  if (o.method !== null && o.method !== i.method) return bad("method_mismatch");
  const saving = savingPaise(o, i.cartPaise);
  return {
    valid: true, reason: "ok", savingPaise: saving,
    chargePaise: o.kind === "cashback_pct" ? i.cartPaise : i.cartPaise - saving,
  };
}

export function buildLadder(input: BuildLadderInput): Ladder {
  const offers = input.offers
    .filter((o) => o.active && o.endsAt > input.nowMs)
    .map((o) => ({
      id: o.id, code: o.code, kind: o.kind, value: o.value, maxPaise: o.maxPaise,
      minOrderPaise: o.minOrderPaise, method: o.method, startsAt: o.startsAt, endsAt: o.endsAt, fundedBy: o.fundedBy,
    }))
    .sort((a, b) => a.minOrderPaise - b.minOrderPaise || (a.id < b.id ? -1 : 1));
  const fillers = [...input.fillers].sort((a, b) => a.pricePaise - b.pricePaise || (a.sku < b.sku ? -1 : 1));
  const disabled = input.disabled ?? false;
  const version = JSON.stringify({ merchantId: input.merchantId, disabled, offers, fillers }).length.toString(16) +
    JSON.stringify({ offers, fillers, disabled }).split("").reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7).toString(16);
  return {
    v: 1, merchantId: input.merchantId, version, builtAt: input.nowMs, disabled,
    mins: offers.map((o) => o.minOrderPaise), offers, fillers,
  };
}
