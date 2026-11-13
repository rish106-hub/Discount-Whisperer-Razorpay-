import { describe, expect, it } from "vitest";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

// Demo must never send an offer the server will reject (charge < Rs 1) when a payable one exists.
const mod = resolve(__dirname, "../../../apps/demo/public/pick-offer.js");
const load = () => import(/* @vite-ignore */ pathToFileURL(mod).href);

const offers = new Map<string, { kind: string }>([
  ["F", { kind: "flat" }],
  ["P", { kind: "pct" }],
  ["C", { kind: "cashback_pct" }],
]);

describe("demo pickOffer", () => {
  it("skips an offer that leaves under 100 paise, takes the best payable one", async () => {
    const { pickOffer } = await load();
    const applicable = [
      { offerId: "F", savingPaise: 24950 }, // cart 25050 -> charge 100 ok
      { offerId: "P", savingPaise: 25000 }, // charge 50 -> rejected
    ];
    expect(pickOffer(applicable, offers, 25050)).toBe("F");
  });
  it("returns null when no offer is payable", async () => {
    const { pickOffer } = await load();
    expect(pickOffer([{ offerId: "P", savingPaise: 180000 }], offers, 180000)).toBeNull();
    expect(pickOffer([], offers, 180000)).toBeNull();
  });
  it("cashback charge equals cart, so it stays payable but loses to a bigger saving", async () => {
    const { pickOffer } = await load();
    expect(pickOffer([{ offerId: "C", savingPaise: 9000 }], offers, 180000)).toBe("C");
    expect(
      pickOffer([{ offerId: "C", savingPaise: 9000 }, { offerId: "P", savingPaise: 18000 }], offers, 180000),
    ).toBe("P");
  });
});
