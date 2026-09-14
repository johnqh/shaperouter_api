/**
 * @fileoverview Database connection and initialization
 * @description Provides a lazy Proxy-based database connection that only
 * connects on first access. initDatabase() creates the shared tables via
 * @sudobility/shapeshyft_service, then ShapeRouter's own llm_api_keys table.
 */

import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres, { type Sql } from "postgres";
import * as schema from "./schema";
import { getRequiredEnv } from "../lib/env-helper";
import { initServiceTables } from "@sudobility/shapeshyft_service";
import { initLlmApiKeys } from "./llm-api-keys";

// Lazy-initialized database connection
let _client: Sql | null = null;
let _db: PostgresJsDatabase<typeof schema> | null = null;

function getClient(): Sql {
  if (!_client) {
    const connectionString = getRequiredEnv("DATABASE_URL");
    _client = postgres(connectionString);
  }
  return _client;
}

// Export db as a getter to ensure lazy initialization
export const db: PostgresJsDatabase<typeof schema> = new Proxy(
  {} as PostgresJsDatabase<typeof schema>,
  {
    get(_, prop) {
      if (!_db) {
        _db = drizzle(getClient(), { schema });
      }
      return (_db as any)[prop];
    },
  }
);

export async function initDatabase() {
  const client = getClient();

  // Shared tables, enums, entity and rate-limit tables, additive columns
  await initServiceTables(client as any, {
    schemaName: "shaperouter",
    indexPrefix: "shaperouter",
  });

  // ShapeRouter's own: llm_api_keys, its FK from endpoints, provider backfill
  await initLlmApiKeys(client);

  console.log("Database tables initialized");
}

export async function closeDatabase() {
  if (_client) {
    await _client.end();
    _client = null;
    _db = null;
  }
}

// Re-export schema for convenience
export * from "./schema";
