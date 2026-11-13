/** Fetch-based Razorpay Orders client. Test mode only. Never logs or returns secrets. */

export interface RazorpayCreds {
  RAZORPAY_KEY_ID: string;
  RAZORPAY_KEY_SECRET: string;
}

export interface CreateOrderParams {
  amount: number;
  currency: "INR";
  /** Max 40 chars. */
  receipt: string;
  notes: Record<string, string>;
  /** Razorpay offer ids; only in razorpay_offer mode. */
  offers?: string[];
}

export interface RazorpayOrder {
  id: string;
  amount: number;
  currency: string;
}

/** kind "config": keys missing or not test keys. "upstream": Razorpay failed. Messages carry no secrets. */
export class RazorpayError extends Error {
  constructor(
    readonly kind: "config" | "upstream",
    message: string,
    readonly status?: number,
  ) {
    super(message);
  }
}

export interface ClientOptions {
  fetch?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
  random?: () => number;
  timeoutMs?: number;
}

const ORDERS_URL = "https://api.razorpay.com/v1/orders";
const DEFAULT_TIMEOUT_MS = 8000;
const BACKOFF_BASE_MS = 200;

export function assertTestKeys(creds: RazorpayCreds): void {
  if (!creds.RAZORPAY_KEY_ID?.startsWith("rzp_test_") || !creds.RAZORPAY_KEY_SECRET) {
    throw new RazorpayError("config", "razorpay test keys not configured");
  }
}

/** One attempt. 5xx and network/timeout errors are retryable; 4xx is not. */
async function attempt(
  creds: RazorpayCreds,
  params: CreateOrderParams,
  doFetch: typeof fetch,
  timeoutMs: number,
): Promise<{ order?: RazorpayOrder; retryable: boolean; status?: number }> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await doFetch(ORDERS_URL, {
      method: "POST",
      headers: {
        authorization: `Basic ${btoa(`${creds.RAZORPAY_KEY_ID}:${creds.RAZORPAY_KEY_SECRET}`)}`,
        "content-type": "application/json",
      },
      body: JSON.stringify(params),
      signal: ctrl.signal,
    });
    if (res.status >= 500) return { retryable: true, status: res.status };
    if (!res.ok) return { retryable: false, status: res.status };
    const body = (await res.json()) as Partial<RazorpayOrder>;
    if (typeof body.id !== "string" || typeof body.amount !== "number") return { retryable: false, status: res.status };
    return { order: { id: body.id, amount: body.amount, currency: String(body.currency) }, retryable: false };
  } catch {
    return { retryable: true };
  } finally {
    clearTimeout(timer);
  }
}

export async function createOrder(
  creds: RazorpayCreds,
  params: CreateOrderParams,
  opts: ClientOptions = {},
): Promise<RazorpayOrder> {
  assertTestKeys(creds);
  const doFetch = opts.fetch ?? fetch;
  const sleep = opts.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const random = opts.random ?? Math.random;
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  let last = await attempt(creds, params, doFetch, timeoutMs);
  if (!last.order && last.retryable) {
    await sleep(BACKOFF_BASE_MS + Math.floor(random() * BACKOFF_BASE_MS)); // jittered backoff
    last = await attempt(creds, params, doFetch, timeoutMs);
  }
  if (!last.order) throw new RazorpayError("upstream", "razorpay order creation failed", last.status);
  return last.order;
}
