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

  test("HDFC_CC at Rs 2,600 creates an order", async ({ page }) => {
    await page.goto("/?api=mock");
    await page.getByTestId("pay-method").selectOption("HDFC_CC");
    // Assumes cart-value is an input. If it is a span, switch this to a click-based setter.
    await page.getByTestId("cart-value").fill("2600");
    await page.getByTestId("pay-button").click();
    await expect(page.getByTestId("order-result")).toContainText(/order/i, { timeout: 15_000 });
  });
});
