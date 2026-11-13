import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { MAX_CART_PAISE } from "@dw/contracts";
import type { Ladder } from "@dw/contracts";
import "../src/index";
import { makeLadder } from "./helpers";

// ---- IntersectionObserver stub: nothing loads until reveal() ----
const observers: StubIO[] = [];
class StubIO {
  disconnected = false;
  constructor(private cb: (e: { isIntersecting: boolean }[]) => void) {
    observers.push(this);
  }
  observe() {}
  unobserve() {}
  takeRecords() {
    return [];
  }
  disconnect() {
    this.disconnected = true;
  }
  fire() {
    this.cb([{ isIntersecting: true }]);
  }
}
const reveal = () => observers.filter((o) => !o.disconnected).forEach((o) => o.fire());

let n = 0;
let fetchMock: ReturnType<typeof vi.fn>;
let beacon: ReturnType<typeof vi.fn>;
let debug: ReturnType<typeof vi.spyOn>;

const jsonRes = (body: unknown, status = 200) =>
  Promise.resolve(new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } }));
const flush = async () => {
  for (let i = 0; i < 5; i++) await Promise.resolve();
};

/** Mount a fresh <dw-offers>. Each test gets its own api-base so the per-page ladder cache never leaks. */
function mount(attrs: { cart?: number | string; api?: string } = {}) {
  const api = attrs.api ?? `https://api.test/${++n}`;
  const el = document.createElement("dw-offers");
  el.setAttribute("merchant-id", "m1");
  el.setAttribute("cart-value-paise", String(attrs.cart ?? 180000));
  el.setAttribute("api-base", api);
  document.body.append(el);
  return { el, api };
}
const q = (el: Element, id: string) => el.shadowRoot!.querySelector(`[data-testid="${id}"]`) as HTMLElement | null;
const sentEvents = () => beacon.mock.calls.map((c) => JSON.parse(c[1] as string));

beforeEach(() => {
  observers.length = 0;
  vi.stubGlobal("IntersectionObserver", StubIO);
  fetchMock = vi.fn(() => jsonRes(makeLadder()));
  vi.stubGlobal("fetch", fetchMock);
  beacon = vi.fn(() => true);
  Object.defineProperty(navigator, "sendBeacon", { value: beacon, configurable: true, writable: true });
  debug = vi.spyOn(console, "debug").mockImplementation(() => {});
});
afterEach(() => {
  document.body.innerHTML = "";
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("render", () => {
  it("Rs 1,800, no method: conditional UPI cashback, nudge, gamcha filler", async () => {
    const { el } = mount();
    reveal();
    await flush();
    expect(q(el, "dw-root")).not.toBeNull();
    expect(q(el, "dw-applicable")).toBeNull();
    expect(q(el, "dw-conditional")!.textContent).toContain("UPI");
    expect(q(el, "dw-conditional")!.textContent).toContain("Rs 90");
    const nudge = q(el, "dw-nudge")!.textContent!;
    expect(nudge).toContain("Rs 199");
    expect(nudge).toContain("10% off");
    expect(nudge).toContain("Add a gamcha (Rs 199)");
    expect(q(el, "dw-add")).not.toBeNull();
  });

  it("fetches the ladder from {api}/v1/ladder/{merchant}", async () => {
    const { el, api } = mount();
    reveal();
    await flush();
    expect(String(fetchMock.mock.calls[0]![0])).toBe(`${api}/v1/ladder/m1`);
    expect(el.shadowRoot).not.toBeNull();
  });

  it("dw:cart updates the view (Rs 2,600 + HDFC_CC -> applicable O1+O2, no nudge)", async () => {
    const { el } = mount();
    reveal();
    await flush();
    window.dispatchEvent(new CustomEvent("dw:cart", { detail: { cartPaise: 260000, method: "HDFC_CC" } }));
    const app = q(el, "dw-applicable")!.textContent!;
    expect(app).toContain("Rs 260");
    expect(app).toContain("Rs 250");
    expect(q(el, "dw-conditional")).toBeNull();
    expect(q(el, "dw-nudge")).toBeNull();
  });

  it("method omitted in dw:cart keeps the last method", async () => {
    const { el } = mount();
    reveal();
    await flush();
    window.dispatchEvent(new CustomEvent("dw:cart", { detail: { cartPaise: 260000, method: "HDFC_CC" } }));
    window.dispatchEvent(new CustomEvent("dw:cart", { detail: { cartPaise: 270000 } }));
    expect(q(el, "dw-applicable")!.textContent).toContain("Rs 250");
  });

  it("cart-value-paise attribute change re-renders", async () => {
    const { el } = mount();
    reveal();
    await flush();
    el.setAttribute("cart-value-paise", "199900");
    expect(q(el, "dw-applicable")!.textContent).toContain("save Rs 199.90");
  });

  it("ignores junk dw:cart (negative, float, huge, missing)", async () => {
    const { el } = mount();
    reveal();
    await flush();
    const before = q(el, "dw-root")!.textContent;
    for (const cartPaise of [-1, 1.5, MAX_CART_PAISE + 1, "x", undefined]) {
      window.dispatchEvent(new CustomEvent("dw:cart", { detail: { cartPaise } }));
    }
    window.dispatchEvent(new CustomEvent("dw:cart"));
    expect(q(el, "dw-root")!.textContent).toBe(before);
  });
});

describe("fails closed", () => {
  it("fetch rejects -> nothing rendered, one console.debug", async () => {
    fetchMock.mockImplementation(() => Promise.reject(new TypeError("net down")));
    const { el } = mount();
    reveal();
    await flush();
    expect(q(el, "dw-root")).toBeNull();
    expect(debug).toHaveBeenCalledTimes(1);
  });

  it("HTTP 404/500 -> nothing", async () => {
    for (const status of [404, 500]) {
      fetchMock.mockImplementation(() => jsonRes({ error: "x" }, status));
      const { el } = mount();
      reveal();
      await flush();
      expect(q(el, "dw-root")).toBeNull();
    }
  });

  it("malformed JSON and wrong shape -> nothing", async () => {
    fetchMock.mockImplementationOnce(() => Promise.resolve(new Response("<html>", { status: 200 })));
    const a = mount();
    reveal();
    await flush();
    expect(q(a.el, "dw-root")).toBeNull();
    fetchMock.mockImplementationOnce(() => jsonRes({ v: 2, offers: [] }));
    const b = mount();
    reveal();
    await flush();
    expect(q(b.el, "dw-root")).toBeNull();
  });

  it("800 ms timeout -> nothing, request aborted, even if fetch ignores its signal", async () => {
    vi.useFakeTimers();
    let signal: AbortSignal | undefined;
    fetchMock.mockImplementation((_u: string, init: RequestInit) => {
      signal = init.signal as AbortSignal;
      return new Promise(() => {}); // never settles
    });
    const { el } = mount();
    reveal();
    await vi.advanceTimersByTimeAsync(799);
    expect(q(el, "dw-root")).toBeNull();
    expect(signal!.aborted).toBe(false);
    await vi.advanceTimersByTimeAsync(2);
    expect(signal!.aborted).toBe(true);
    expect(q(el, "dw-root")).toBeNull();
    expect(debug).toHaveBeenCalledTimes(1);
  });

  it("a ladder arriving just under 800 ms still renders", async () => {
    vi.useFakeTimers();
    fetchMock.mockImplementation(() => new Promise((r) => setTimeout(() => r(new Response(JSON.stringify(makeLadder()))), 700)));
    const { el } = mount();
    reveal();
    await vi.advanceTimersByTimeAsync(750);
    expect(q(el, "dw-root")).not.toBeNull();
  });

  it("kill switch: disabled ladder renders nothing and sends no events", async () => {
    fetchMock.mockImplementation(() => jsonRes(makeLadder(undefined, { disabled: true })));
    const { el } = mount();
    reveal();
    await flush();
    expect(q(el, "dw-root")).toBeNull();
    expect(beacon).not.toHaveBeenCalled();
  });

  it("invalid cart attribute renders nothing; later valid dw:cart renders", async () => {
    const { el } = mount({ cart: "abc" });
    reveal();
    await flush();
    expect(q(el, "dw-root")).toBeNull();
    window.dispatchEvent(new CustomEvent("dw:cart", { detail: { cartPaise: 180000 } }));
    expect(q(el, "dw-root")).not.toBeNull();
  });

  it("offer-core throwing never escapes into the host page", async () => {
    const bad = makeLadder();
    (bad as { offers: unknown }).offers = [{ id: "x" }]; // lookup will choke or yield nothing
    fetchMock.mockImplementation(() => jsonRes({ ...bad, mins: [0] }));
    mount();
    reveal();
    await flush();
    expect(() => window.dispatchEvent(new CustomEvent("dw:cart", { detail: { cartPaise: 5 } }))).not.toThrow();
  });
});

describe("loading", () => {
  it("does not fetch until the element is visible", async () => {
    mount();
    await flush();
    expect(fetchMock).not.toHaveBeenCalled();
    reveal();
    await flush();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("one request per page for several elements of the same merchant", async () => {
    const api = "https://api.test/shared";
    const a = mount({ api });
    await flush();
    reveal();
    await flush();
    const b = mount({ api });
    reveal();
    await flush();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(q(a.el, "dw-root")).not.toBeNull();
    expect(q(b.el, "dw-root")).not.toBeNull();
  });
});

describe("no leaks", () => {
  it("removal: removes dw:cart listener, disconnects observer, aborts in-flight fetch", async () => {
    const add = vi.spyOn(window, "addEventListener");
    const remove = vi.spyOn(window, "removeEventListener");
    let signal: AbortSignal | undefined;
    fetchMock.mockImplementation((_u: string, init: RequestInit) => {
      signal = init.signal as AbortSignal;
      return new Promise(() => {});
    });
    const { el } = mount();
    const cartAdds = add.mock.calls.filter((c) => c[0] === "dw:cart");
    expect(cartAdds).toHaveLength(1);
    reveal(); // fetch in flight
    el.remove();
    expect(remove.mock.calls.filter((c) => c[0] === "dw:cart")).toHaveLength(1);
    expect(remove.mock.calls.find((c) => c[0] === "dw:cart")![1]).toBe(cartAdds[0]![1]);
    expect(signal!.aborted).toBe(true);
    expect(observers.every((o) => o.disconnected)).toBe(true);
  });

  it("removed before visible: observer disconnected, never fetches", async () => {
    const { el } = mount();
    el.remove();
    expect(observers.every((o) => o.disconnected)).toBe(true);
    await flush();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("after removal a dw:cart event does nothing and a late ladder is dropped", async () => {
    let resolve!: (r: Response) => void;
    fetchMock.mockImplementation(() => new Promise<Response>((r) => (resolve = r)));
    const { el } = mount();
    reveal();
    el.remove();
    resolve(new Response(JSON.stringify(makeLadder())));
    await flush();
    window.dispatchEvent(new CustomEvent("dw:cart", { detail: { cartPaise: 260000, method: "HDFC_CC" } }));
    expect(el.shadowRoot!.querySelector('[data-testid="dw-root"]')).toBeNull();
    expect(beacon).not.toHaveBeenCalled();
  });

  it("re-attaching works (moved in the DOM)", async () => {
    const { el } = mount();
    reveal();
    await flush();
    document.body.append(el); // move => disconnect + connect
    reveal();
    await flush();
    expect(q(el, "dw-root")).not.toBeNull();
  });
});

describe("events + dw:add", () => {
  it("seen is sent once, as text/plain JSON beacon, only when rendered with data", async () => {
    const { el, api } = mount();
    reveal();
    await flush();
    window.dispatchEvent(new CustomEvent("dw:cart", { detail: { cartPaise: 190000 } }));
    window.dispatchEvent(new CustomEvent("dw:cart", { detail: { cartPaise: 195000 } }));
    const seen = sentEvents().filter((e) => e.type === "seen");
    expect(seen).toHaveLength(1);
    expect(beacon.mock.calls[0]![0]).toBe(`${api}/v1/events`);
    expect(typeof beacon.mock.calls[0]![1]).toBe("string"); // string body => text/plain, no preflight
    expect(seen[0]).toMatchObject({ merchantId: "m1", type: "seen", cartPaise: 180000, offerId: null });
    expect(seen[0].sessionId).toMatch(/^[A-Za-z0-9_-]{8,64}$/);
    expect(el).toBeTruthy();
  });

  it("clicking Add: dw:add {sku, pricePaise} + addon event, no nudge_click", async () => {
    const { el } = mount();
    reveal();
    await flush();
    const got: unknown[] = [];
    window.addEventListener("dw:add", (e) => got.push((e as CustomEvent).detail));
    q(el, "dw-add")!.click();
    expect(got).toEqual([{ sku: "gamcha", pricePaise: 19900 }]);
    const types = sentEvents().map((e) => e.type);
    expect(types).toContain("addon");
    expect(types).not.toContain("nudge_click");
  });

  it("clicking the nudge sends nudge_click with the offer id", async () => {
    const { el } = mount();
    reveal();
    await flush();
    q(el, "dw-nudge")!.click();
    expect(sentEvents().find((e) => e.type === "nudge_click")).toMatchObject({ offerId: "m1_O1", cartPaise: 180000 });
  });

  it("falls back to fetch keepalive when sendBeacon is missing or refuses", async () => {
    beacon.mockImplementation(() => false);
    const { el, api } = mount();
    reveal();
    await flush();
    const call = fetchMock.mock.calls.find((c) => String(c[0]) === `${api}/v1/events`)!;
    expect(call[1]).toMatchObject({ method: "POST", keepalive: true });
    expect((call[1] as RequestInit).headers).toMatchObject({ "content-type": "text/plain" });
    expect(el).toBeTruthy();
  });

  it("a failing event send never throws", async () => {
    beacon.mockImplementation(() => {
      throw new Error("boom");
    });
    fetchMock.mockImplementation((u: string) => (u.includes("/events") ? Promise.reject(new Error("x")) : jsonRes(makeLadder())));
    const { el } = mount();
    reveal();
    await flush();
    expect(() => q(el, "dw-add")!.click()).not.toThrow();
  });
});

describe("a11y + hygiene", () => {
  it("Add is a real <button type=button> with an accessible name", async () => {
    const { el } = mount();
    reveal();
    await flush();
    const b = q(el, "dw-add")!;
    expect(b.tagName).toBe("BUTTON");
    expect(b.getAttribute("type")).toBe("button");
    expect(b.getAttribute("aria-label")).toBe("Add Gamcha to cart");
  });

  it("src never imports zod or supabase-js", () => {
    const dir = resolve(process.cwd(), "src") + "/";
    for (const f of readdirSync(dir)) {
      expect(readFileSync(dir + f, "utf8"), f).not.toMatch(/from\s+["'](zod|@supabase\/|@dw\/contracts\/schemas)/);
    }
  });

  it("src only type-imports @dw/contracts", () => {
    const dir = resolve(process.cwd(), "src") + "/";
    for (const f of readdirSync(dir)) {
      const bad = readFileSync(dir + f, "utf8")
        .split("\n")
        .filter((l) => /from\s+["']@dw\/contracts["']/.test(l) && !/^\s*import type/.test(l));
      expect(bad, f).toEqual([]);
    }
  });
});

// keep a reference so unused-type lint stays quiet
export type _L = Ladder;
