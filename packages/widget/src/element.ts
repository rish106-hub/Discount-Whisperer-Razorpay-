import type { Filler, Ladder, LookupResult } from "@dw/contracts";
import { lookup } from "@dw/offer-core";
import { h, render } from "preact";
import { fetchLadder, trimBase } from "./client";
import { newSessionId, sendEvent } from "./events";
import { CSS, View } from "./view";

const MAX_CART_PAISE = 2_000_000_000; // mirrors @dw/contracts MAX_CART_PAISE

/** Ladders already fetched this page load: one request per (api, merchant), shared by every <dw-offers>. */
const ladderCache = new Map<string, Ladder>();

const debug = (msg: string, e?: unknown) => {
  try {
    console.debug(`[dw-offers] ${msg}`, e instanceof Error ? e.message : (e ?? ""));
  } catch {
    /* console may be missing */
  }
};

const parseCart = (v: unknown): number | null =>
  typeof v === "number" && Number.isSafeInteger(v) && v >= 0 && v <= MAX_CART_PAISE ? v : null;

export class DwOffers extends HTMLElement {
  static observedAttributes = ["merchant-id", "cart-value-paise", "api-base"];

  private mount: HTMLElement | null = null;
  private io: IntersectionObserver | null = null;
  private ctl: AbortController | null = null;
  private ladder: Ladder | null = null;
  private cart: number | null = null;
  private method: string | null = null;
  private visible = false;
  private loading = false;
  private seenSent = false;
  private connected = false;
  private readonly sessionId = newSessionId();

  private readonly onCart = (e: Event) => {
    try {
      const d = (e as CustomEvent<{ cartPaise?: unknown; method?: unknown }>).detail;
      if (!d) return;
      const c = parseCart(d.cartPaise);
      if (c === null) return;
      this.cart = c;
      if (d.method === null || typeof d.method === "string") this.method = d.method;
      this.paint();
    } catch (err) {
      this.fail("dw:cart handler", err);
    }
  };

  connectedCallback(): void {
    try {
      this.connected = true;
      if (!this.shadowRoot) {
        const root = this.attachShadow({ mode: "open" });
        const style = document.createElement("style");
        style.textContent = CSS;
        this.mount = document.createElement("div");
        root.append(style, this.mount);
      }
      this.cart = parseCart(Number(this.getAttribute("cart-value-paise")));
      window.addEventListener("dw:cart", this.onCart);
      if (typeof IntersectionObserver === "function") {
        this.io = new IntersectionObserver((entries) => {
          if (entries.some((en) => en.isIntersecting)) {
            this.io?.disconnect();
            this.io = null;
            this.visible = true;
            void this.load();
          }
        });
        this.io.observe(this);
      } else {
        this.visible = true;
        void this.load();
      }
    } catch (e) {
      this.fail("connect", e);
    }
  }

  disconnectedCallback(): void {
    this.connected = false;
    window.removeEventListener("dw:cart", this.onCart);
    this.io?.disconnect();
    this.io = null;
    this.ctl?.abort();
    this.ctl = null;
    this.loading = false;
    this.visible = false;
    try {
      if (this.mount) render(null, this.mount);
    } catch {
      /* already gone */
    }
  }

  attributeChangedCallback(name: string, oldV: string | null, newV: string | null): void {
    if (!this.connected || oldV === newV) return;
    try {
      if (name === "cart-value-paise") {
        this.cart = parseCart(Number(newV));
        this.paint();
      } else {
        // merchant or api changed: drop the old ladder and refetch if we are on screen
        this.ladder = null;
        this.ctl?.abort();
        this.loading = false;
        this.paint();
        if (this.visible) void this.load();
      }
    } catch (e) {
      this.fail("attribute change", e);
    }
  }

  private get merchantId(): string {
    return this.getAttribute("merchant-id") ?? "";
  }
  /** Default: same origin. */
  private get apiBase(): string {
    return trimBase(this.getAttribute("api-base") ?? "");
  }
  private get cacheKey(): string {
    return `${this.apiBase}|${this.merchantId}`;
  }

  private async load(): Promise<void> {
    if (this.loading || !this.merchantId) return;
    const cached = ladderCache.get(this.cacheKey);
    if (cached) {
      this.ladder = cached;
      this.paint();
      return;
    }
    this.loading = true;
    this.ctl = new AbortController();
    const ctl = this.ctl;
    const key = this.cacheKey;
    const ladder = await fetchLadder(this.apiBase, this.merchantId, ctl.signal);
    if (ctl.signal.aborted || !this.connected) return; // disconnected or superseded
    this.loading = false;
    if (!ladder) return this.fail("ladder unavailable");
    ladderCache.set(key, ladder);
    this.ladder = ladder;
    this.paint();
  }

  private fail(msg: string, e?: unknown): void {
    debug(msg, e);
    this.ladder = null;
    this.clear();
  }

  private clear(): void {
    try {
      if (this.mount) render(null, this.mount);
    } catch {
      /* ignore */
    }
  }

  /** Recompute + render. Any throw, or a disabled ladder, renders nothing. */
  private paint(): void {
    const ladder = this.ladder;
    const cart = this.cart;
    if (!this.mount || !ladder || ladder.disabled || cart === null) return this.clear();
    try {
      const result: LookupResult = lookup(ladder, { cartPaise: cart, method: this.method, nowMs: Date.now() });
      const vnode = h(View, {
        ladder,
        result,
        onNudge: () => this.track("nudge_click", result.unlockable[0]?.offerId ?? null),
        onAdd: (f: Filler) => this.add(f),
      });
      render(vnode, this.mount);
      if (!this.seenSent && this.mount.firstChild) {
        this.seenSent = true;
        this.track("seen", null);
      }
    } catch (e) {
      this.fail("render", e);
    }
  }

  private track(type: "seen" | "nudge_click" | "addon", offerId: string | null): void {
    sendEvent(
      { apiBase: this.apiBase, merchantId: this.merchantId, sessionId: this.sessionId },
      type,
      this.cart ?? 0,
      offerId,
    );
  }

  private add(f: Filler): void {
    this.track("addon", this.ladder ? (this.currentTopOffer() ?? null) : null);
    this.dispatchEvent(
      new CustomEvent("dw:add", { detail: { sku: f.sku, pricePaise: f.pricePaise }, bubbles: true, composed: true }),
    );
  }

  private currentTopOffer(): string | undefined {
    if (!this.ladder || this.cart === null) return undefined;
    return lookup(this.ladder, { cartPaise: this.cart, method: this.method, nowMs: Date.now() }).unlockable[0]?.offerId;
  }
}
