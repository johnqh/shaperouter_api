/**
 * Database-test setup. Loaded by `bun run test:db` only — never by CI.
 *
 * Throws unless TEST_DATABASE_URL names a localhost database, then publishes it
 * as DATABASE_URL for the application code to read.
 */
import { setupTestDatabase } from "@sudobility/test-db-guard";

process.env.NODE_ENV = "test";

setupTestDatabase();

process.env.ENCRYPTION_KEY =
  "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
process.env.FIREBASE_PROJECT_ID = "test-project";
process.env.FIREBASE_CLIENT_EMAIL = "test@test-project.iam.gserviceaccount.com";
process.env.FIREBASE_PRIVATE_KEY = "test-private-key";
