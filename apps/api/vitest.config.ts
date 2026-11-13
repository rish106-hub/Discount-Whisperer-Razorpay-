import { defineConfig } from "vitest/config";

// Plain Node runtime: routes take injected deps (createApp(fakeDeps)), no Workers pool needed.
export default defineConfig({
  test: { include: ["test/**/*.test.ts"], environment: "node" },
});
