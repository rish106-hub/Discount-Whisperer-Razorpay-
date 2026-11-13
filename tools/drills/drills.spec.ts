/**
 * T7 failure drills against the local Worker. Run one group at a time:
 *   DRILL=normal  -> api_down, kill_switch_off baseline
 *   DRILL=slow    -> slow_api (Worker started with DEBUG_SLOW_LADDER_MS=2000)
 *   DRILL=killed  -> kill_switch (m1 ladder in KV has disabled: true)
 */
import { expect, test, type Page } from "@playwright/test";

const DRILL = process.env.DRILL ?? "normal";

async function widgetState(page: Page) {
  return page.evaluate(() => {
    const el = document.querySelector("dw-offers");
    return {
      rendered: !!el?.shadowRoot?.querySelector("[data-testid=dw-root]"),
      height: el?.getBoundingClientRect().height ?? -1,
    };
  });
}

async function pageStillWorks(page: Page) {
  await expect(page.getByTestId("pay-button")).toBeVisible();
  await page.getByTestId("qty-plus").click();
  await expect(page.getByTestId("cart-value")).toContainText("3,600");
}

test.describe("normal", () => {
  test.skip(DRILL !== "normal");

  test("baseline: widget renders the gamcha nudge", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByTestId("dw-nudge")).toContainText(/gamcha/i, { timeout: 5_000 });
  });

  test("api_down: dead API -> widget renders nothing, page works", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(String(e)));
    const ladderCalls: string[] = [];
    page.on("request", (r) => r.url().includes("/v1/ladder/") && ladderCalls.push(r.url()));
    await page.goto("/?api=http://127.0.0.1:9");
    await page.waitForTimeout(1_500);
    expect(ladderCalls.some((u) => u.startsWith("http://127.0.0.1:9/"))).toBe(true); // really hit the dead host
    expect(await widgetState(page)).toEqual({ rendered: false, height: 0 });
    await pageStillWorks(page);
    expect(errors).toEqual([]);
  });
});

test.describe("slow", () => {
  test.skip(DRILL !== "slow");

  test("slow_api: 2 s ladder -> widget gives up at 800 ms and never renders", async ({ page }) => {
    const started = Date.now();
    let aborted = 0;
    page.on("requestfailed", (r) => r.url().includes("/v1/ladder/") && (aborted = Date.now() - started));
    await page.goto("/");
    await page.waitForTimeout(3_500); // past the 2 s server delay
    expect(await widgetState(page)).toEqual({ rendered: false, height: 0 });
    expect(aborted).toBeGreaterThan(0);
    console.log(`ladder request aborted ~${aborted} ms after navigation start`);
    await pageStillWorks(page);
  });
});

test.describe("killed", () => {
  test.skip(DRILL !== "killed");

  test("kill_switch: disabled ladder -> widget renders nothing", async ({ page }) => {
    const res = page.waitForResponse((r) => r.url().includes("/v1/ladder/m1"));
    await page.goto("/");
    const body = await (await res).json();
    expect(body.disabled).toBe(true);
    await page.waitForTimeout(500);
    expect(await widgetState(page)).toEqual({ rendered: false, height: 0 });
    await pageStillWorks(page);
  });
});
