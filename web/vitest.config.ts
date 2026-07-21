import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

// Unit tests for pure TypeScript logic (no DOM), the seam TODO.md's triage-cards
// item required. Playwright stays the e2e runner (./e2e); vitest owns the
// no-DB, no-browser layer. Scoped to co-located *.test.ts under app/ so it never
// picks up the Playwright specs.
export default defineConfig({
  test: {
    environment: "node",
    include: ["app/**/*.test.ts"],
  },
  resolve: {
    // Mirror tsconfig's "@/*": "./*" so unit tests import the same way the app does.
    alias: {
      "@": fileURLToPath(new URL("./", import.meta.url)),
    },
  },
});
