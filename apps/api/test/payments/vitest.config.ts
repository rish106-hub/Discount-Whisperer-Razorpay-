import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const here = dirname(fileURLToPath(import.meta.url));

// T4-local config. Aliases @dw/offer-core to a stand-in until T1 merges (T7 removes the alias).
export default defineConfig({
  resolve: { alias: { "@dw/offer-core": resolve(here, "offer-core-standin.ts") } },
  test: { include: ["test/payments/**/*.test.ts"], root: resolve(here, "../..") },
});
