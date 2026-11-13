// Memory drill: mount and remove the widget 100 times and compare the CDP heap before and after.
// Chromium only (CDP). Fails if the heap grows by more than 5 MB after a forced GC.
import { test, expect } from "@playwright/test";

const CYCLES = 100;
const MAX_GROWTH_BYTES = 5 * 1024 * 1024;

test("widget mount/unmount does not leak heap", async ({ page }) => {
  await page.goto("/?api=mock");
  await page.waitForLoadState("networkidle");
  const cdp = await page.context().newCDPSession(page);

  const heapUsed = async (): Promise<number> => {
    await cdp.send("HeapProfiler.collectGarbage");
    const { usedSize } = (await cdp.send("Runtime.getHeapUsage")) as { usedSize: number };
    return usedSize;
  };

  // Warm up once so lazy module init does not count as growth.
  await page.evaluate(() => {
    const el = document.createElement("dw-offers");
    el.setAttribute("merchant-id", "m1");
    el.setAttribute("cart-value-paise", "180000");
    document.body.append(el);
    el.remove();
  });

  const before = await heapUsed();
  await page.evaluate((cycles) => {
    for (let i = 0; i < cycles; i++) {
      const el = document.createElement("dw-offers");
      el.setAttribute("merchant-id", "m1");
      el.setAttribute("cart-value-paise", "180000");
      document.body.append(el);
      el.remove();
    }
  }, CYCLES);
  const after = await heapUsed();

  const growth = after - before;
  console.log(`heap before=${before} after=${after} growth=${growth} bytes over ${CYCLES} cycles`);
  expect(growth).toBeLessThan(MAX_GROWTH_BYTES);
});
