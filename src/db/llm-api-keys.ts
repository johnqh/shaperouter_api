/**
 * @fileoverview DDL for ShapeRouter's llm_api_keys and the endpoint binding
 * @description Runs after initServiceTables on every boot. Idempotent.
 */

import type { Sql } from "postgres";

export async function initLlmApiKeys(client: Sql): Promise<void> {
  // The table (unchanged from before the service extraction)
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

  /*
    The service creates endpoints without a foreign key, because it has no key
    table. Existing databases already have this constraint from the original
    CREATE TABLE; a fresh database gets it here. RESTRICT is what stops a key
    in use from being deleted, so it must exist either way.
  */
  await client`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint c
        JOIN pg_class t ON t.oid = c.conrelid
        JOIN pg_namespace n ON n.oid = t.relnamespace
        WHERE n.nspname = 'shaperouter' AND t.relname = 'endpoints'
          AND c.contype = 'f'
          AND c.confrelid = 'shaperouter.llm_api_keys'::regclass
      ) THEN
        ALTER TABLE shaperouter.endpoints
          ADD CONSTRAINT endpoints_llm_key_id_fkey
          FOREIGN KEY (llm_key_id) REFERENCES shaperouter.llm_api_keys(uuid)
          ON DELETE RESTRICT;
      END IF;
    END $$;
  `;

  /*
    Copy each endpoint's provider from its key. A key's provider cannot change
    after creation, so the copy cannot go stale; the API writes it on every
    create/update. This catches rows written before the column existed, or by
    an older server still draining during a rolling deploy.
  */
  await client`
    UPDATE shaperouter.endpoints e
    SET provider = k.provider
    FROM shaperouter.llm_api_keys k
    WHERE e.provider IS NULL AND e.llm_key_id = k.uuid
  `;
}
