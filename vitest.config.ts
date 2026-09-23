import { defineConfig } from "vitest/config";
import tsConfigPaths from "vite-tsconfig-paths";

// Kept separate from vite.config.ts intentionally: that file is managed by
// @lovable.dev/vite-tanstack-config and its header warns against adding
// plugins manually. This config only powers `npm run test` / `npm run test:watch`.
export default defineConfig({
  plugins: [tsConfigPaths()],
  test: {
    environment: "node",
    include: ["src/**/*.{test,spec}.{ts,tsx}"],
  },
});
