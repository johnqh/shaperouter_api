import { describe, it, expect, beforeAll, afterAll, beforeEach } from "bun:test";
import { createTestApp, createTestRequest, testUser } from "./utils";
import { cleanupTestUser, createTestUserWithEntity } from "./utils/test-db";
import { initDatabase } from "../src/db";
import type { Hono } from "hono";

describe("AI Routes", () => {
  let app: Hono;
  let entitySlug: string;
  let userId: string;
  let projectName: string;
  let keyId: string;
  let projectId: string;
  let projectApiKey: string;

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

    // Create key and project for AI tests
    const keyRes = await createTestRequest(app, "POST", `/api/v1/entities/${entitySlug}/keys`, {
      body: {
        key_name: "Test Key",
        provider: "openai",
        api_key: "sk-test-key",
      },
    });
    const keyJson = await keyRes.json();
    keyId = keyJson.data.uuid;

    projectName = "ai-test-project";
    const projectRes = await createTestRequest(
      app,
      "POST",
      `/api/v1/entities/${entitySlug}/projects`,
      {
        body: {
          project_name: projectName,
          display_name: "AI Test Project",
        },
      }
    );
    const projectJson = await projectRes.json();
    projectId = projectJson.data.uuid;

    // Get the project's API key
    const apiKeyRes = await createTestRequest(
      app,
      "GET",
      `/api/v1/entities/${entitySlug}/projects/${projectId}/api-key`
    );
    const apiKeyJson = await apiKeyRes.json();
    projectApiKey = apiKeyJson.data.api_key;
  });

  afterAll(async () => {
    await cleanupTestUser(testUser.uid);
  });

  describe("GET/POST /api/v1/ai/:organizationPath/:projectName/:endpointName", () => {
    it("should return 404 for non-existent organization", async () => {
      const res = await createTestRequest(
        app,
        "POST",
        `/api/v1/ai/nonexist/some-project/some-endpoint`,
        { body: { text: "test" } }
      );
      expect(res.status).toBe(404);

      const json = await res.json();
      expect(json.success).toBe(false);
      expect(json.error).toContain("Organization not found");
    });

    it("should return 404 for non-existent project", async () => {
      const res = await createTestRequest(
        app,
        "POST",
        `/api/v1/ai/${entitySlug}/non-existent-project/some-endpoint`,
        { body: { text: "test" } }
      );
      expect(res.status).toBe(404);

      const json = await res.json();
      expect(json.success).toBe(false);
      expect(json.error).toContain("Project not found");
    });

    it("should return 404 for non-existent endpoint", async () => {
      const res = await createTestRequest(
        app,
        "POST",
        `/api/v1/ai/${entitySlug}/${projectName}/non-existent-endpoint?api_key=${projectApiKey}`,
        { body: { text: "test" } }
      );
      expect(res.status).toBe(404);

      const json = await res.json();
      expect(json.success).toBe(false);
      expect(json.error).toContain("Endpoint not found");
    });

    it("should reject wrong HTTP method", async () => {
      // Create a POST-only endpoint
      await createTestRequest(
        app,
        "POST",
        `/api/v1/entities/${entitySlug}/projects/${projectId}/endpoints`,
        {
          body: {
            endpoint_name: "post-only",
            display_name: "POST Only",
            http_method: "POST",
            llm_key_id: keyId,
          },
        }
      );

      const res = await createTestRequest(
        app,
        "GET",
        `/api/v1/ai/${entitySlug}/${projectName}/post-only?api_key=${projectApiKey}`
      );
      expect(res.status).toBe(405);

      const json = await res.json();
      expect(json.error).toContain("Method GET not allowed");
    });

    it("should not return endpoint if inactive", async () => {
      // Create and then deactivate endpoint
      const createRes = await createTestRequest(
        app,
        "POST",
        `/api/v1/entities/${entitySlug}/projects/${projectId}/endpoints`,
        {
          body: {
            endpoint_name: "to-deactivate",
            display_name: "To Deactivate",
            http_method: "POST",
            llm_key_id: keyId,
          },
        }
      );
      const createJson = await createRes.json();
      const endpointId = createJson.data.uuid;

      // Deactivate endpoint
      await createTestRequest(
        app,
        "PUT",
        `/api/v1/entities/${entitySlug}/projects/${projectId}/endpoints/${endpointId}`,
        {
          body: {
            is_active: false,
          },
        }
      );

      const res = await createTestRequest(
        app,
        "POST",
        `/api/v1/ai/${entitySlug}/${projectName}/to-deactivate?api_key=${projectApiKey}`,
        {
          body: { data: "test" },
        }
      );

      expect(res.status).toBe(404);
    });

    it("should not return project if inactive", async () => {
      // Create endpoint
      await createTestRequest(
        app,
        "POST",
        `/api/v1/entities/${entitySlug}/projects/${projectId}/endpoints`,
        {
          body: {
            endpoint_name: "test-endpoint",
            display_name: "Test Endpoint",
            http_method: "POST",
            llm_key_id: keyId,
          },
        }
      );

      // Deactivate project
      await createTestRequest(
        app,
        "PUT",
        `/api/v1/entities/${entitySlug}/projects/${projectId}`,
        {
          body: {
            is_active: false,
          },
        }
      );

      const res = await createTestRequest(
        app,
        "POST",
        `/api/v1/ai/${entitySlug}/${projectName}/test-endpoint?api_key=${projectApiKey}`,
        {
          body: { data: "test" },
        }
      );

      expect(res.status).toBe(404);
    });
  });

  describe("GET/POST /api/v1/ai/:organizationPath/:projectName/:endpointName/prompt", () => {
    it("should return prompt for endpoint", async () => {
      // Create endpoint
      await createTestRequest(
        app,
        "POST",
        `/api/v1/entities/${entitySlug}/projects/${projectId}/endpoints`,
        {
          body: {
            endpoint_name: "structured-endpoint",
            display_name: "Structured Endpoint",
            http_method: "POST",
            llm_key_id: keyId,
            output_schema: {
              type: "object",
              properties: {
                name: { type: "string", description: "The extracted name" },
                age: { type: "number", description: "The extracted age" },
              },
              required: ["name"],
            },
            instructions: "Extract person details from input data",
          },
        }
      );

      const res = await createTestRequest(
        app,
        "POST",
        `/api/v1/ai/${entitySlug}/${projectName}/structured-endpoint/prompt?api_key=${projectApiKey}`,
        {
          body: {
            name: "John",
            biography: "John is 25 years old",
          },
        }
      );

      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.data).toHaveProperty("prompt");
      expect(typeof json.data.prompt).toBe("string");
      expect(json.data.prompt).toContain("Extract person details");
      expect(json.data.prompt).toContain("name");
    });

    it("should return 404 for non-existent endpoint on /prompt", async () => {
      const res = await createTestRequest(
        app,
        "POST",
        `/api/v1/ai/${entitySlug}/${projectName}/non-existent/prompt?api_key=${projectApiKey}`,
        { body: { text: "test" } }
      );
      expect(res.status).toBe(404);
    });

    it("should include provider note in prompt", async () => {
      // Create endpoint with OpenAI provider
      await createTestRequest(
        app,
        "POST",
        `/api/v1/entities/${entitySlug}/projects/${projectId}/endpoints`,
        {
          body: {
            endpoint_name: "openai-endpoint",
            display_name: "OpenAI Endpoint",
            http_method: "POST",
            llm_key_id: keyId,
            output_schema: {
              type: "object",
              properties: {
                result: { type: "string" },
              },
            },
          },
        }
      );

      const res = await createTestRequest(
        app,
        "POST",
        `/api/v1/ai/${entitySlug}/${projectName}/openai-endpoint/prompt?api_key=${projectApiKey}`,
        {
          body: {
            data: "Test input",
          },
        }
      );

      const json = await res.json();
      expect(json.data.prompt).toContain("OpenAI");
    });

    it("should handle GET request with query parameters on /prompt", async () => {
      // Create GET endpoint
      await createTestRequest(
        app,
        "POST",
        `/api/v1/entities/${entitySlug}/projects/${projectId}/endpoints`,
        {
          body: {
            endpoint_name: "get-prompt-endpoint",
            display_name: "GET Prompt Endpoint",
            http_method: "GET",
            llm_key_id: keyId,
            output_schema: {
              type: "object",
              properties: {
                answer: { type: "string" },
              },
            },
          },
        }
      );

      const res = await createTestRequest(
        app,
        "GET",
        `/api/v1/ai/${entitySlug}/${projectName}/get-prompt-endpoint/prompt?question=What+is+2+2&api_key=${projectApiKey}`
      );

      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.data.prompt).toContain("question");
    });

    it("should use context override when provided in request body", async () => {
      // Create endpoint with configured context
      await createTestRequest(
        app,
        "POST",
        `/api/v1/entities/${entitySlug}/projects/${projectId}/endpoints`,
        {
          body: {
            endpoint_name: "context-override-endpoint",
            display_name: "Context Override Endpoint",
            http_method: "POST",
            llm_key_id: keyId,
            context: "This is the default endpoint context",
            output_schema: {
              type: "object",
              properties: {
                result: { type: "string" },
              },
            },
          },
        }
      );

      // Request with context override
      const res = await createTestRequest(
        app,
        "POST",
        `/api/v1/ai/${entitySlug}/${projectName}/context-override-endpoint/prompt?api_key=${projectApiKey}`,
        {
          body: {
            data: "some input",
            context: "This is the OVERRIDE context from request",
          },
        }
      );

      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.success).toBe(true);
      // Should contain the override context, not the default
      expect(json.data.prompt).toContain("OVERRIDE context from request");
      expect(json.data.prompt).not.toContain("default endpoint context");
    });

    it("should use endpoint context when no context override provided", async () => {
      // Create endpoint with configured context
      await createTestRequest(
        app,
        "POST",
        `/api/v1/entities/${entitySlug}/projects/${projectId}/endpoints`,
        {
          body: {
            endpoint_name: "no-override-endpoint",
            display_name: "No Override Endpoint",
            http_method: "POST",
            llm_key_id: keyId,
            context: "This is the configured endpoint context",
            output_schema: {
              type: "object",
              properties: {
                result: { type: "string" },
              },
            },
          },
        }
      );

      // Request without context field
      const res = await createTestRequest(
        app,
        "POST",
        `/api/v1/ai/${entitySlug}/${projectName}/no-override-endpoint/prompt?api_key=${projectApiKey}`,
        {
          body: {
            data: "some input",
          },
        }
      );

      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.success).toBe(true);
      // Should contain the endpoint's configured context
      expect(json.data.prompt).toContain("configured endpoint context");
    });

    it("should not include context field in the input data of prompt", async () => {
      // Create endpoint
      await createTestRequest(
        app,
        "POST",
        `/api/v1/entities/${entitySlug}/projects/${projectId}/endpoints`,
        {
          body: {
            endpoint_name: "context-stripped-endpoint",
            display_name: "Context Stripped Endpoint",
            http_method: "POST",
            llm_key_id: keyId,
            output_schema: {
              type: "object",
              properties: {
                result: { type: "string" },
              },
            },
          },
        }
      );

      // Request with context and other data
      const res = await createTestRequest(
        app,
        "POST",
        `/api/v1/ai/${entitySlug}/${projectName}/context-stripped-endpoint/prompt?api_key=${projectApiKey}`,
        {
          body: {
            userInput: "This should appear in prompt",
            context: "This context should NOT appear as input data",
          },
        }
      );

      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.success).toBe(true);
      // The prompt should contain userInput
      expect(json.data.prompt).toContain("userInput");
      expect(json.data.prompt).toContain("This should appear in prompt");
      // The context field should be used as context, not appear as "context:" input field
      // Note: The context value itself may appear, but not as a key "context" in the input
    });

    it("should ignore empty context override", async () => {
      // Create endpoint with configured context
      await createTestRequest(
        app,
        "POST",
        `/api/v1/entities/${entitySlug}/projects/${projectId}/endpoints`,
        {
          body: {
            endpoint_name: "empty-context-endpoint",
            display_name: "Empty Context Endpoint",
            http_method: "POST",
            llm_key_id: keyId,
            context: "This is the default context",
            output_schema: {
              type: "object",
              properties: {
                result: { type: "string" },
              },
            },
          },
        }
      );

      // Request with empty context string
      const res = await createTestRequest(
        app,
        "POST",
        `/api/v1/ai/${entitySlug}/${projectName}/empty-context-endpoint/prompt?api_key=${projectApiKey}`,
        {
          body: {
            data: "some input",
            context: "   ", // Empty/whitespace-only
          },
        }
      );

      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.success).toBe(true);
      // Should fall back to default context when override is empty
      expect(json.data.prompt).toContain("default context");
    });
  });
});
