import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    setupFiles: ["./tests/setup.db.ts"],
    include: ["**/*.db.test.ts"],
    exclude: ["**/node_modules/**", "**/dist/**"],
    // One database, shared across files. Parallel files corrupt each other.
    fileParallelism: false,
    // @sudobility service packages are compiled by tsc with extensionless and
    // directory-style relative imports. Bun's resolver accepts them, which is why
    // these suites passed under `bun test`, but vitest hands bare dependencies to
    // Node's ESM resolver, which rejects both:
    //   ERR_UNSUPPORTED_DIR_IMPORT  .../ratelimit_service/dist/types
    //   ERR_MODULE_NOT_FOUND        .../auth_service/dist/init
    // Inlining routes them through Vite, which resolves them the way Bun does.
    server: {
      deps: {
        inline: [
          "@sudobility/auth_service",
          "@sudobility/entity_service",
          "@sudobility/ratelimit_service",
          "@sudobility/shapeshyft_service",
          "@sudobility/subscription_service",
        ],
      },
    },
  },
  resolve: {
    alias: {
      // hono/bun only resolves under the Bun runtime; vitest runs under Node.
      "hono/bun": new URL("./tests/stubs/hono-bun.ts", import.meta.url).pathname,
    },
  },
});
