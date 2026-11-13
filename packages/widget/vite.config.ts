import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

// DW_STANDIN=1 builds against the test stand-in (only to estimate size before T1 merges). Never for release.
const alias: Record<string, string> =
  process.env.DW_STANDIN === "1"
    ? { "@dw/offer-core": fileURLToPath(new URL("./test/offer-core-standin.ts", import.meta.url)) }
    : {};

// Single-file ES module: dist/dw-offers.js (preact + offer-core inlined, no chunks).
export default defineConfig({
  resolve: { alias },
  build: {
    target: "es2020",
    outDir: "dist",
    emptyOutDir: true,
    minify: true,
    lib: { entry: "src/index.ts", formats: ["es"], fileName: () => "dw-offers.js" },
    rollupOptions: { output: { inlineDynamicImports: true } },
  },
});
