/**
 * Unit-test setup. Loaded by `bun run test` — the script CI runs.
 *
 * No database is reachable from here: the guard deletes DATABASE_URL, and
 * vitest.config.ts excludes every *.db.test.ts file from collection. Both, so
 * that neither alone is load-bearing.
 */
import { scrubDatabaseUrl } from "@sudobility/test-db-guard";

process.env.NODE_ENV = "test";

scrubDatabaseUrl();

process.env.ENCRYPTION_KEY =
  "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
process.env.FIREBASE_PROJECT_ID = "test-project";
process.env.FIREBASE_CLIENT_EMAIL = "test@test-project.iam.gserviceaccount.com";
process.env.FIREBASE_PRIVATE_KEY = "test-private-key";
