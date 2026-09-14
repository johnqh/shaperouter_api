import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { createTestApp, createTestRequest, testUser } from "./utils";
import { cleanupTestUser, createTestUserWithEntity } from "./utils/test-db";
import { initDatabase } from "../src/db";
import type { Hono } from "hono";

describe("Endpoints Routes", () => {
  let app: Hono;
  let entitySlug: string;
  let userId: string;
  let projectId: string;
  let keyId: string;

  beforeAll(async () => {
    await initDatabase();
  });

  beforeEach(async () => {
    await cleanupTestUser(testUser.uid);
    // Create user with entity for each test
    const { user, entity } = await createTestUserWithEntity(testUser);
    userId = user.firebase_uid;
    entitySlug = entity.entity_slug;
    // Create app with the user's ID
    app = createTestApp(testUser, userId);

    // Create a project and key for endpoint tests
    const keyRes = await createTestRequest(app, "POST", `/api/v1/entities/${entitySlug}/keys`, {
      body: {
        key_name: "Test Key",
        provider: "openai",
        api_key: "sk-test-key",
      },
    });
    const keyJson = await keyRes.json();
    keyId = keyJson.data.uuid;

    const projectRes = await createTestRequest(
      app,
      "POST",
      `/api/v1/entities/${entitySlug}/projects`,
      {
        body: {
          project_name: "test-project",
          display_name: "Test Project",
        },
      }
    );
    const projectJson = await projectRes.json();
    projectId = projectJson.data.uuid;
  });

  afterAll(async () => {
    await cleanupTestUser(testUser.uid);
  });

  describe("GET /api/v1/entities/:entitySlug/projects/:projectId/endpoints", () => {
    it("should return empty array when no endpoints exist", async () => {
      const res = await createTestRequest(
        app,
        "GET",
        `/api/v1/entities/${entitySlug}/projects/${projectId}/endpoints`
      );
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.data).toEqual([]);
    });

    it("should return endpoints for project", async () => {
      // Create an endpoint first
      await createTestRequest(
        app,
        "POST",
        `/api/v1/entities/${entitySlug}/projects/${projectId}/endpoints`,
        {
          body: {
            endpoint_name: "extract-data",
            display_name: "Extract Data",
            llm_key_id: keyId,
          },
        }
      );

      const res = await createTestRequest(
        app,
        "GET",
        `/api/v1/entities/${entitySlug}/projects/${projectId}/endpoints`
      );
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.data.length).toBe(1);
    });
  });

  describe("POST /api/v1/entities/:entitySlug/projects/:projectId/endpoints", () => {
    it("should create endpoint with schemas", async () => {
      const res = await createTestRequest(
        app,
        "POST",
        `/api/v1/entities/${entitySlug}/projects/${projectId}/endpoints`,
        {
          body: {
            endpoint_name: "extract-person",
            display_name: "Extract Person",
            llm_key_id: keyId,
            http_method: "POST",
            input_schema: {
              type: "object",
              properties: {
                text: { type: "string" },
              },
            },
            output_schema: {
              type: "object",
              properties: {
                name: { type: "string" },
                age: { type: "number" },
              },
            },
            description: "Extract person details from text",
          },
        }
      );

      expect(res.status).toBe(201);

      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.data.endpoint_name).toBe("extract-person");
      expect(json.data.http_method).toBe("POST");
    });

    it("should create GET endpoint", async () => {
      const res = await createTestRequest(
        app,
        "POST",
        `/api/v1/entities/${entitySlug}/projects/${projectId}/endpoints`,
        {
          body: {
            endpoint_name: "get-info",
            display_name: "Get Info",
            llm_key_id: keyId,
            http_method: "GET",
          },
        }
      );

      expect(res.status).toBe(201);

      const json = await res.json();
      expect(json.data.http_method).toBe("GET");
    });

    it("should reject duplicate endpoint_name in same project", async () => {
      // Create first endpoint
      await createTestRequest(
        app,
        "POST",
        `/api/v1/entities/${entitySlug}/projects/${projectId}/endpoints`,
        {
          body: {
            endpoint_name: "unique-endpoint",
            display_name: "First Endpoint",
            llm_key_id: keyId,
          },
        }
      );

      // Try to create duplicate
      const res = await createTestRequest(
        app,
        "POST",
        `/api/v1/entities/${entitySlug}/projects/${projectId}/endpoints`,
        {
          body: {
            endpoint_name: "unique-endpoint",
            display_name: "Second Endpoint",
            llm_key_id: keyId,
          },
        }
      );

      expect(res.status).toBe(409);
    });

    it("should reject missing llm_key_id", async () => {
      const res = await createTestRequest(
        app,
        "POST",
        `/api/v1/entities/${entitySlug}/projects/${projectId}/endpoints`,
        {
          body: {
            endpoint_name: "no-key",
            display_name: "No Key",
          },
        }
      );

      expect(res.status).toBe(400);
    });

    it("should reject non-existent llm_key_id", async () => {
      const res = await createTestRequest(
        app,
        "POST",
        `/api/v1/entities/${entitySlug}/projects/${projectId}/endpoints`,
        {
          body: {
            endpoint_name: "bad-key",
            display_name: "Bad Key",
            llm_key_id: "00000000-0000-0000-0000-000000000000",
          },
        }
      );

      // Returns 400 because the foreign key constraint fails during validation
      expect(res.status).toBe(400);
    });
  });

  describe("GET /api/v1/entities/:entitySlug/projects/:projectId/endpoints/:endpointId", () => {
    it("should return a specific endpoint", async () => {
      // Create endpoint first
      const createRes = await createTestRequest(
        app,
        "POST",
        `/api/v1/entities/${entitySlug}/projects/${projectId}/endpoints`,
        {
          body: {
            endpoint_name: "test-endpoint",
            display_name: "Test Endpoint",
            llm_key_id: keyId,
          },
        }
      );
      const createJson = await createRes.json();
      const endpointId = createJson.data.uuid;

      const res = await createTestRequest(
        app,
        "GET",
        `/api/v1/entities/${entitySlug}/projects/${projectId}/endpoints/${endpointId}`
      );
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.data.uuid).toBe(endpointId);
    });

    it("should return 404 for non-existent endpoint", async () => {
      const res = await createTestRequest(
        app,
        "GET",
        `/api/v1/entities/${entitySlug}/projects/${projectId}/endpoints/00000000-0000-0000-0000-000000000000`
      );
      expect(res.status).toBe(404);
    });
  });

  describe("PUT /api/v1/entities/:entitySlug/projects/:projectId/endpoints/:endpointId", () => {
    it("should update endpoint display_name", async () => {
      // Create endpoint first
      const createRes = await createTestRequest(
        app,
        "POST",
        `/api/v1/entities/${entitySlug}/projects/${projectId}/endpoints`,
        {
          body: {
            endpoint_name: "test-endpoint",
            display_name: "Original Name",
            llm_key_id: keyId,
          },
        }
      );
      const createJson = await createRes.json();
      const endpointId = createJson.data.uuid;

      const res = await createTestRequest(
        app,
        "PUT",
        `/api/v1/entities/${entitySlug}/projects/${projectId}/endpoints/${endpointId}`,
        {
          body: {
            display_name: "Updated Name",
          },
        }
      );

      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.data.display_name).toBe("Updated Name");
    });

    it("should update output_schema", async () => {
      // Create endpoint first
      const createRes = await createTestRequest(
        app,
        "POST",
        `/api/v1/entities/${entitySlug}/projects/${projectId}/endpoints`,
        {
          body: {
            endpoint_name: "test-endpoint",
            display_name: "Test Endpoint",
            llm_key_id: keyId,
          },
        }
      );
      const createJson = await createRes.json();
      const endpointId = createJson.data.uuid;

      const newSchema = {
        type: "object",
        properties: {
          result: { type: "string" },
        },
      };

      const res = await createTestRequest(
        app,
        "PUT",
        `/api/v1/entities/${entitySlug}/projects/${projectId}/endpoints/${endpointId}`,
        {
          body: {
            output_schema: newSchema,
          },
        }
      );

      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.data.output_schema).toEqual(newSchema);
    });

    it("should deactivate endpoint", async () => {
      // Create endpoint first
      const createRes = await createTestRequest(
        app,
        "POST",
        `/api/v1/entities/${entitySlug}/projects/${projectId}/endpoints`,
        {
          body: {
            endpoint_name: "test-endpoint",
            display_name: "Test Endpoint",
            llm_key_id: keyId,
          },
        }
      );
      const createJson = await createRes.json();
      const endpointId = createJson.data.uuid;

      const res = await createTestRequest(
        app,
        "PUT",
        `/api/v1/entities/${entitySlug}/projects/${projectId}/endpoints/${endpointId}`,
        {
          body: {
            is_active: false,
          },
        }
      );

      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.data.is_active).toBe(false);
    });
  });

  describe("DELETE /api/v1/entities/:entitySlug/projects/:projectId/endpoints/:endpointId", () => {
    it("should delete an endpoint", async () => {
      // Create endpoint first
      const createRes = await createTestRequest(
        app,
        "POST",
        `/api/v1/entities/${entitySlug}/projects/${projectId}/endpoints`,
        {
          body: {
            endpoint_name: "test-endpoint",
            display_name: "Test Endpoint",
            llm_key_id: keyId,
          },
        }
      );
      const createJson = await createRes.json();
      const endpointId = createJson.data.uuid;

      const res = await createTestRequest(
        app,
        "DELETE",
        `/api/v1/entities/${entitySlug}/projects/${projectId}/endpoints/${endpointId}`
      );
      expect(res.status).toBe(200);

      // Verify deletion
      const getRes = await createTestRequest(
        app,
        "GET",
        `/api/v1/entities/${entitySlug}/projects/${projectId}/endpoints/${endpointId}`
      );
      expect(getRes.status).toBe(404);
    });

    it("should return 404 for non-existent endpoint", async () => {
      const res = await createTestRequest(
        app,
        "DELETE",
        `/api/v1/entities/${entitySlug}/projects/${projectId}/endpoints/00000000-0000-0000-0000-000000000000`
      );
      expect(res.status).toBe(404);
    });
  });

  /*
   * Sampling temperature, per endpoint.
   *
   * Every provider adapter has read `LLMRequest.temperature` all along; what
   * did not exist was a way to say what it should be, so every call went out
   * at the `?? 0` default and the same prompt produced the same answer every
   * time. That is right for extraction and classification and wrong for
   * anything meant to be different twice — a generator of music, prose or
   * ideas.
   */
  describe("temperature", () => {
    it("stores what it was given, and hands it back", async () => {
      const res = await createTestRequest(
        app,
        "POST",
        `/api/v1/entities/${entitySlug}/projects/${projectId}/endpoints`,
        {
          body: {
            endpoint_name: "hot",
            display_name: "Hot",
            llm_key_id: keyId,
            temperature: 1.2,
          },
        },
      );
      expect(res.status).toBe(201);
      const created = (await res.json()).data;
      expect(created.temperature).toBe(1.2);

      const read = await createTestRequest(
        app,
        "GET",
        `/api/v1/entities/${entitySlug}/projects/${projectId}/endpoints/${created.uuid}`,
      );
      expect((await read.json()).data.temperature).toBe(1.2);
    });

    /*
     * Null, not zero. An endpoint that says nothing about sampling is what
     * every endpoint was until now, and the adapters differ on what that
     * means: OpenAI and Gemini default it to 0, while Anthropic omits the
     * field entirely because Opus 4.7+ and Sonnet 5 reject it outright. A
     * column defaulting to 0 would start sending it to models that 400 on it.
     */
    it("defaults to saying nothing at all", async () => {
      const res = await createTestRequest(
        app,
        "POST",
        `/api/v1/entities/${entitySlug}/projects/${projectId}/endpoints`,
        {
          body: {
            endpoint_name: "quiet",
            display_name: "Quiet",
            llm_key_id: keyId,
          },
        },
      );
      expect((await res.json()).data.temperature).toBeNull();
    });

    it("changes on update, and can be taken away again", async () => {
      const created = await (
        await createTestRequest(
          app,
          "POST",
          `/api/v1/entities/${entitySlug}/projects/${projectId}/endpoints`,
          {
            body: {
              endpoint_name: "changing",
              display_name: "Changing",
              llm_key_id: keyId,
              temperature: 0.4,
            },
          },
        )
      ).json().then((r: { data: { uuid: string } }) => r.data);

      const raised = await createTestRequest(
        app,
        "PUT",
        `/api/v1/entities/${entitySlug}/projects/${projectId}/endpoints/${created.uuid}`,
        { body: { temperature: 2 } },
      );
      expect((await raised.json()).data.temperature).toBe(2);

      const cleared = await createTestRequest(
        app,
        "PUT",
        `/api/v1/entities/${entitySlug}/projects/${projectId}/endpoints/${created.uuid}`,
        { body: { temperature: null } },
      );
      expect((await cleared.json()).data.temperature).toBeNull();
    });

    it("refuses a value no provider accepts", async () => {
      for (const temperature of [-0.1, 2.1]) {
        const res = await createTestRequest(
          app,
          "POST",
          `/api/v1/entities/${entitySlug}/projects/${projectId}/endpoints`,
          {
            body: {
              endpoint_name: `bad-${Math.abs(temperature)}`.replace(".", "-"),
              display_name: "Bad",
              llm_key_id: keyId,
              temperature,
            },
          },
        );
        expect(res.status, String(temperature)).toBe(400);
      }
    });
  });
});
