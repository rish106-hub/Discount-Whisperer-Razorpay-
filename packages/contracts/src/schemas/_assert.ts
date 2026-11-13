/**
 * Compile-time proof that every zod schema's output equals its plain TypeScript type.
 * If a type and its schema drift, `pnpm typecheck` fails here.
 */
import type { z } from "zod";
import type * as T from "../index";
import type * as S from "./index";

type Equals<A, B> = (<X>() => X extends A ? 1 : 2) extends <X>() => X extends B ? 1 : 2 ? true : false;
type Assert<_T extends true> = never;

export type _Checks = [
  Assert<Equals<z.output<typeof S.OfferSchema>, T.Offer>>,
  Assert<Equals<z.output<typeof S.NewOfferSchema>, T.NewOffer>>,
  Assert<Equals<z.output<typeof S.OfferPatchSchema>, T.OfferPatch>>,
  Assert<Equals<z.output<typeof S.FillerSchema>, T.Filler>>,
  Assert<Equals<z.output<typeof S.PutFillersSchema>, T.PutFillersRequest>>,
  Assert<Equals<z.output<typeof S.LadderOfferSchema>, T.LadderOffer>>,
  Assert<Equals<z.output<typeof S.LadderSchema>, T.Ladder>>,
  Assert<Equals<z.output<typeof S.LookupInputSchema>, T.LookupInput>>,
  Assert<Equals<z.output<typeof S.LookupResultSchema>, T.LookupResult>>,
  Assert<Equals<z.output<typeof S.ValidateInputSchema>, T.ValidateInput>>,
  Assert<Equals<z.output<typeof S.ValidateResultSchema>, T.ValidateResult>>,
  Assert<Equals<z.output<typeof S.EventRequestSchema>, T.EventRequest>>,
  Assert<Equals<z.output<typeof S.PaymentRecordSchema>, T.PaymentRecord>>,
  Assert<Equals<z.output<typeof S.ErrorBodySchema>, T.ErrorBody>>,
  Assert<Equals<z.output<typeof S.InternalRebuildRequestSchema>, T.InternalRebuildRequest>>,
  Assert<Equals<z.output<typeof S.CheckoutValidateRequestSchema>, T.CheckoutValidateRequest>>,
  Assert<Equals<z.output<typeof S.PaymentOrderRequestSchema>, T.PaymentOrderRequest>>,
  Assert<Equals<z.output<typeof S.PaymentOrderResponseSchema>, T.PaymentOrderResponse>>,
  Assert<Equals<z.output<typeof S.PaymentVerifyRequestSchema>, T.PaymentVerifyRequest>>,
];
