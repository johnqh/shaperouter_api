/**
 * @fileoverview Drizzle schema for the `shaperouter` PostgreSQL schema
 * @description Shared tables come from @sudobility/shapeshyft_service; this file
 * adds only ShapeRouter's own table, `llm_api_keys`. The shared tables are
 * re-exported under their historical names so every existing import of
 * `src/db` keeps working.
 */

import {
  pgSchema,
  uuid,
  varchar,
  text,
  boolean,
  timestamp,
} from "drizzle-orm/pg-core";
import { createServiceTables } from "@sudobility/shapeshyft_service";

export const shaperouterSchema = pgSchema("shaperouter");

export const serviceTables = createServiceTables(shaperouterSchema, {
  indexPrefix: "shaperouter",
});

export const {
  llmProviderEnum,
  httpMethodEnum,
  users,
  userSettings,
  entities,
  entityMembers,
  entityInvitations,
  entityApiKeys,
  entityStorageConfigs,
  userApiKeys,
  projects,
  endpoints,
  usageAnalytics,
  rateLimitCounters,
} = serviceTables;

// =============================================================================
// LLM API Keys Table
// Per-entity provider credentials. ShapeRouter's answer to "where does the
// provider key live"; read only by LlmKeyCredentialResolver and routes/keys.ts.
// =============================================================================

export const llmApiKeys = shaperouterSchema.table("llm_api_keys", {
  uuid: uuid("uuid").primaryKey().defaultRandom(),
  entity_id: uuid("entity_id")
    .notNull()
    .references(() => entities.id, { onDelete: "cascade" }),
  key_name: varchar("key_name", { length: 255 }).notNull(),
  provider: llmProviderEnum("provider").notNull(),
  encrypted_api_key: text("encrypted_api_key"),
  endpoint_url: text("endpoint_url"),
  encryption_iv: varchar("encryption_iv", { length: 32 }),
  is_active: boolean("is_active").default(true),
  created_at: timestamp("created_at").defaultNow(),
  updated_at: timestamp("updated_at").defaultNow(),
});
