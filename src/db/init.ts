/**
 * @fileoverview Standalone database initialization script (`bun run db:init`)
 * @description Creates the `shaperouter` schema, its enums, tables, indexes, and
 * the additive column migrations, then closes the connection and exits.
 *
 * `initDatabase()` also runs on every server boot, so this script exists only
 * for the cases where booting the server is the wrong thing to do: preparing a
 * fresh database before first deploy, and applying new columns in CI or a
 * release step. It is idempotent -- every statement in `initDatabase()` is
 * `IF NOT EXISTS`-guarded -- so re-running it is safe.
 */

import { initDatabase, closeDatabase } from "./index";

async function main(): Promise<void> {
  try {
    await initDatabase();
  } finally {
    // Release the pool either way, so a failure exits instead of hanging on an
    // open connection.
    await closeDatabase();
  }
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error("Database initialization failed:", message);
  process.exit(1);
});
