/**
 * @fileoverview Drizzle ORM schema definitions
 * @description Defines all database tables in the `shaperouter` PostgreSQL schema.
 * Includes entity tables from @sudobility/entity_service and rate limit
 * counters from @sudobility/ratelimit_service.
 */

import {
  pgSchema,
  pgEnum,
  uuid,
  varchar,
  text,
  boolean,
  timestamp,
  integer,
  jsonb,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core";
import { createRateLimitCountersTable } from "@sudobility/ratelimit_service";
import {
  createEntitiesTable,
  createEntityMembersTable,
  createEntityInvitationsTable,
  createEntityApiKeysTable,
} from "@sudobility/entity_service";

// Create the shaperouter schema
export const shaperouterSchema = pgSchema("shaperouter");

// =============================================================================
// Enums
// =============================================================================

export const llmProviderEnum = pgEnum("llm_provider", [
  "openai",
  "anthropic",
  "gemini",
  "mistral",
  "cohere",
  "groq",
  "xai",
  "deepseek",
  "perplexity",
  "lm_studio",
]);

export const httpMethodEnum = pgEnum("http_method", ["GET", "POST"]);

// =============================================================================
// Users Table
// firebase_uid is the primary key - no internal UUID needed
// =============================================================================

export const users = shaperouterSchema.table("users", {
  firebase_uid: varchar("firebase_uid", { length: 128 }).primaryKey(),
  email: varchar("email", { length: 255 }),
  display_name: varchar("display_name", { length: 255 }),
  created_at: timestamp("created_at").defaultNow(),
  updated_at: timestamp("updated_at").defaultNow(),
});

// =============================================================================
// User Settings Table
// =============================================================================

export const userSettings = shaperouterSchema.table("user_settings", {
  id: uuid("id").primaryKey().defaultRandom(),
  firebase_uid: varchar("firebase_uid", { length: 128 })
    .notNull()
    .references(() => users.firebase_uid, { onDelete: "cascade" })
    .unique(),
  organization_name: varchar("organization_name", { length: 255 }),
  organization_path: varchar("organization_path", { length: 255 })
    .notNull()
    .unique(),
  created_at: timestamp("created_at").defaultNow(),
  updated_at: timestamp("updated_at").defaultNow(),
});

// =============================================================================
// Entity Tables (from @sudobility/entity_service)
// Must be defined before tables that reference them
// =============================================================================

export const entities = createEntitiesTable(shaperouterSchema, "shaperouter");
export const entityMembers = createEntityMembersTable(
  shaperouterSchema,
  "shaperouter"
);
export const entityInvitations = createEntityInvitationsTable(
  shaperouterSchema,
  "shaperouter"
);
/**
 * Entity-scoped API keys ("shrouteent_..."). Authenticate a caller as the entity
 * itself -- CI jobs, scripts, and MCP clients that outlive any one member.
 * Hash-only storage, so a key is revealed once at creation.
 */
export const entityApiKeys = createEntityApiKeysTable(
  shaperouterSchema,
  "shaperouter"
);

// =============================================================================
// Entity Storage Configs Table
// User-provided cloud storage configuration for generated media
// =============================================================================

export const entityStorageConfigs = shaperouterSchema.table(
  "entity_storage_configs",
  {
    uuid: uuid("uuid").primaryKey().defaultRandom(),
    entity_id: uuid("entity_id")
      .notNull()
      .references(() => entities.id, { onDelete: "cascade" })
      .unique(), // One storage config per entity
    provider: varchar("provider", { length: 20 }).notNull(), // "gcs" | "s3"
    bucket: varchar("bucket", { length: 255 }).notNull(),
    path_prefix: varchar("path_prefix", { length: 500 }), // e.g., "shaperouter/generated/"
    // Encrypted credentials (same pattern as llm_api_keys)
    encrypted_credentials: text("encrypted_credentials").notNull(),
    encryption_iv: varchar("encryption_iv", { length: 32 }).notNull(),
    // Audit fields
    created_at: timestamp("created_at").defaultNow(),
    updated_at: timestamp("updated_at").defaultNow(),
    created_by: varchar("created_by", { length: 128 }).notNull(), // Firebase UID
  },
  table => ({
    entityIdx: index("shaperouter_entity_storage_configs_entity_idx").on(
      table.entity_id
    ),
  })
);

// =============================================================================
// User API Keys Table
// Personal API keys ("shroute_...") that authenticate a user against the admin
// routes exactly as a Firebase ID token does. A user may hold several.
// Looked up by SHA-256 hash; the encrypted copy exists so the owner can reveal
// the key again from the dashboard.
// =============================================================================

export const userApiKeys = shaperouterSchema.table(
  "user_api_keys",
  {
    uuid: uuid("uuid").primaryKey().defaultRandom(),
    firebase_uid: varchar("firebase_uid", { length: 128 })
      .notNull()
      .references(() => users.firebase_uid, { onDelete: "cascade" }),
    key_name: varchar("key_name", { length: 255 }).notNull(),
    /** SHA-256 hex digest of the key — the authentication lookup index */
    key_hash: varchar("key_hash", { length: 64 }).notNull().unique(),
    /** First characters of the key, for display in listings */
    key_prefix: varchar("key_prefix", { length: 20 }).notNull(),
    /** AES-256-CBC ciphertext so the owner can copy the key again */
    encrypted_key: text("encrypted_key").notNull(),
    encryption_iv: varchar("encryption_iv", { length: 32 }).notNull(),
    is_active: boolean("is_active").default(true).notNull(),
    last_used_at: timestamp("last_used_at"),
    created_at: timestamp("created_at").defaultNow(),
    updated_at: timestamp("updated_at").defaultNow(),
  },
  table => ({
    userIdx: index("shaperouter_user_api_keys_user_idx").on(table.firebase_uid),
    hashIdx: uniqueIndex("shaperouter_user_api_keys_hash_idx").on(
      table.key_hash
    ),
  })
);

// =============================================================================
// LLM API Keys Table
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

// =============================================================================
// Projects Table
// =============================================================================

export const projects = shaperouterSchema.table(
  "projects",
  {
    uuid: uuid("uuid").primaryKey().defaultRandom(),
    entity_id: uuid("entity_id")
      .notNull()
      .references(() => entities.id, { onDelete: "cascade" }),
    project_name: varchar("project_name", { length: 255 }).notNull(),
    display_name: varchar("display_name", { length: 255 }).notNull(),
    description: text("description"),
    is_active: boolean("is_active").default(true),
    // API Key fields
    encrypted_api_key: text("encrypted_api_key"),
    api_key_iv: varchar("api_key_iv", { length: 32 }),
    api_key_prefix: varchar("api_key_prefix", { length: 20 }),
    api_key_created_at: timestamp("api_key_created_at"),
    created_at: timestamp("created_at").defaultNow(),
    updated_at: timestamp("updated_at").defaultNow(),
  },
  table => ({
    uniqueProjectPerEntity: uniqueIndex("unique_project_per_entity").on(
      table.entity_id,
      table.project_name
    ),
    entityIdx: index("shaperouter_projects_entity_idx").on(table.entity_id),
  })
);

// =============================================================================
// Endpoints Table
// =============================================================================

export const endpoints = shaperouterSchema.table(
  "endpoints",
  {
    uuid: uuid("uuid").primaryKey().defaultRandom(),
    project_id: uuid("project_id")
      .notNull()
      .references(() => projects.uuid, { onDelete: "cascade" }),
    endpoint_name: varchar("endpoint_name", { length: 255 }).notNull(),
    display_name: varchar("display_name", { length: 255 }).notNull(),
    http_method: httpMethodEnum("http_method").notNull().default("POST"),
    llm_key_id: uuid("llm_key_id")
      .notNull()
      .references(() => llmApiKeys.uuid, { onDelete: "restrict" }),
    model: varchar("model", { length: 255 }),
    input_schema: jsonb("input_schema"),
    output_schema: jsonb("output_schema"),
    instructions: text("instructions"),
    context: text("context"),
    is_active: boolean("is_active").default(true),
    // IP Allowlist - JSON array of IPv4 addresses, null = allow all
    ip_allowlist: jsonb("ip_allowlist"),
    // Media output configuration - what media types this endpoint expects to generate
    expects_media_output: jsonb("expects_media_output"),
    // How to return generated media ("base64" for inline, "url" for cloud storage)
    output_media_format: varchar("output_media_format", { length: 20 }),
    // Enable web search for supported providers (OpenAI Responses API)
    web_search: boolean("web_search").default(false),
    /**
     * Ceiling on tokens the model may generate per invocation.
     *
     * Deliberately has NO database default: a NULL means "no protection", and
     * every endpoint that predates this column keeps that NULL. New endpoints
     * get DEFAULT_MAX_OUTPUT_TOKENS applied at the API layer instead, so the
     * default reaches new rows without silently re-capping existing ones.
     */
    max_output_tokens: integer("max_output_tokens"),
    // For Whisper endpoints: model to use for structured extraction from transcription
    transcription_extraction_model: varchar("transcription_extraction_model", {
      length: 255,
    }),
    /**
     * Lifetime invocation count, incremented on every call -- successful or
     * failed -- alongside the usage_analytics row for that call.
     */
    call_count: integer("call_count").notNull().default(0),
    created_at: timestamp("created_at").defaultNow(),
    updated_at: timestamp("updated_at").defaultNow(),
  },
  table => ({
    uniqueEndpointPerProject: uniqueIndex("unique_endpoint_per_project").on(
      table.project_id,
      table.endpoint_name
    ),
    projectIdx: index("shaperouter_endpoints_project_idx").on(table.project_id),
  })
);

// =============================================================================
// Usage Analytics Table
// =============================================================================

export const usageAnalytics = shaperouterSchema.table("usage_analytics", {
  uuid: uuid("uuid").primaryKey().defaultRandom(),
  endpoint_id: uuid("endpoint_id")
    .notNull()
    .references(() => endpoints.uuid, { onDelete: "cascade" }),
  timestamp: timestamp("timestamp").notNull().defaultNow(),
  success: boolean("success").notNull(),
  error_message: text("error_message"),
  tokens_input: integer("tokens_input"),
  tokens_output: integer("tokens_output"),
  latency_ms: integer("latency_ms"),
  estimated_cost_cents: integer("estimated_cost_cents"),
  request_metadata: jsonb("request_metadata"),
});

// =============================================================================
// Rate Limit Counters Table (from @sudobility/subscription_service)
// =============================================================================

export const rateLimitCounters = createRateLimitCountersTable(
  shaperouterSchema,
  "shaperouter"
);
