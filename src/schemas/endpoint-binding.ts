/**
 * @fileoverview How a ShapeRouter endpoint names its provider credential
 */

import { z } from "zod";
import type { EndpointBindingShapes } from "@sudobility/shapeshyft_service";

/** ShapeRouter endpoints name the LLM key they call through. */
export const endpointBinding: EndpointBindingShapes = {
  create: { llm_key_id: z.string().uuid() },
  update: { llm_key_id: z.string().uuid().optional() },
};
