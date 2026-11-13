import { describe, expect, it } from "vitest";
import golden from "@dw/contracts/golden.json";
import { lookup } from "./offer-core-standin";
import { makeLadder } from "./helpers";

// Sanity: the stand-in agrees with golden.json on the m1 lookup cases (so widget tests rest on correct rules).
const ladder = (now: number) => makeLadder(now);

describe("test stand-in vs golden (m1 lookup)", () => {
  const cases = golden.cases.filter((c) => c.kind === "lookup" && c.set === "m1");
  it.each(cases.map((c) => [c.name, c] as const))("%s", (_n, c) => {
    const input = (c as { input: Parameters<typeof lookup>[1] }).input;
    const exp = (c as unknown as { expected: ReturnType<typeof lookup> }).expected;
    const got = lookup(ladder(input.nowMs), input);
    expect(got.step).toBe(exp.step);
    expect(got.applicable).toEqual(exp.applicable);
    expect(got.conditional).toEqual(exp.conditional);
    expect(got.filler).toEqual(exp.filler);
    expect(got.unlockable.map((u) => [u.offerId, u.gapPaise, u.savingPaise, u.method])).toEqual(
      exp.unlockable.map((u) => [u.offerId, u.gapPaise, u.savingPaise, u.method]),
    );
  });
});
