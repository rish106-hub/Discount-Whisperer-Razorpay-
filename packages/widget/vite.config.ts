import { defineConfig } from "vite";

// Single-file ES module: dist/dw-offers.js (preact + offer-core inlined, no chunks).
export default defineConfig({
  build: {
    target: "es2020",
    outDir: "dist",
    emptyOutDir: true,
    minify: true,
    lib: { entry: "src/index.ts", formats: ["es"], fileName: () => "dw-offers.js" },
    rollupOptions: { output: { inlineDynamicImports: true } },
  },
});
