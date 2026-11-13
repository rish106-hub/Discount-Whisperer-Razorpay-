import { DwOffers } from "./element";

// Registering twice (two script tags) must not throw into the host page.
try {
  if (typeof customElements !== "undefined" && !customElements.get("dw-offers")) {
    customElements.define("dw-offers", DwOffers);
  }
} catch (e) {
  console.debug("[dw-offers] define failed", e);
}

export { DwOffers };
