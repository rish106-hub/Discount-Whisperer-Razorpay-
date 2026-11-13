import type { Filler } from "./filler";
import type { LookupInput, LookupResult } from "./lookup";
import type { Offer } from "./offer";
import type { ValidateInput, ValidateResult } from "./validate";

export interface GoldenSet {
  merchantId: string;
  offers: Offer[];
  fillers: Filler[];
}

/** Lookup cases: build the ladder with nowMs = input.nowMs, then lookup. Compare score with 1e-9 tolerance. */
export interface GoldenLookupCase {
  name: string;
  kind: "lookup";
  set: string;
  input: LookupInput;
  expected: LookupResult;
}

/** Validate cases run validateSelection(set.offers, input). */
export interface GoldenValidateCase {
  name: string;
  kind: "validate";
  set: string;
  input: ValidateInput;
  expected: ValidateResult;
}

export interface GoldenFile {
  description: string;
  sets: Record<string, GoldenSet>;
  cases: Array<GoldenLookupCase | GoldenValidateCase>;
}
