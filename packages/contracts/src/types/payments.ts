export type PaymentStatus = "created" | "verified" | "failed";
export type PaymentMode = "razorpay_offer" | "server_discount";

/** camelCase view of the `payments` row. */
export interface PaymentRecord {
  id: number;
  merchantId: string;
  offerId: string | null;
  razorpayOrderId: string;
  razorpayPaymentId: string | null;
  /** Amount sent to the Razorpay order. */
  amountPaise: number;
  /** Cart value before any discount. Added so the amount_match drill can check razorpay_offer mode. */
  cartPaise: number;
  expectedSavingPaise: number;
  mode: PaymentMode;
  status: PaymentStatus;
  createdAt: number;
  updatedAt: number;
}

export type NewPayment = Omit<PaymentRecord, "id" | "razorpayPaymentId" | "status" | "createdAt" | "updatedAt">;

export interface PaymentUpdate {
  status: PaymentStatus;
  razorpayPaymentId?: string;
}
