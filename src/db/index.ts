/**
 * @fileoverview Database connection and initialization
 * @description A lazy connection (nothing connects at import) from
 * @sudobility/shapeshyft_service. initDatabase() creates the shared tables,
 * then ShapeRouter's own llm_api_keys table.
 */

import {
  createLazyDatabase,
  initServiceTables,
} from "@sudobility/shapeshyft_service";
import * as schema from "./schema";
import { getRequiredEnv } from "../lib/env-helper";
import { initLlmApiKeys } from "./llm-api-keys";

const database = createLazyDatabase(
  () => getRequiredEnv("DATABASE_URL"),
  schema
);

export const db = database.db;

export async function initDatabase() {
  const client = database.client();

  // Shared tables, enums, entity and rate-limit tables, additive columns
  await initServiceTables(client as any, {
    schemaName: "shaperouter",
    indexPrefix: "shaperouter",
  });

  // ShapeRouter's own: llm_api_keys, its FK from endpoints, provider backfill
  await initLlmApiKeys(client);

  console.log("Database tables initialized");
}

export const closeDatabase = database.close;

// Re-export schema for convenience
export * from "./schema";
