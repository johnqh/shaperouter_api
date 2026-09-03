import { describe, it, expect, beforeAll, afterAll, beforeEach } from "bun:test";
import { createTestApp, createTestRequest, testUser } from "./utils";
import { cleanupTestUser, createTestUserWithEntity } from "./utils/test-db";
import { initDatabase } from "../src/db";
import type { Hono } from "hono";

describe("Projects Routes", () => {
  let app: Hono;
  let entitySlug: string;
  let userId: string;

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
  });

  afterAll(async () => {
    await cleanupTestUser(testUser.uid);
  });

  describe("GET /api/v1/entities/:entitySlug/projects", () => {
    it("should return empty array when no projects exist", async () => {
      const res = await createTestRequest(app, "GET", `/api/v1/entities/${entitySlug}/projects`);
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.data).toEqual([]);
    });

    it("should return projects for entity", async () => {
      // Create a project first
      await createTestRequest(app, "POST", `/api/v1/entities/${entitySlug}/projects`, {
        body: {
          project_name: "test-project",
          display_name: "Test Project",
        },
      });

      const res = await createTestRequest(app, "GET", `/api/v1/entities/${entitySlug}/projects`);
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.data.length).toBe(1);
      expect(json.data[0].project_name).toBe("test-project");
    });

    it("should return 404 for non-existent entity", async () => {
      const res = await createTestRequest(app, "GET", `/api/v1/entities/nonexist/projects`);
      expect(res.status).toBe(404);
    });
  });

  describe("POST /api/v1/entities/:entitySlug/projects", () => {
    it("should create a new project", async () => {
      const res = await createTestRequest(app, "POST", `/api/v1/entities/${entitySlug}/projects`, {
        body: {
          project_name: "my-api",
          display_name: "My API",
          description: "A test API project",
        },
      });

      expect(res.status).toBe(201);

      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.data.project_name).toBe("my-api");
      expect(json.data.display_name).toBe("My API");
      expect(json.data.description).toBe("A test API project");
      expect(json.data.is_active).toBe(true);
    });

    it("should create project without description", async () => {
      const res = await createTestRequest(app, "POST", `/api/v1/entities/${entitySlug}/projects`, {
        body: {
          project_name: "minimal-project",
          display_name: "Minimal Project",
        },
      });

      expect(res.status).toBe(201);

      const json = await res.json();
      expect(json.data.description).toBeNull();
    });

    it("should reject duplicate project_name for same entity", async () => {
      // Create first project
      await createTestRequest(app, "POST", `/api/v1/entities/${entitySlug}/projects`, {
        body: {
          project_name: "unique-project",
          display_name: "First Project",
        },
      });

      // Try to create duplicate
      const res = await createTestRequest(app, "POST", `/api/v1/entities/${entitySlug}/projects`, {
        body: {
          project_name: "unique-project",
          display_name: "Second Project",
        },
      });

      expect(res.status).toBe(409);
    });

    it("should reject missing project_name", async () => {
      const res = await createTestRequest(app, "POST", `/api/v1/entities/${entitySlug}/projects`, {
        body: {
          display_name: "No Name Project",
        },
      });

      expect(res.status).toBe(400);
    });

    it("should reject missing display_name", async () => {
      const res = await createTestRequest(app, "POST", `/api/v1/entities/${entitySlug}/projects`, {
        body: {
          project_name: "no-display",
        },
      });

      expect(res.status).toBe(400);
    });
  });

  describe("GET /api/v1/entities/:entitySlug/projects/:projectId", () => {
    it("should return a specific project", async () => {
      // Create project first
      const createRes = await createTestRequest(
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
      const createJson = await createRes.json();
      const projectId = createJson.data.uuid;

      const res = await createTestRequest(
        app,
        "GET",
        `/api/v1/entities/${entitySlug}/projects/${projectId}`
      );
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.data.uuid).toBe(projectId);
    });

    it("should return 404 for non-existent project", async () => {
      const res = await createTestRequest(
        app,
        "GET",
        `/api/v1/entities/${entitySlug}/projects/00000000-0000-0000-0000-000000000000`
      );
      expect(res.status).toBe(404);
    });
  });

  describe("PUT /api/v1/entities/:entitySlug/projects/:projectId", () => {
    it("should update project display_name", async () => {
      // Create project first
      const createRes = await createTestRequest(
        app,
        "POST",
        `/api/v1/entities/${entitySlug}/projects`,
        {
          body: {
            project_name: "test-project",
            display_name: "Original Name",
          },
        }
      );
      const createJson = await createRes.json();
      const projectId = createJson.data.uuid;

      const res = await createTestRequest(
        app,
        "PUT",
        `/api/v1/entities/${entitySlug}/projects/${projectId}`,
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

    it("should update project description", async () => {
      // Create project first
      const createRes = await createTestRequest(
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
      const createJson = await createRes.json();
      const projectId = createJson.data.uuid;

      const res = await createTestRequest(
        app,
        "PUT",
        `/api/v1/entities/${entitySlug}/projects/${projectId}`,
        {
          body: {
            description: "New description",
          },
        }
      );

      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.data.description).toBe("New description");
    });

    it("should deactivate project", async () => {
      // Create project first
      const createRes = await createTestRequest(
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
      const createJson = await createRes.json();
      const projectId = createJson.data.uuid;

      const res = await createTestRequest(
        app,
        "PUT",
        `/api/v1/entities/${entitySlug}/projects/${projectId}`,
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

  describe("DELETE /api/v1/entities/:entitySlug/projects/:projectId", () => {
    it("should delete a project", async () => {
      // Create project first
      const createRes = await createTestRequest(
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
      const createJson = await createRes.json();
      const projectId = createJson.data.uuid;

      const res = await createTestRequest(
        app,
        "DELETE",
        `/api/v1/entities/${entitySlug}/projects/${projectId}`
      );
      expect(res.status).toBe(200);

      // Verify deletion
      const getRes = await createTestRequest(
        app,
        "GET",
        `/api/v1/entities/${entitySlug}/projects/${projectId}`
      );
      expect(getRes.status).toBe(404);
    });

    it("should return 404 for non-existent project", async () => {
      const res = await createTestRequest(
        app,
        "DELETE",
        `/api/v1/entities/${entitySlug}/projects/00000000-0000-0000-0000-000000000000`
      );
      expect(res.status).toBe(404);
    });
  });
});
