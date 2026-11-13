/** @jsxImportSource preact */
import type { Filler, Ladder, LadderOffer, LookupResult } from "@dw/contracts";
import { formatRupees } from "./format";

export interface ViewProps {
  ladder: Ladder;
  result: LookupResult;
  onNudge: () => void;
  onAdd: (f: Filler) => void;
}

/** Plain-words description of an offer, e.g. "10% off (up to Rs 300)". */
export function describe(o: LadderOffer): string {
  const cap = o.maxPaise != null ? ` (up to ${formatRupees(o.maxPaise)})` : "";
  if (o.kind === "flat") return `${formatRupees(o.value)} off`;
  if (o.kind === "cashback_pct") return `${o.value}% cashback${cap}`;
  return `${o.value}% off${cap}`;
}

const article = (name: string) => (/^[aeiou]/i.test(name) ? "an" : "a");

/** Returns null (renders nothing) when there is nothing useful to say. */
export function View({ ladder, result, onNudge, onAdd }: ViewProps) {
  const byId = new Map(ladder.offers.map((o) => [o.id, o]));
  const applicable = result.applicable.flatMap((a) => {
    const o = byId.get(a.offerId);
    return o ? [{ o, saving: a.savingPaise }] : [];
  });
  const conditional = result.conditional.flatMap((c) => {
    const o = byId.get(c.offerId);
    return o ? [{ o, saving: c.savingPaise, method: c.method }] : [];
  });
  const top = result.unlockable[0];
  const topOffer = top ? byId.get(top.offerId) : undefined;
  const filler = result.filler;
  if (!applicable.length && !conditional.length && !(top && topOffer)) return null;

  return (
    <div class="dw" data-testid="dw-root" role="region" aria-label="Offers for your cart">
      {applicable.length > 0 && (
        <ul class="list" data-testid="dw-applicable" aria-label="Offers applied now">
          {applicable.map(({ o, saving }, i) => (
            <li key={o.id}>
              {/* The server applies one offer: the best (first) is applied, the rest are alternatives. */}
              {i === 0 ? (
                <>
                  <span class="ok" aria-hidden="true">
                    ✓
                  </span>{" "}
                </>
              ) : (
                "or: "
              )}
              {describe(o)}
              {o.method ? ` with ${o.method}` : ""}:{" "}
              <strong>
                {o.kind === "cashback_pct" ? `${formatRupees(saving)} cashback` : `save ${formatRupees(saving)}`}
              </strong>
            </li>
          ))}
        </ul>
      )}
      {conditional.length > 0 && (
        <ul class="list cond" data-testid="dw-conditional" aria-label="Offers if you pay with a specific method">
          {conditional.map(({ o, saving, method }) => (
            <li key={o.id}>
              If you pay with <strong>{method}</strong>: {describe(o)} ({formatRupees(saving)}
              {o.kind === "cashback_pct" ? " cashback" : " off"})
            </li>
          ))}
        </ul>
      )}
      {top && topOffer && (
        <div class="nudge" data-testid="dw-nudge" onClick={onNudge}>
          <p>
            Add <strong>{formatRupees(top.gapPaise)}</strong> more to unlock {describe(topOffer)}
            {top.method ? ` with ${top.method}` : ""}.
          </p>
          {filler && (
            <p class="row">
              <span>
                Add {article(filler.name)} {filler.name.toLowerCase()} ({formatRupees(filler.pricePaise)})
              </span>
              <button
                type="button"
                class="add"
                data-testid="dw-add"
                aria-label={`Add ${filler.name} to cart`}
                onClick={(e) => {
                  e.stopPropagation(); // addon, not nudge_click
                  onAdd(filler);
                }}
              >
                Add
              </button>
            </p>
          )}
        </div>
      )}
    </div>
  );
}

export const CSS = `
:host{display:block;font:14px/1.4 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;color:#1f2933}
.dw{box-sizing:border-box;max-width:100%;padding:12px;border:1px solid #c7d0d9;border-radius:8px;background:#fff}
.dw *{box-sizing:border-box}
.list{margin:0 0 8px;padding:0;list-style:none}
.list li{margin:0 0 4px;overflow-wrap:anywhere}
.ok{color:#0b6b2c;font-weight:700}
.cond{color:#3e4c59}
.nudge{padding:8px;border-radius:6px;background:#fff6e0;border:1px solid #e0b44c}
.nudge p{margin:0 0 4px;overflow-wrap:anywhere}
.row{display:flex;flex-wrap:wrap;align-items:center;gap:8px;justify-content:space-between}
.add{min-height:44px;min-width:64px;padding:0 16px;border:0;border-radius:6px;background:#8a3b00;color:#fff;font:inherit;font-weight:600;cursor:pointer}
.add:focus-visible{outline:3px solid #1d4ed8;outline-offset:2px}
`;
