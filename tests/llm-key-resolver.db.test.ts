import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { eq } from "drizzle-orm";
import { db, initDatabase, llmApiKeys } from "../src/db";
import { encryption } from "../src/lib/encryption";
import {
  createLlmKeyCredentialResolver,
  LLM_KEY_INACTIVE,
  LLM_KEY_NOT_OWNED,
} from "../src/credentials/llm-key-resolver";
import {
  cleanupTestUser,
  createTestEndpoint,
  createTestLlmKey,
  createTestProject,
  createTestUserWithEntity,
} from "./utils/test-db";
import { testUser } from "./utils";

const OTHER_ENTITY = "00000000-0000-4000-8000-000000000000";

describe("LlmKeyCredentialResolver", () => {
  const resolver = createLlmKeyCredentialResolver({
    db,
    encryption,
    lmStudioTimeoutMs: 900_000,
  });
  let entityId: string;
  let keyId: string;

  beforeAll(async () => {
    await initDatabase();
  });

  beforeEach(async () => {
    await cleanupTestUser(testUser.uid);
    const { entity } = await createTestUserWithEntity(testUser);
    entityId = entity.id;
    const { encrypted, iv } = encryption.encryptApiKey("sk-real");
    const key = await createTestLlmKey(entityId, {
      key_name: "k",
      provider: "lm_studio",
      encrypted_api_key: encrypted,
      encryption_iv: iv,
      endpoint_url: "http://10.0.0.5:1234/v1",
    });
    keyId = key.uuid;
  });

  async function endpointBoundToKey() {
    const project = await createTestProject(entityId, {
      project_name: "p",
      display_name: "P",
    });
    return createTestEndpoint(project.uuid, keyId, {
      endpoint_name: "e",
      display_name: "E",
    });
  }

  describe("bindEndpoint", () => {
    it("binds a key the entity owns and returns its provider", async () => {
      expect(
        await resolver.bindEndpoint({ entityId, body: { llm_key_id: keyId } })
      ).toEqual({ ok: true, provider: "lm_studio", llmKeyId: keyId });
    });

    it("refuses another entity's key with today's 400 message", async () => {
      expect(
        await resolver.bindEndpoint({
          entityId: OTHER_ENTITY,
          body: { llm_key_id: keyId },
        })
      ).toEqual({ ok: false, status: 400, message: LLM_KEY_NOT_OWNED });
      expect(LLM_KEY_NOT_OWNED).toBe(
        "LLM key not found or doesn't belong to this entity"
      );
    });

    it("keeps the current binding when an update does not name a key", async () => {
      const endpoint = await endpointBoundToKey();
      expect(
        await resolver.bindEndpoint({
          entityId,
          body: { display_name: "x" },
          current: endpoint,
        })
      ).toEqual({ ok: true, provider: "lm_studio", llmKeyId: keyId });
    });
  });

  describe("resolve", () => {
    it("decrypts the key and passes endpoint URL and timeout", async () => {
      const endpoint = await endpointBoundToKey();
      expect(await resolver.resolve({ entityId, endpoint })).toEqual({
        ok: true,
        provider: "lm_studio",
        apiKey: "sk-real",
        endpointUrl: "http://10.0.0.5:1234/v1",
        timeoutMs: 900_000,
      });
    });

    it("refuses an inactive key with today's 500 message", async () => {
      const endpoint = await endpointBoundToKey();
      await db
        .update(llmApiKeys)
        .set({ is_active: false })
        .where(eq(llmApiKeys.uuid, keyId));
      expect(await resolver.resolve({ entityId, endpoint })).toEqual({
        ok: false,
        status: 500,
        message: LLM_KEY_INACTIVE,
      });
      expect(LLM_KEY_INACTIVE).toBe("LLM API key not found or inactive");
    });
  });
});
