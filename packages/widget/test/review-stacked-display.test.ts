import { describe, expect, it } from "vitest";
import { render, h } from "preact";
import type { LookupResult } from "@dw/contracts";
import { View } from "../src/view";
import { makeLadder } from "./helpers";

// Server applies exactly one offer, so the widget must mark only the best one as applied.
describe("stacked applicable offers", () => {
  it("only applicable[0] gets the check mark; others are shown as alternatives", () => {
    const ladder = makeLadder();
    const [a, b] = ladder.offers;
    const result = {
      applicable: [
        { offerId: a!.id, savingPaise: 26000 },
        { offerId: b!.id, savingPaise: 25000 },
      ],
      conditional: [],
      unlockable: [],
      filler: null,
    } as unknown as LookupResult;
    const root = document.createElement("div");
    render(h(View, { ladder, result, onNudge: () => {}, onAdd: () => {} }), root);
    const list = root.querySelector('[data-testid="dw-applicable"]')!;
    expect(list).not.toBeNull();
    expect(list.querySelectorAll(".ok").length).toBe(1);
    const items = list.querySelectorAll("li");
    expect(items.length).toBe(2);
    expect(items[0]!.textContent).toContain("✓");
    expect(items[0]!.textContent).toContain("Rs 260");
    expect(items[1]!.textContent).not.toContain("✓");
    expect(items[1]!.textContent).toContain("or:");
  });
});
