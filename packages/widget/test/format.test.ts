import { describe, expect, it } from "vitest";
import { MAX_CART_PAISE, WIDGET_FETCH_TIMEOUT_MS } from "@dw/contracts";
import { FETCH_TIMEOUT_MS } from "../src/client";
import { formatRupees, groupIndian } from "../src/format";

describe("formatRupees (en-IN)", () => {
  it.each([
    [0, "Rs 0"],
    [100, "Rs 1"],
    [19900, "Rs 199"],
    [99900, "Rs 999"],
    [100000, "Rs 1,000"],
    [199900, "Rs 1,999"],
    [199899, "Rs 1,998.99"],
    [5, "Rs 0.05"],
    [12345600, "Rs 1,23,456"],
    [1000000000, "Rs 1,00,00,000"],
    [MAX_CART_PAISE, "Rs 2,00,00,000"],
  ])("%d -> %s", (p, s) => expect(formatRupees(p)).toBe(s));

  it("clamps junk to Rs 0", () => {
    for (const bad of [-5, 1.5, NaN, Infinity]) expect(formatRupees(bad)).toBe("Rs 0");
  });
  it("groupIndian", () => expect(groupIndian(1234567)).toBe("12,34,567"));
});

describe("constants stay in sync with @dw/contracts", () => {
  it("timeout", () => expect(FETCH_TIMEOUT_MS).toBe(WIDGET_FETCH_TIMEOUT_MS));
});
