/**
 * @fileoverview Zod schemas for ShapeRouter's LLM API key routes
 * @description Moved unchanged from the pre-extraction `schemas/index.ts`; the
 * shared schemas now come from @sudobility/shapeshyft_service.
 */

import { z } from "zod";
import { llmProviderSchema } from "@sudobility/shapeshyft_service";

export const keyIdParamSchema = z.object({
  entitySlug: z.string().min(1).max(12),
  keyId: z.string().uuid(),
});

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
