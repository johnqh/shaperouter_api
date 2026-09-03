/**
 * @fileoverview Zod validation schemas for all API routes
 * @description Defines parameter, body, and query schemas used by
 * route handlers via @hono/zod-validator.
 */

import { z } from "zod";
import { DEFAULT_MAX_OUTPUT_TOKENS } from "@sudobility/shaperouter_types";

// =============================================================================
// Common Param Schemas
// =============================================================================

export const uuidParamSchema = z.object({
  uuid: z.string().uuid(),
});

export const userIdParamSchema = z.object({
  userId: z.string().min(1).max(128),
});

export const keyIdParamSchema = z.object({
  entitySlug: z.string().min(1).max(12),
  keyId: z.string().uuid(),
});

export const projectIdParamSchema = z.object({
  entitySlug: z.string().min(1).max(12),
  projectId: z.string().uuid(),
});

export const endpointIdParamSchema = z.object({
  entitySlug: z.string().min(1).max(12),
  projectId: z.string().uuid(),
  endpointId: z.string().uuid(),
});

export const entitySlugParamSchema = z.object({
  entitySlug: z.string().min(1).max(12),
});

// Entity API keys ("shrouteent_...")
export const entityApiKeyIdParamSchema = z.object({
  entitySlug: z.string().min(1).max(12),
  keyId: z.string().uuid(),
});

export const entityApiKeyCreateSchema = z.object({
  key_name: z.string().min(1).max(255),
});

export const entityApiKeyUpdateSchema = z
  .object({
    key_name: z.string().min(1).max(255).optional(),
    is_active: z.boolean().optional(),
  })
  .refine(data => data.key_name !== undefined || data.is_active !== undefined, {
    message: "Provide key_name or is_active",
  });

export const aiParamSchema = z.object({
  organizationPath: z
    .string()
    .min(1)
    .max(255)
    .regex(
      /^[a-zA-Z0-9_]+$/,
      "Must contain only letters, numbers, and underscores"
    ),
  projectName: z
    .string()
    .min(1)
    .max(255)
    .regex(/^[a-z0-9][a-z0-9-]*[a-z0-9]$|^[a-z0-9]$/),
  endpointName: z
    .string()
    .min(1)
    .max(255)
    .regex(/^[a-z0-9][a-z0-9-]*[a-z0-9]$|^[a-z0-9]$/),
});

// =============================================================================
// LLM Provider Enum
// =============================================================================

export const llmProviderSchema = z.enum([
  "openai",
  "anthropic",
  "gemini",
  "mistral",
  "cohere",
  "groq",
  "xai",
  "deepseek",
  "perplexity",
  "lm_studio",
]);

export const httpMethodSchema = z.enum(["GET", "POST"]);

// =============================================================================
// JSON Schema (simplified validation)
// =============================================================================

export const jsonSchemaSchema: z.ZodType<Record<string, unknown>> = z.lazy(() =>
  z.record(
    z.union([
      z.string(),
      z.number(),
      z.boolean(),
      z.null(),
      z.array(z.unknown()),
      jsonSchemaSchema,
    ])
  )
);

// =============================================================================
// LLM API Key Schemas
// =============================================================================

export const keyCreateSchema = z
  .object({
    key_name: z.string().min(1).max(255),
    provider: llmProviderSchema,
    api_key: z.string().min(1).optional(),
    endpoint_url: z.string().url().optional(),
  })
  .refine(
    data => {
      // For API-based providers, api_key is required
      if (data.provider !== "lm_studio") {
        return !!data.api_key;
      }
      // For lm_studio, endpoint_url is required
      return !!data.endpoint_url;
    },
    {
      message:
        "api_key is required for API providers, endpoint_url is required for lm_studio",
    }
  );

export const keyUpdateSchema = z.object({
  key_name: z.string().min(1).max(255).optional(),
  api_key: z.string().min(1).optional(),
  endpoint_url: z.string().url().optional(),
  is_active: z.boolean().optional(),
});

// =============================================================================
// Project Schemas
// =============================================================================

const projectNameRegex = /^[a-z0-9][a-z0-9-]*[a-z0-9]$|^[a-z0-9]$/;

export const projectCreateSchema = z.object({
  project_name: z
    .string()
    .min(1)
    .max(255)
    .regex(
      projectNameRegex,
      "Must be lowercase alphanumeric with optional hyphens"
    ),
  display_name: z.string().min(1).max(255),
  description: z.string().max(1000).nullish(),
});

export const projectUpdateSchema = z.object({
  project_name: z.string().min(1).max(255).regex(projectNameRegex).optional(),
  display_name: z.string().min(1).max(255).optional(),
  description: z.string().max(1000).nullish(),
  is_active: z.boolean().optional(),
});

// =============================================================================
// Endpoint Schemas
// =============================================================================

const endpointNameRegex = /^[a-z0-9][a-z0-9-]*[a-z0-9]$|^[a-z0-9]$/;

// IPv4 address validation
const ipv4Regex =
  /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;

export const ipv4Schema = z.string().regex(ipv4Regex, "Invalid IPv4 address");

export const ipAllowlistSchema = z.array(ipv4Schema).nullable().optional();

// Media output configuration schema
export const mediaOutputConfigSchema = z
  .object({
    audio: z.boolean().optional(),
    image: z.boolean().optional(),
    video: z.boolean().optional(),
  })
  .nullable()
  .optional();

// Output media format schema
export const outputMediaFormatSchema = z
  .enum(["base64", "url"])
  .nullable()
  .optional();

export const endpointCreateSchema = z.object({
  endpoint_name: z
    .string()
    .min(1)
    .max(255)
    .regex(
      endpointNameRegex,
      "Must be lowercase alphanumeric with optional hyphens"
    ),
  display_name: z.string().min(1).max(255),
  http_method: httpMethodSchema.optional().default("POST"),
  llm_key_id: z.string().uuid(),
  model: z.string().max(255).nullish(),
  input_schema: jsonSchemaSchema.nullish(),
  output_schema: jsonSchemaSchema.nullish(),
  instructions: z.string().max(10000).nullish(),
  context: z.string().max(10000).nullish(),
  expects_media_output: mediaOutputConfigSchema,
  output_media_format: outputMediaFormatSchema,
  web_search: z.boolean().optional().default(false),
  /**
   * Output ceiling. Omitted -> DEFAULT_MAX_OUTPUT_TOKENS, so every creation
   * path (dashboard, API, MCP) gets protection without asking. Explicit null ->
   * no protection, for the operator who genuinely wants an uncapped endpoint.
   */
  max_output_tokens: z
    .number()
    .int()
    .positive()
    .max(1_000_000)
    .nullish()
    .default(DEFAULT_MAX_OUTPUT_TOKENS),
  // For Whisper endpoints: model to use for structured extraction
  transcription_extraction_model: z.string().max(255).nullish(),
});

export const endpointUpdateSchema = z.object({
  endpoint_name: z.string().min(1).max(255).regex(endpointNameRegex).optional(),
  display_name: z.string().min(1).max(255).optional(),
  http_method: httpMethodSchema.optional(),
  llm_key_id: z.string().uuid().optional(),
  model: z.string().max(255).nullish(),
  input_schema: jsonSchemaSchema.nullish(),
  output_schema: jsonSchemaSchema.nullish(),
  instructions: z.string().max(10000).nullish(),
  context: z.string().max(10000).nullish(),
  is_active: z.boolean().optional(),
  ip_allowlist: ipAllowlistSchema,
  expects_media_output: mediaOutputConfigSchema,
  output_media_format: outputMediaFormatSchema,
  web_search: z.boolean().optional(),
  /** Omitted -> unchanged; null -> remove the ceiling. */
  max_output_tokens: z.number().int().positive().max(1_000_000).nullish(),
  // For Whisper endpoints: model to use for structured extraction
  transcription_extraction_model: z.string().max(255).nullish(),
});

// =============================================================================
// Analytics Query Schema
// =============================================================================

export const analyticsQuerySchema = z.object({
  start_date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  end_date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  project_id: z.string().uuid().optional(),
  endpoint_id: z.string().uuid().optional(),
});

// =============================================================================
// User API Key Schemas
// =============================================================================

export const apiKeyIdParamSchema = z.object({
  userId: z.string().min(1).max(128),
  keyId: z.string().uuid(),
});

export const userApiKeyCreateSchema = z.object({
  key_name: z.string().min(1).max(255),
});

export const userApiKeyUpdateSchema = z.object({
  key_name: z.string().min(1).max(255).optional(),
  is_active: z.boolean().optional(),
});

// =============================================================================
// Settings Schemas
// =============================================================================

const organizationPathRegex = /^[a-zA-Z0-9_]+$/;

export const settingsUpdateSchema = z.object({
  organization_name: z.string().min(1).max(255).optional(),
  organization_path: z
    .string()
    .min(1)
    .max(255)
    .regex(
      organizationPathRegex,
      "Must contain only letters, numbers, and underscores"
    )
    .optional(),
});

// =============================================================================
// Storage Config Schemas
// =============================================================================

export const storageProviderSchema = z.enum(["gcs", "s3"]);

// GCS service account credentials schema
export const gcsCredentialsSchema = z.object({
  type: z.literal("service_account"),
  project_id: z.string().min(1),
  private_key_id: z.string().min(1),
  private_key: z.string().min(1),
  client_email: z.string().email(),
  client_id: z.string().min(1),
  auth_uri: z.string().url().optional(),
  token_uri: z.string().url().optional(),
  auth_provider_x509_cert_url: z.string().url().optional(),
  client_x509_cert_url: z.string().url().optional(),
});

// S3 credentials schema
export const s3CredentialsSchema = z.object({
  access_key_id: z.string().min(1),
  secret_access_key: z.string().min(1),
  region: z.string().min(1),
});

// Storage config create schema
export const storageConfigCreateSchema = z
  .object({
    provider: storageProviderSchema,
    bucket: z.string().min(1).max(255),
    path_prefix: z.string().max(500).optional(),
    credentials: z.union([gcsCredentialsSchema, s3CredentialsSchema]),
  })
  .refine(
    data => {
      // Validate credentials match provider
      if (data.provider === "gcs") {
        return (
          "type" in data.credentials &&
          data.credentials.type === "service_account"
        );
      } else {
        return "access_key_id" in data.credentials;
      }
    },
    {
      message: "Credentials must match the storage provider type",
    }
  );

// Storage config update schema (credentials optional for partial update)
export const storageConfigUpdateSchema = z.object({
  bucket: z.string().min(1).max(255).optional(),
  path_prefix: z.string().max(500).nullable().optional(),
  credentials: z.union([gcsCredentialsSchema, s3CredentialsSchema]).optional(),
});

// Storage config response schema (safe version without credentials)
export const storageConfigResponseSchema = z.object({
  uuid: z.string().uuid(),
  entity_id: z.string().uuid(),
  provider: storageProviderSchema,
  bucket: z.string(),
  path_prefix: z.string().nullable(),
  created_at: z.string().datetime().nullable(),
  updated_at: z.string().datetime().nullable(),
});
