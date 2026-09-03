/**
 * @fileoverview Database connection and initialization
 * @description Provides a lazy Proxy-based database connection that only
 * connects on first access. Also handles table creation and migrations
 * via initDatabase().
 */

import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres, { type Sql } from "postgres";
import * as schema from "./schema";
import { getRequiredEnv } from "../lib/env-helper";
import { initRateLimitTable } from "@sudobility/ratelimit_service";
import { runEntityMigration } from "@sudobility/entity_service";

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

  // Create schema if it doesn't exist
  await client`CREATE SCHEMA IF NOT EXISTS shaperouter`;

  // Create enums (if they don't exist)
  await client`
    DO $$ BEGIN
      CREATE TYPE shaperouter.llm_provider AS ENUM ('openai', 'anthropic', 'gemini', 'mistral', 'cohere', 'groq', 'xai', 'deepseek', 'perplexity', 'lm_studio');
    EXCEPTION
      WHEN duplicate_object THEN null;
    END $$;
  `;

  // Add new enum values if they don't exist (migration for existing databases)
  await client`
    DO $$
    BEGIN
      -- Add mistral if not exists
      IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'mistral' AND enumtypid = 'shaperouter.llm_provider'::regtype) THEN
        ALTER TYPE shaperouter.llm_provider ADD VALUE 'mistral';
      END IF;
      -- Add cohere if not exists
      IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'cohere' AND enumtypid = 'shaperouter.llm_provider'::regtype) THEN
        ALTER TYPE shaperouter.llm_provider ADD VALUE 'cohere';
      END IF;
      -- Add groq if not exists
      IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'groq' AND enumtypid = 'shaperouter.llm_provider'::regtype) THEN
        ALTER TYPE shaperouter.llm_provider ADD VALUE 'groq';
      END IF;
      -- Add xai if not exists
      IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'xai' AND enumtypid = 'shaperouter.llm_provider'::regtype) THEN
        ALTER TYPE shaperouter.llm_provider ADD VALUE 'xai';
      END IF;
      -- Add deepseek if not exists
      IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'deepseek' AND enumtypid = 'shaperouter.llm_provider'::regtype) THEN
        ALTER TYPE shaperouter.llm_provider ADD VALUE 'deepseek';
      END IF;
      -- Add perplexity if not exists
      IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'perplexity' AND enumtypid = 'shaperouter.llm_provider'::regtype) THEN
        ALTER TYPE shaperouter.llm_provider ADD VALUE 'perplexity';
      END IF;
      -- Add lm_studio if not exists
      IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'lm_studio' AND enumtypid = 'shaperouter.llm_provider'::regtype) THEN
        ALTER TYPE shaperouter.llm_provider ADD VALUE 'lm_studio';
      END IF;
    END $$;
  `;

  await client`
    DO $$ BEGIN
      CREATE TYPE shaperouter.http_method AS ENUM ('GET', 'POST');
    EXCEPTION
      WHEN duplicate_object THEN null;
    END $$;
  `;

  // =============================================================================
  // Step 1: Create users and user_settings tables
  // firebase_uid is now the primary key
  // =============================================================================

  await client`
    CREATE TABLE IF NOT EXISTS shaperouter.users (
      firebase_uid VARCHAR(128) PRIMARY KEY,
      email VARCHAR(255),
      display_name VARCHAR(255),
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    )
  `;

  await client`
    CREATE TABLE IF NOT EXISTS shaperouter.user_settings (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      firebase_uid VARCHAR(128) NOT NULL UNIQUE REFERENCES shaperouter.users(firebase_uid) ON DELETE CASCADE,
      organization_name VARCHAR(255),
      organization_path VARCHAR(255) NOT NULL UNIQUE,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    )
  `;

  // =============================================================================
  // Step 2: Run entity migration (creates entities, entity_members tables)
  // This must happen BEFORE tables that reference entities.id
  // =============================================================================

  await runEntityMigration({
    client: client as any, // Cast to any due to postgres type version mismatch with bun link
    schemaName: "shaperouter",
    indexPrefix: "shaperouter",
    migrateProjects: false, // Tables are created fresh with entity_id
    migrateUsers: false, // Personal entities created on-demand via EntityHelper
  });

  // =============================================================================
  // Step 2b: Create user_api_keys table (references users.firebase_uid)
  // Personal API keys used as an alternative to a Firebase ID token.
  // =============================================================================

  await client`
    CREATE TABLE IF NOT EXISTS shaperouter.user_api_keys (
      uuid UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      firebase_uid VARCHAR(128) NOT NULL REFERENCES shaperouter.users(firebase_uid) ON DELETE CASCADE,
      key_name VARCHAR(255) NOT NULL,
      key_hash VARCHAR(64) NOT NULL UNIQUE,
      key_prefix VARCHAR(20) NOT NULL,
      encrypted_key TEXT NOT NULL,
      encryption_iv VARCHAR(32) NOT NULL,
      is_active BOOLEAN NOT NULL DEFAULT true,
      last_used_at TIMESTAMP,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    )
  `;

  await client`
    CREATE INDEX IF NOT EXISTS shaperouter_user_api_keys_user_idx
      ON shaperouter.user_api_keys(firebase_uid)
  `;

  await client`
    CREATE UNIQUE INDEX IF NOT EXISTS shaperouter_user_api_keys_hash_idx
      ON shaperouter.user_api_keys(key_hash)
  `;

  // =============================================================================
  // Step 2c: Create entity_api_keys table (references entities.id)
  // Entity-scoped keys used by CI, scripts, and MCP clients.
  // =============================================================================

  await client`
    CREATE TABLE IF NOT EXISTS shaperouter.entity_api_keys (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      entity_id UUID NOT NULL REFERENCES shaperouter.entities(id) ON DELETE CASCADE,
      key_name VARCHAR(255) NOT NULL,
      key_hash VARCHAR(64) NOT NULL UNIQUE,
      key_prefix VARCHAR(20) NOT NULL,
      created_by_user_id VARCHAR(128) NOT NULL,
      is_active BOOLEAN NOT NULL DEFAULT true,
      last_used_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `;

  await client`
    CREATE UNIQUE INDEX IF NOT EXISTS shaperouter_entity_api_keys_hash_idx
      ON shaperouter.entity_api_keys(key_hash)
  `;

  await client`
    CREATE INDEX IF NOT EXISTS shaperouter_entity_api_keys_entity_idx
      ON shaperouter.entity_api_keys(entity_id)
  `;

  await client`
    CREATE INDEX IF NOT EXISTS shaperouter_entity_api_keys_active_idx
      ON shaperouter.entity_api_keys(is_active)
  `;

  // =============================================================================
  // Step 3: Create llm_api_keys table (references entities.id)
  // =============================================================================

  await client`
    CREATE TABLE IF NOT EXISTS shaperouter.llm_api_keys (
      uuid UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      entity_id UUID NOT NULL REFERENCES shaperouter.entities(id) ON DELETE CASCADE,
      key_name VARCHAR(255) NOT NULL,
      provider shaperouter.llm_provider NOT NULL,
      encrypted_api_key TEXT,
      endpoint_url TEXT,
      encryption_iv VARCHAR(32),
      is_active BOOLEAN DEFAULT true,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    )
  `;

  // =============================================================================
  // Step 4: Create projects table (references entities.id)
  // =============================================================================

  await client`
    CREATE TABLE IF NOT EXISTS shaperouter.projects (
      uuid UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      entity_id UUID NOT NULL REFERENCES shaperouter.entities(id) ON DELETE CASCADE,
      project_name VARCHAR(255) NOT NULL,
      display_name VARCHAR(255) NOT NULL,
      description TEXT,
      is_active BOOLEAN DEFAULT true,
      encrypted_api_key TEXT,
      api_key_iv VARCHAR(32),
      api_key_prefix VARCHAR(20),
      api_key_created_at TIMESTAMP,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    )
  `;

  // Create unique index for project_name per entity
  await client`
    CREATE UNIQUE INDEX IF NOT EXISTS unique_project_per_entity
    ON shaperouter.projects(entity_id, project_name)
  `;

  // Create index for entity_id lookups
  await client`
    CREATE INDEX IF NOT EXISTS shaperouter_projects_entity_idx
    ON shaperouter.projects(entity_id)
  `;

  // =============================================================================
  // Step 5: Create endpoints table (references projects.uuid and llm_api_keys.uuid)
  // =============================================================================

  await client`
    CREATE TABLE IF NOT EXISTS shaperouter.endpoints (
      uuid UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      project_id UUID NOT NULL REFERENCES shaperouter.projects(uuid) ON DELETE CASCADE,
      endpoint_name VARCHAR(255) NOT NULL,
      display_name VARCHAR(255) NOT NULL,
      http_method shaperouter.http_method NOT NULL DEFAULT 'POST',
      llm_key_id UUID NOT NULL REFERENCES shaperouter.llm_api_keys(uuid) ON DELETE RESTRICT,
      model VARCHAR(255),
      input_schema JSONB,
      output_schema JSONB,
      instructions TEXT,
      context TEXT,
      is_active BOOLEAN DEFAULT true,
      ip_allowlist JSONB,
      call_count INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW(),
      UNIQUE(project_id, endpoint_name)
    )
  `;

  // Add model column if it doesn't exist (migration for existing tables)
  await client`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'shaperouter'
        AND table_name = 'endpoints'
        AND column_name = 'model'
      ) THEN
        ALTER TABLE shaperouter.endpoints ADD COLUMN model VARCHAR(255);
      END IF;
    END $$;
  `;

  // Add call_count column if it doesn't exist (migration for existing tables).
  // Existing endpoints start at 0 rather than backfilling from usage_analytics:
  // the counter is a forward-looking tally, and a backfill would silently
  // disagree with any analytics rows that have since been pruned.
  await client`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'shaperouter'
        AND table_name = 'endpoints'
        AND column_name = 'call_count'
      ) THEN
        ALTER TABLE shaperouter.endpoints
          ADD COLUMN call_count INTEGER NOT NULL DEFAULT 0;
      END IF;
    END $$;
  `;

  // Create index for project_id lookups
  await client`
    CREATE INDEX IF NOT EXISTS shaperouter_endpoints_project_idx
    ON shaperouter.endpoints(project_id)
  `;

  // =============================================================================
  // Step 6: Create usage_analytics table (references endpoints.uuid)
  // =============================================================================

  await client`
    CREATE TABLE IF NOT EXISTS shaperouter.usage_analytics (
      uuid UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      endpoint_id UUID NOT NULL REFERENCES shaperouter.endpoints(uuid) ON DELETE CASCADE,
      timestamp TIMESTAMP NOT NULL DEFAULT NOW(),
      success BOOLEAN NOT NULL,
      error_message TEXT,
      tokens_input INTEGER,
      tokens_output INTEGER,
      latency_ms INTEGER,
      estimated_cost_cents INTEGER,
      request_metadata JSONB
    )
  `;

  // Create indexes for analytics queries
  await client`
    CREATE INDEX IF NOT EXISTS idx_usage_endpoint_timestamp
    ON shaperouter.usage_analytics(endpoint_id, timestamp DESC)
  `;

  // =============================================================================
  // Step 7: Rate limit counters table
  // =============================================================================

  await initRateLimitTable(client, "shaperouter", "shaperouter");

  // =============================================================================
  // Step 8: Entity Storage Configs table (for generated media uploads)
  // =============================================================================

  await client`
    CREATE TABLE IF NOT EXISTS shaperouter.entity_storage_configs (
      uuid UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      entity_id UUID NOT NULL UNIQUE REFERENCES shaperouter.entities(id) ON DELETE CASCADE,
      provider VARCHAR(20) NOT NULL,
      bucket VARCHAR(255) NOT NULL,
      path_prefix VARCHAR(500),
      encrypted_credentials TEXT NOT NULL,
      encryption_iv VARCHAR(32) NOT NULL,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW(),
      created_by VARCHAR(128) NOT NULL
    )
  `;

  // Create index for entity_id lookups
  await client`
    CREATE INDEX IF NOT EXISTS shaperouter_entity_storage_configs_entity_idx
    ON shaperouter.entity_storage_configs(entity_id)
  `;

  // =============================================================================
  // Step 9: Add multimodal columns to endpoints table (migration for existing DBs)
  // =============================================================================

  // Add expects_media_output column
  await client`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'shaperouter'
        AND table_name = 'endpoints'
        AND column_name = 'expects_media_output'
      ) THEN
        ALTER TABLE shaperouter.endpoints ADD COLUMN expects_media_output JSONB;
      END IF;
    END $$;
  `;

  // Add output_media_format column
  await client`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'shaperouter'
        AND table_name = 'endpoints'
        AND column_name = 'output_media_format'
      ) THEN
        ALTER TABLE shaperouter.endpoints ADD COLUMN output_media_format VARCHAR(20);
      END IF;
    END $$;
  `;

  // Add web_search column
  await client`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'shaperouter'
        AND table_name = 'endpoints'
        AND column_name = 'web_search'
      ) THEN
        ALTER TABLE shaperouter.endpoints ADD COLUMN web_search BOOLEAN DEFAULT false;
      END IF;
    END $$;
  `;

  // Add transcription_extraction_model column
  await client`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'shaperouter'
        AND table_name = 'endpoints'
        AND column_name = 'transcription_extraction_model'
      ) THEN
        ALTER TABLE shaperouter.endpoints ADD COLUMN transcription_extraction_model VARCHAR(255);
      END IF;
    END $$;
  `;

  // Add max_output_tokens column.
  // Intentionally nullable with NO default and NO backfill: NULL means "no
  // runaway protection", and existing endpoints must keep behaving exactly as
  // they did. Adding a default here would silently cap live endpoints whose
  // callers depend on longer answers.
  await client`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'shaperouter'
        AND table_name = 'endpoints'
        AND column_name = 'max_output_tokens'
      ) THEN
        ALTER TABLE shaperouter.endpoints ADD COLUMN max_output_tokens INTEGER;
      END IF;
    END $$;
  `;

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
