import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const realCore = fileURLToPath(new URL("../offer-core/src/index.ts", import.meta.url));
const standin = fileURLToPath(new URL("./test/offer-core-standin.ts", import.meta.url));

export default defineConfig({
  resolve: {
    // Use the real @dw/offer-core when it exists (after the T1 merge); otherwise the labelled test stand-in.
    alias: existsSync(realCore) ? {} : { "@dw/offer-core": standin },
  },
  test: { environment: "happy-dom", include: ["test/**/*.test.ts"] },
});
