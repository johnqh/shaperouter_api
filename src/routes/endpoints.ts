/**
 * @fileoverview Endpoint CRUD routes
 * @description Manages AI endpoint configurations within projects.
 * Endpoints define the LLM key, model, input/output schemas, and instructions.
 */

import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { eq, and } from "drizzle-orm";
import { db, projects, endpoints, llmApiKeys } from "../db";
import {
  endpointCreateSchema,
  endpointUpdateSchema,
  endpointIdParamSchema,
  projectIdParamSchema,
} from "../schemas";
import {
  successResponse,
  errorResponse,
  type Endpoint,
} from "@sudobility/shaperouter_types";
import {
  getActor,
  getEntityWithPermission,
  getPermissionErrorStatus,
} from "../lib/entity-helpers";

const endpointsRouter = new Hono();

/**
 * Helper to verify project belongs to entity
 */
async function verifyProjectOwnership(entityId: string, projectId: string) {
  const rows = await db
    .select()
    .from(projects)
    .where(and(eq(projects.entity_id, entityId), eq(projects.uuid, projectId)));

  return rows.length > 0 ? rows[0]! : null;
}

/**
 * Helper to verify LLM key belongs to entity
 */
async function verifyKeyOwnership(entityId: string, keyId: string) {
  const rows = await db
    .select()
    .from(llmApiKeys)
    .where(and(eq(llmApiKeys.entity_id, entityId), eq(llmApiKeys.uuid, keyId)));

  return rows.length > 0 ? rows[0]! : null;
}

// GET all endpoints for project
endpointsRouter.get("/", zValidator("param", projectIdParamSchema), async c => {
  try {
    const { entitySlug, projectId } = c.req.valid("param");

    const result = await getEntityWithPermission(entitySlug, getActor(c));
    if (result.error !== undefined) {
      return c.json(
        errorResponse(result.error),
        getPermissionErrorStatus(result.errorCode)
      );
    }

    const project = await verifyProjectOwnership(result.entity.id, projectId);
    if (!project) {
      return c.json(errorResponse("Project not found"), 404);
    }

    const rows = await db
      .select()
      .from(endpoints)
      .where(eq(endpoints.project_id, projectId));

    return c.json(successResponse<Endpoint[]>(rows as Endpoint[]));
  } catch (error: any) {
    console.error("Error getting endpoints:", error);
    return c.json(errorResponse(error.message || "Internal server error"), 500);
  }
});

// GET single endpoint
endpointsRouter.get(
  "/:endpointId",
  zValidator("param", endpointIdParamSchema),
  async c => {
    try {
      const { entitySlug, projectId, endpointId } = c.req.valid("param");

      const result = await getEntityWithPermission(entitySlug, getActor(c));
      if (result.error !== undefined) {
        return c.json(
          errorResponse(result.error),
          getPermissionErrorStatus(result.errorCode)
        );
      }

      const project = await verifyProjectOwnership(result.entity.id, projectId);
      if (!project) {
        return c.json(errorResponse("Project not found"), 404);
      }

      const rows = await db
        .select()
        .from(endpoints)
        .where(
          and(
            eq(endpoints.project_id, projectId),
            eq(endpoints.uuid, endpointId)
          )
        );

      if (rows.length === 0) {
        return c.json(errorResponse("Endpoint not found"), 404);
      }

      return c.json(successResponse<Endpoint>(rows[0] as Endpoint));
    } catch (error: any) {
      console.error("Error getting endpoint:", error);
      return c.json(
        errorResponse(error.message || "Internal server error"),
        500
      );
    }
  }
);

// POST create endpoint
endpointsRouter.post(
  "/",
  zValidator("param", projectIdParamSchema),
  zValidator("json", endpointCreateSchema),
  async c => {
    try {
      const { entitySlug, projectId } = c.req.valid("param");
      const body = c.req.valid("json");

      const result = await getEntityWithPermission(
        entitySlug,
        getActor(c),
        true
      );
      if (result.error !== undefined) {
        return c.json(
          errorResponse(result.error),
          getPermissionErrorStatus(result.errorCode)
        );
      }

      const project = await verifyProjectOwnership(result.entity.id, projectId);
      if (!project) {
        return c.json(errorResponse("Project not found"), 404);
      }

      // Verify LLM key belongs to entity
      const llmKey = await verifyKeyOwnership(
        result.entity.id,
        body.llm_key_id
      );
      if (!llmKey) {
        return c.json(
          errorResponse("LLM key not found or doesn't belong to this entity"),
          400
        );
      }

      // Check for duplicate endpoint name within project
      const existing = await db
        .select()
        .from(endpoints)
        .where(
          and(
            eq(endpoints.project_id, projectId),
            eq(endpoints.endpoint_name, body.endpoint_name)
          )
        );

      if (existing.length > 0) {
        return c.json(
          errorResponse("Endpoint name already exists in this project"),
          409
        );
      }

      const rows = await db
        .insert(endpoints)
        .values({
          project_id: projectId,
          endpoint_name: body.endpoint_name,
          display_name: body.display_name,
          http_method: body.http_method ?? "POST",
          llm_key_id: body.llm_key_id,
          model: body.model ?? null,
          input_schema: body.input_schema ?? null,
          output_schema: body.output_schema ?? null,
          instructions: body.instructions ?? null,
          context: body.context ?? null,
          expects_media_output: body.expects_media_output ?? null,
          output_media_format: body.output_media_format ?? null,
          web_search: body.web_search ?? false,
          // Zod supplies DEFAULT_MAX_OUTPUT_TOKENS when omitted, so `?? null`
          // here only fires for an explicit null -- an opt-out, not an accident.
          max_output_tokens: body.max_output_tokens ?? null,
          transcription_extraction_model:
            body.transcription_extraction_model ?? null,
        })
        .returning();

      return c.json(successResponse<Endpoint>(rows[0] as Endpoint), 201);
    } catch (error: any) {
      console.error("Error creating endpoint:", error);
      return c.json(
        errorResponse(error.message || "Internal server error"),
        500
      );
    }
  }
);

// PUT update endpoint
endpointsRouter.put(
  "/:endpointId",
  zValidator("param", endpointIdParamSchema),
  zValidator("json", endpointUpdateSchema),
  async c => {
    try {
      const { entitySlug, projectId, endpointId } = c.req.valid("param");
      const body = c.req.valid("json");

      const result = await getEntityWithPermission(
        entitySlug,
        getActor(c),
        true
      );
      if (result.error !== undefined) {
        return c.json(
          errorResponse(result.error),
          getPermissionErrorStatus(result.errorCode)
        );
      }

      const project = await verifyProjectOwnership(result.entity.id, projectId);
      if (!project) {
        return c.json(errorResponse("Project not found"), 404);
      }

      // Check if endpoint exists
      const existing = await db
        .select()
        .from(endpoints)
        .where(
          and(
            eq(endpoints.project_id, projectId),
            eq(endpoints.uuid, endpointId)
          )
        );

      if (existing.length === 0) {
        return c.json(errorResponse("Endpoint not found"), 404);
      }

      const current = existing[0]!;

      // If changing LLM key, verify it belongs to entity
      if (body.llm_key_id && body.llm_key_id !== current.llm_key_id) {
        const llmKey = await verifyKeyOwnership(
          result.entity.id,
          body.llm_key_id
        );
        if (!llmKey) {
          return c.json(
            errorResponse("LLM key not found or doesn't belong to this entity"),
            400
          );
        }
      }

      // Check for duplicate endpoint name if changing
      if (body.endpoint_name && body.endpoint_name !== current.endpoint_name) {
        const duplicate = await db
          .select()
          .from(endpoints)
          .where(
            and(
              eq(endpoints.project_id, projectId),
              eq(endpoints.endpoint_name, body.endpoint_name)
            )
          );

        if (duplicate.length > 0) {
          return c.json(
            errorResponse("Endpoint name already exists in this project"),
            409
          );
        }
      }

      // Helper to handle nullable fields - null means clear, undefined means keep current
      const handleNullable = <T>(
        value: T | null | undefined,
        current: T | null
      ): T | null => {
        if (value === null) return null;
        if (value !== undefined) return value;
        return current;
      };

      const rows = await db
        .update(endpoints)
        .set({
          endpoint_name: body.endpoint_name ?? current.endpoint_name,
          display_name: body.display_name ?? current.display_name,
          http_method: body.http_method ?? current.http_method,
          llm_key_id: body.llm_key_id ?? current.llm_key_id,
          model: handleNullable(body.model, current.model),
          input_schema: handleNullable(body.input_schema, current.input_schema),
          output_schema: handleNullable(
            body.output_schema,
            current.output_schema
          ),
          instructions: handleNullable(body.instructions, current.instructions),
          context: handleNullable(body.context, current.context),
          is_active: body.is_active ?? current.is_active,
          ip_allowlist: handleNullable(body.ip_allowlist, current.ip_allowlist),
          expects_media_output: handleNullable(
            body.expects_media_output,
            current.expects_media_output
          ),
          output_media_format: handleNullable(
            body.output_media_format,
            current.output_media_format
          ),
          web_search: body.web_search ?? current.web_search,
          max_output_tokens: handleNullable(
            body.max_output_tokens,
            current.max_output_tokens
          ),
          transcription_extraction_model: handleNullable(
            body.transcription_extraction_model,
            current.transcription_extraction_model
          ),
          updated_at: new Date(),
        })
        .where(eq(endpoints.uuid, endpointId))
        .returning();

      return c.json(successResponse<Endpoint>(rows[0] as Endpoint));
    } catch (error: any) {
      console.error("Error updating endpoint:", error);
      return c.json(
        errorResponse(error.message || "Internal server error"),
        500
      );
    }
  }
);

// DELETE endpoint
endpointsRouter.delete(
  "/:endpointId",
  zValidator("param", endpointIdParamSchema),
  async c => {
    try {
      const { entitySlug, projectId, endpointId } = c.req.valid("param");

      const result = await getEntityWithPermission(
        entitySlug,
        getActor(c),
        true
      );
      if (result.error !== undefined) {
        return c.json(
          errorResponse(result.error),
          getPermissionErrorStatus(result.errorCode)
        );
      }

      const project = await verifyProjectOwnership(result.entity.id, projectId);
      if (!project) {
        return c.json(errorResponse("Project not found"), 404);
      }

      const rows = await db
        .delete(endpoints)
        .where(
          and(
            eq(endpoints.project_id, projectId),
            eq(endpoints.uuid, endpointId)
          )
        )
        .returning();

      if (rows.length === 0) {
        return c.json(errorResponse("Endpoint not found"), 404);
      }

      return c.json(successResponse<Endpoint>(rows[0] as Endpoint));
    } catch (error: any) {
      console.error("Error deleting endpoint:", error);
      return c.json(
        errorResponse(error.message || "Internal server error"),
        500
      );
    }
  }
);

export default endpointsRouter;
