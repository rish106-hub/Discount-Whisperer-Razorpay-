export type EventType = "seen" | "nudge_click" | "addon" | "checkout" | "payment_verified";

export interface EventRequest {
  merchantId: string;
  sessionId: string;
  type: EventType;
  cartPaise: number;
  offerId?: string | null;
}
