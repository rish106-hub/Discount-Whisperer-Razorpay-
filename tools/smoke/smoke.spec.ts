// Smoke: demo page -> nudge -> pay. Uses the local demo with the mock ladder (?api=mock) for the widget.
// The Razorpay modal is a manual step (see docs/test-payments.md); this spec stops at the order result.
import { test, expect } from "@playwright/test";

test.describe("demo smoke", () => {
  test("Rs 1,800 cart shows the gamcha nudge", async ({ page }) => {
    await page.goto("/?api=mock");
    await expect(page.getByTestId("cart-value")).toContainText("1,800");
    await expect(page.locator("dw-offers").first()).toBeAttached();
    // The nudge is inside the widget's shadow DOM. Playwright pierces open shadow roots with getByTestId.
    await expect(page.getByTestId("dw-nudge")).toContainText(/gamcha/i);
  });

  // T7: cart-value is display text, so raise the cart with qty-plus (2 sarees = Rs 3,600, above O2's Rs 2,499 min).
  // Needs the real local API (not ?api=mock). Razorpay's CDN is blocked so the test makes no external calls.
  test("HDFC_CC at Rs 3,600 creates a server-validated order", async ({ page }) => {
    await page.route("https://checkout.razorpay.com/**", (r) => r.abort());
    await page.goto("/");
    await page.getByTestId("qty-plus").click();
    await expect(page.getByTestId("cart-value")).toContainText("3,600");
    await page.getByTestId("pay-method").selectOption("HDFC_CC");
    const order = page.waitForResponse((r) => r.url().includes("/v1/payments/order"));
    await page.getByTestId("pay-button").click();
    const res = await order;
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.orderId).toMatch(/^order_/);
    expect(body.amountPaise + body.expectedSavingPaise).toBe(360000); // charge + saving = cart
    // With the CDN blocked the demo reports checkout.js failing after the order; either message is fine here.
    await expect(page.getByTestId("order-result")).toContainText(new RegExp(`${body.orderId}|checkout\\.js`), { timeout: 15_000 });
  });
});
