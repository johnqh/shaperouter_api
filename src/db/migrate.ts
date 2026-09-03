/**
 * Migration script to add entity_id column to llm_api_keys and projects tables
 * and migrate data from user_id to entity_id
 */
import postgres from "postgres";
import { getRequiredEnv } from "../lib/env-helper";

async function migrate() {
  const connectionString = getRequiredEnv("DATABASE_URL");
  const client = postgres(connectionString);

  console.log("Starting migration...");

  try {
    // Check if entity_id column already exists in llm_api_keys
    const llmKeysColumns = await client`
      SELECT column_name FROM information_schema.columns 
      WHERE table_schema = 'shaperouter' AND table_name = 'llm_api_keys'
    `;
    const llmKeysHasEntityId = llmKeysColumns.some(
      c => c.column_name === "entity_id"
    );
    const llmKeysHasUserId = llmKeysColumns.some(
      c => c.column_name === "user_id"
    );

    if (!llmKeysHasEntityId) {
      console.log("Adding entity_id column to llm_api_keys...");

      await client`
        ALTER TABLE shaperouter.llm_api_keys 
        ADD COLUMN IF NOT EXISTS entity_id UUID REFERENCES shaperouter.entities(id) ON DELETE CASCADE
      `;

      if (llmKeysHasUserId) {
        console.log("Migrating llm_api_keys data from user_id to entity_id...");
        // Join through entity_members to find user's personal entity (owner role)
        await client`
          UPDATE shaperouter.llm_api_keys k
          SET entity_id = e.id
          FROM shaperouter.entities e
          INNER JOIN shaperouter.entity_members em ON em.entity_id = e.id
          WHERE em.user_id = k.user_id
            AND em.role = 'manager'
            AND em.is_active = true
            AND e.entity_type = 'personal'
            AND k.entity_id IS NULL
        `;

        await client`DELETE FROM shaperouter.llm_api_keys WHERE entity_id IS NULL`;
        await client`ALTER TABLE shaperouter.llm_api_keys DROP COLUMN IF EXISTS user_id`;
      }

      await client`ALTER TABLE shaperouter.llm_api_keys ALTER COLUMN entity_id SET NOT NULL`;
      console.log("llm_api_keys migration complete.");
    } else if (llmKeysHasUserId) {
      console.log("Dropping user_id column from llm_api_keys...");
      await client`ALTER TABLE shaperouter.llm_api_keys DROP COLUMN IF EXISTS user_id`;
    }

    // Check projects table
    const projectsColumns = await client`
      SELECT column_name FROM information_schema.columns 
      WHERE table_schema = 'shaperouter' AND table_name = 'projects'
    `;
    const projectsHasEntityId = projectsColumns.some(
      c => c.column_name === "entity_id"
    );
    const projectsHasUserId = projectsColumns.some(
      c => c.column_name === "user_id"
    );

    console.log(
      `Projects table: entity_id=${projectsHasEntityId}, user_id=${projectsHasUserId}`
    );

    if (!projectsHasEntityId) {
      console.log("Adding entity_id column to projects...");

      await client`
        ALTER TABLE shaperouter.projects 
        ADD COLUMN IF NOT EXISTS entity_id UUID REFERENCES shaperouter.entities(id) ON DELETE CASCADE
      `;

      if (projectsHasUserId) {
        console.log("Migrating projects data from user_id to entity_id...");
        // Join through entity_members to find user's personal entity (owner role)
        await client`
          UPDATE shaperouter.projects p
          SET entity_id = e.id
          FROM shaperouter.entities e
          INNER JOIN shaperouter.entity_members em ON em.entity_id = e.id
          WHERE em.user_id = p.user_id
            AND em.role = 'manager'
            AND em.is_active = true
            AND e.entity_type = 'personal'
            AND p.entity_id IS NULL
        `;

        await client`DELETE FROM shaperouter.projects WHERE entity_id IS NULL`;
        await client`ALTER TABLE shaperouter.projects DROP COLUMN IF EXISTS user_id`;
      }

      await client`ALTER TABLE shaperouter.projects ALTER COLUMN entity_id SET NOT NULL`;
      console.log("projects migration complete.");
    } else if (projectsHasUserId) {
      // entity_id exists but user_id still there - need to drop user_id
      console.log("Dropping user_id column from projects...");
      await client`ALTER TABLE shaperouter.projects DROP COLUMN IF EXISTS user_id`;
      console.log("Dropped user_id from projects.");
    }

    // Recreate unique indexes
    await client`DROP INDEX IF EXISTS shaperouter.unique_project_per_entity`;
    await client`
      CREATE UNIQUE INDEX IF NOT EXISTS unique_project_per_entity
      ON shaperouter.projects(entity_id, project_name)
    `;

    console.log("Migration completed successfully!");
  } catch (error) {
    console.error("Migration failed:", error);
    throw error;
  } finally {
    await client.end();
  }
}

migrate();
