import { describe, it, expect, beforeAll, afterAll, beforeEach } from "bun:test";
import { createTestApp, createTestRequest, testUser } from "./utils";
import { cleanupTestUser, createTestUserWithEntity, createTestUsageAnalytics } from "./utils/test-db";
import { initDatabase } from "../src/db";
import type { Hono } from "hono";

describe("Analytics Routes", () => {
  let app: Hono;
  let entitySlug: string;
  let userId: string;
  let projectId: string;
  let keyId: string;
  let endpointId: string;

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

    // Create key, project, and endpoint for analytics tests using entity routes
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

    const endpointRes = await createTestRequest(
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
    const endpointJson = await endpointRes.json();
    endpointId = endpointJson.data.uuid;
  });

  afterAll(async () => {
    await cleanupTestUser(testUser.uid);
  });

  describe("GET /api/v1/entities/:entitySlug/analytics", () => {
    it("should return empty analytics when no usage exists", async () => {
      const res = await createTestRequest(app, "GET", `/api/v1/entities/${entitySlug}/analytics`);
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.data.aggregate.total_requests).toBe(0);
      expect(json.data.by_endpoint).toEqual([]);
    });

    it("should return aggregated analytics", async () => {
      // Create some usage analytics
      await createTestUsageAnalytics(endpointId, {
        success: true,
        tokens_input: 100,
        tokens_output: 50,
        latency_ms: 500,
        estimated_cost_cents: 10,
      });

      await createTestUsageAnalytics(endpointId, {
        success: true,
        tokens_input: 200,
        tokens_output: 100,
        latency_ms: 600,
        estimated_cost_cents: 20,
      });

      await createTestUsageAnalytics(endpointId, {
        success: false,
        error_message: "API error",
        latency_ms: 100,
      });

      const res = await createTestRequest(app, "GET", `/api/v1/entities/${entitySlug}/analytics`);
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.data.aggregate.total_requests).toBe(3);
      expect(json.data.aggregate.successful_requests).toBe(2);
      expect(json.data.aggregate.failed_requests).toBe(1);
      expect(json.data.aggregate.total_tokens_input).toBe(300);
      expect(json.data.aggregate.total_tokens_output).toBe(150);
      expect(json.data.aggregate.total_estimated_cost_cents).toBe(30);
    });

    it("should return analytics by endpoint", async () => {
      // Create usage for first endpoint
      await createTestUsageAnalytics(endpointId, {
        success: true,
        tokens_input: 100,
        tokens_output: 50,
        latency_ms: 500,
        estimated_cost_cents: 10,
      });

      // Create second endpoint
      const endpoint2Res = await createTestRequest(
        app,
        "POST",
        `/api/v1/entities/${entitySlug}/projects/${projectId}/endpoints`,
        {
          body: {
            endpoint_name: "second-endpoint",
            display_name: "Second Endpoint",
            llm_key_id: keyId,
          },
        }
      );
      const endpoint2Json = await endpoint2Res.json();
      const endpoint2Id = endpoint2Json.data.uuid;

      await createTestUsageAnalytics(endpoint2Id, {
        success: true,
        tokens_input: 200,
        tokens_output: 100,
        latency_ms: 600,
        estimated_cost_cents: 20,
      });

      const res = await createTestRequest(app, "GET", `/api/v1/entities/${entitySlug}/analytics`);
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.data.by_endpoint.length).toBe(2);
    });

    it("should filter by date range", async () => {
      // Get today's date in UTC and create a timestamp at noon UTC
      const today = new Date().toISOString().split("T")[0];
      const noonUTC = new Date(today + "T12:00:00Z");

      // Create analytics entry with explicit timestamp at noon UTC
      await createTestUsageAnalytics(endpointId, {
        success: true,
        tokens_input: 100,
        tokens_output: 50,
        latency_ms: 500,
        timestamp: noonUTC,
      });

      const res = await createTestRequest(
        app,
        "GET",
        `/api/v1/entities/${entitySlug}/analytics?start_date=${today}&end_date=${today}`
      );
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.data.aggregate.total_requests).toBeGreaterThanOrEqual(1);
    });

    it("should filter by endpoint_id", async () => {
      // Create analytics for two endpoints
      await createTestUsageAnalytics(endpointId, {
        success: true,
        tokens_input: 100,
        tokens_output: 50,
      });

      const endpoint2Res = await createTestRequest(
        app,
        "POST",
        `/api/v1/entities/${entitySlug}/projects/${projectId}/endpoints`,
        {
          body: {
            endpoint_name: "second-endpoint",
            display_name: "Second Endpoint",
            llm_key_id: keyId,
          },
        }
      );
      const endpoint2Json = await endpoint2Res.json();
      const endpoint2Id = endpoint2Json.data.uuid;

      await createTestUsageAnalytics(endpoint2Id, {
        success: true,
        tokens_input: 200,
        tokens_output: 100,
      });

      const res = await createTestRequest(
        app,
        "GET",
        `/api/v1/entities/${entitySlug}/analytics?endpoint_id=${endpointId}`
      );
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.data.aggregate.total_requests).toBe(1);
      expect(json.data.aggregate.total_tokens_input).toBe(100);
    });

    it("should filter by project_id", async () => {
      await createTestUsageAnalytics(endpointId, {
        success: true,
        tokens_input: 100,
        tokens_output: 50,
      });

      const res = await createTestRequest(
        app,
        "GET",
        `/api/v1/entities/${entitySlug}/analytics?project_id=${projectId}`
      );
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.data.aggregate.total_requests).toBe(1);
    });

    it("should reject access to other entity's analytics", async () => {
      const res = await createTestRequest(
        app,
        "GET",
        `/api/v1/entities/nonexistent-entity-slug/analytics`
      );
      // Should return 404 for entity not found or 403 for access denied
      expect([403, 404]).toContain(res.status);
    });
  });
});
