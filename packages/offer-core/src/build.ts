import type { BuildLadderInput, Ladder, LadderOffer, Offer } from "@dw/contracts";
import { canonicalJson, fnv1a64Hex } from "./hash";

const cmp = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

/** Copy only the public fields: razorpayOfferId, active, merchantId, updatedAt never reach the edge. */
function toLadderOffer(o: Offer): LadderOffer {
  return {
    id: o.id,
    code: o.code,
    kind: o.kind,
    value: o.value,
    maxPaise: o.maxPaise,
    minOrderPaise: o.minOrderPaise,
    method: o.method,
    startsAt: o.startsAt,
    endsAt: o.endsAt,
    fundedBy: o.fundedBy,
  };
}

/** Pure and deterministic: same content => same version. builtAt is stored but not hashed. */
export function buildLadder(input: BuildLadderInput): Ladder {
  const { merchantId, nowMs } = input;
  const disabled = input.disabled ?? false;
  const offers = input.offers
    .filter((o) => o.active && o.endsAt > nowMs)
    .map(toLadderOffer)
    .sort((a, b) => a.minOrderPaise - b.minOrderPaise || cmp(a.id, b.id));
  const fillers = input.fillers
    .map((f) => ({ sku: f.sku, name: f.name, pricePaise: f.pricePaise }))
    .sort((a, b) => a.pricePaise - b.pricePaise || cmp(a.sku, b.sku));
  const version = fnv1a64Hex(canonicalJson({ v: 1, merchantId, disabled, offers, fillers }));
  return {
    v: 1,
    merchantId,
    version,
    builtAt: nowMs,
    disabled,
    mins: offers.map((o) => o.minOrderPaise),
    offers,
    fillers,
  };
}
