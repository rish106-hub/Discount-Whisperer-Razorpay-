// STAND-IN typing until T1's @dw/offer-core is merged (T7: delete this file, offer-core-standin.ts and the alias).
declare module "@dw/offer-core" {
  import type { Offer, ValidateInput, ValidateResult } from "@dw/contracts";
  export function validateSelection(offers: readonly Offer[], input: ValidateInput): ValidateResult;
}
