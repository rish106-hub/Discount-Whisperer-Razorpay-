import type { EventRequest, EventType } from "@dw/contracts";

/** 16 random chars from [A-Za-z0-9_-]; server pattern is {8,64}. */
export function newSessionId(): string {
  const c = (globalThis as { crypto?: Crypto }).crypto;
  if (c?.getRandomValues) {
    const b = c.getRandomValues(new Uint8Array(16));
    return Array.from(b, (x) => (x % 36).toString(36)).join("");
  }
  return Math.random().toString(36).slice(2, 12).padEnd(10, "0");
}

export interface EventCtx {
  apiBase: string;
  merchantId: string;
  sessionId: string;
}

/**
 * Fire and forget. sendBeacon with a string body goes out as text/plain (no CORS preflight);
 * fall back to fetch keepalive. Never throws.
 */
export function sendEvent(ctx: EventCtx, type: EventType, cartPaise: number, offerId: string | null = null): void {
  try {
    const body: EventRequest = { merchantId: ctx.merchantId, sessionId: ctx.sessionId, type, cartPaise, offerId };
    const json = JSON.stringify(body);
    const url = `${ctx.apiBase}/v1/events`;
    if (typeof navigator !== "undefined" && typeof navigator.sendBeacon === "function" && navigator.sendBeacon(url, json)) {
      return;
    }
    void fetch(url, { method: "POST", body: json, keepalive: true, headers: { "content-type": "text/plain" } }).catch(
      () => {},
    );
  } catch {
    /* analytics must never hurt the page */
  }
}
