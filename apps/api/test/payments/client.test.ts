import { describe, expect, it, vi } from "vitest";
import { createOrder, RazorpayError } from "../../src/razorpay/client";

const creds = { RAZORPAY_KEY_ID: "rzp_test_abc", RAZORPAY_KEY_SECRET: "s3cr3t_fake" };
const params = { amount: 1000, currency: "INR" as const, receipt: "dw_m1_1", notes: { merchantId: "m1" } };
const ok = () => new Response(JSON.stringify({ id: "order_1", amount: 1000, currency: "INR" }), { status: 200 });
const opts = (f: typeof fetch) => ({ fetch: f, sleep: async () => {}, random: () => 0 });

describe("razorpay client", () => {
  it("refuses non rzp_test_ keys without calling fetch", async () => {
    const f = vi.fn();
    await expect(createOrder({ ...creds, RAZORPAY_KEY_ID: "rzp_live_x" }, params, opts(f as never))).rejects.toMatchObject({
      kind: "config",
    });
    expect(f).not.toHaveBeenCalled();
  });
  it("sends Basic auth and JSON body", async () => {
    const f = vi.fn(async () => ok());
    await createOrder(creds, params, opts(f as never));
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.razorpay.com/v1/orders");
    expect((init.headers as Record<string, string>).authorization).toBe(`Basic ${btoa("rzp_test_abc:s3cr3t_fake")}`);
    expect(JSON.parse(init.body as string)).toEqual(params);
  });
  it("retries once on 5xx then succeeds", async () => {
    const f = vi.fn().mockResolvedValueOnce(new Response("x", { status: 500 })).mockResolvedValueOnce(ok());
    expect((await createOrder(creds, params, opts(f as never))).id).toBe("order_1");
    expect(f).toHaveBeenCalledTimes(2);
  });
  it("retries once on network error, then fails after the second", async () => {
    const f = vi.fn().mockRejectedValue(new TypeError("net"));
    await expect(createOrder(creds, params, opts(f as never))).rejects.toBeInstanceOf(RazorpayError);
    expect(f).toHaveBeenCalledTimes(2);
  });
  it("never retries 4xx", async () => {
    const f = vi.fn().mockResolvedValue(new Response("bad", { status: 400 }));
    await expect(createOrder(creds, params, opts(f as never))).rejects.toMatchObject({ kind: "upstream", status: 400 });
    expect(f).toHaveBeenCalledTimes(1);
  });
  it("aborts on timeout and error text has no secrets", async () => {
    const f = vi.fn((_u: string, init: RequestInit) => new Promise<Response>((_r, rej) => {
      init.signal?.addEventListener("abort", () => rej(new DOMException("aborted", "AbortError")));
    }));
    const err = await createOrder(creds, params, { ...opts(f as never), timeoutMs: 5 }).catch((e: Error) => e);
    expect(f).toHaveBeenCalledTimes(2);
    expect(String((err as Error).message)).not.toContain("s3cr3t_fake");
  });
});
