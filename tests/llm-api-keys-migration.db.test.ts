import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { eq, sql } from "drizzle-orm";
import { db, initDatabase, endpoints } from "../src/db";
import {
  cleanupTestUser,
  createTestUserWithEntity,
  createTestLlmKey,
  createTestProject,
  createTestEndpoint,
} from "./utils/test-db";
import { testUser } from "./utils";

describe("initDatabase: llm_api_keys binding", () => {
  beforeAll(async () => {
    await initDatabase();
  });

  beforeEach(async () => {
    await cleanupTestUser(testUser.uid);
  });

  it("backfills endpoints.provider from the bound key, and a second boot is a no-op", async () => {
    const { entity } = await createTestUserWithEntity(testUser);
    const key = await createTestLlmKey(entity.id, {
      key_name: "k",
      provider: "anthropic",
    });
    const project = await createTestProject(entity.id, {
      project_name: "mig",
      display_name: "Mig",
    });
    const endpoint = await createTestEndpoint(project.uuid, key.uuid, {
      endpoint_name: "e",
      display_name: "E",
    });

    // Simulate a row written by a pre-extraction server
    await db
      .update(endpoints)
      .set({ provider: null })
      .where(eq(endpoints.uuid, endpoint.uuid));

    await initDatabase();
    const [afterFirst] = await db
      .select()
      .from(endpoints)
      .where(eq(endpoints.uuid, endpoint.uuid));
    expect(afterFirst!.provider).toBe("anthropic");

    await initDatabase();
    const [afterSecond] = await db
      .select()
      .from(endpoints)
      .where(eq(endpoints.uuid, endpoint.uuid));
    expect(afterSecond).toEqual(afterFirst);
  });

  it("keeps a foreign key from endpoints.llm_key_id to llm_api_keys", async () => {
    const rows = await db.execute(sql`
      SELECT 1 FROM pg_constraint c
      JOIN pg_class t ON t.oid = c.conrelid
      JOIN pg_namespace n ON n.oid = t.relnamespace
      WHERE n.nspname = 'shaperouter' AND t.relname = 'endpoints'
        AND c.contype = 'f' AND c.confrelid = 'shaperouter.llm_api_keys'::regclass
    `);
    expect(rows.length).toBe(1);
  });

  it("leaves endpoints.provider and llm_key_id nullable", async () => {
    const rows = await db.execute(sql`
      SELECT column_name, is_nullable FROM information_schema.columns
      WHERE table_schema = 'shaperouter' AND table_name = 'endpoints'
        AND column_name IN ('provider', 'llm_key_id')
      ORDER BY column_name
    `);
    expect(rows.map(r => [r.column_name, r.is_nullable])).toEqual([
      ["llm_key_id", "YES"],
      ["provider", "YES"],
    ]);
  });
});
