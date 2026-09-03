/**
 * @fileoverview API helper for prompt generation and LLM request construction
 * @description Provides the ApiHelper object with methods for generating
 * human-readable prompts, constructing provider-specific API payloads,
 * and building legacy system/user prompt pairs for LLM calls.
 */

import type {
  LlmProvider,
  PromptInput,
  ApiHelperRequestOutput,
  ApiHelperRequestInput,
} from "@sudobility/shaperouter_types";
import {
  buildSystemPrompt,
  buildUserPrompt,
  generateSchemaExample,
  schemaToPromptInstructions,
  isComplexSchema,
  formatStructuredInput,
} from "./prompt-builder";
import {
  createLLMProvider,
  PROVIDER_ENDPOINTS,
  type LLMRequest,
} from "../services/llm";

// Re-export types from shared package
export type {
  PromptInput,
  ApiHelperRequestOutput,
  ApiHelperRequestInput,
} from "@sudobility/shaperouter_types";

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Get provider-specific notes for the prompt
 */
function getProviderNotes(provider: LlmProvider): string {
  switch (provider) {
    case "openai":
      return "Note: This prompt is optimized for OpenAI models (GPT-4, GPT-4o, etc.)";
    case "anthropic":
      return "Note: This prompt is optimized for Anthropic models (Claude)";
    case "gemini":
      return "Note: This prompt is optimized for Google Gemini models";
    case "lm_studio":
      return "Note: This prompt is designed for custom LLM servers";
    default:
      return "";
  }
}

// =============================================================================
// ApiHelper
// =============================================================================

export const ApiHelper = {
  /**
   * Generate a single, human-readable prompt string.
   * Can be pasted into ChatGPT or other chat apps for testing.
   *
   * @param input - The prompt input parameters
   * @returns A combined prompt string
   */
  prompt(input: PromptInput): string {
    const parts: string[] = [];

    // Provider note
    const providerNote = getProviderNotes(input.provider);
    if (providerNote) {
      parts.push(`<!-- ${providerNote} -->\n`);
    }

    // System/Instructions section
    parts.push("# Instructions\n");
    parts.push(
      "You are a helpful assistant that produces structured data output."
    );

    // Task instructions
    if (input.instructions) {
      parts.push(`\n## Task\n${input.instructions}`);
    }

    // Additional context
    if (input.context) {
      parts.push(`\n## Context\n${input.context}`);
    }

    // Output schema instructions
    if (input.outputSchema) {
      const schemaInstructions = schemaToPromptInstructions(input.outputSchema);
      parts.push(
        `\n## Required Output Fields\nYour response must include the following fields:\n${schemaInstructions}`
      );

      // Add example if schema is complex
      if (isComplexSchema(input.outputSchema)) {
        const example = generateSchemaExample(input.outputSchema);
        parts.push(
          `\n## Example Output\n\`\`\`json\n${JSON.stringify(example, null, 2)}\n\`\`\``
        );
      }
    }

    // Response format instruction
    parts.push(
      "\n## Response Format\nRespond with valid JSON only. Do not include any text outside the JSON object."
    );

    // Input section
    parts.push("\n---\n");
    parts.push("# Input\n");

    if (typeof input.inputData === "object" && input.inputData !== null) {
      parts.push("Process the following data:\n");
      parts.push(
        formatStructuredInput(input.inputData as Record<string, unknown>)
      );
    } else {
      parts.push("Process the following data:\n");
      parts.push(JSON.stringify(input.inputData));
    }

    return parts.join("\n");
  },

  /**
   * Construct provider-specific API request payload.
   * Does NOT call the LLM - just constructs the request payload.
   *
   * @param input - The request input parameters
   * @returns The API payload ready to send to the provider
   */
  request(input: ApiHelperRequestInput): ApiHelperRequestOutput {
    const provider = createLLMProvider(input.provider, input.providerConfig);

    // Build prompts in the format expected by buildApiPayload
    // We need to reconstruct system/user prompts from the combined prompt
    // For now, use the combined prompt as the user prompt with a minimal system prompt
    const llmRequest: LLMRequest = {
      prompt: input.prompt,
      systemPrompt:
        "You are a helpful assistant that produces structured data output. Respond with valid JSON only.",
      outputSchema: input.outputSchema,
      model: input.options?.model,
      temperature: input.options?.temperature,
      maxTokens: input.options?.maxTokens,
    };

    const endpointUrl =
      input.provider === "lm_studio"
        ? input.providerConfig.endpointUrl!
        : PROVIDER_ENDPOINTS[input.provider];

    return {
      apiPayload: provider.buildApiPayload(llmRequest),
      endpointUrl,
      provider: input.provider,
    };
  },

  /**
   * Build prompts in the legacy format (system + user) for internal use.
   * Used by the main endpoint when calling the LLM.
   */
  buildLegacyPrompts(input: PromptInput): { system: string; user: string } {
    return {
      system: buildSystemPrompt(
        input.instructions,
        input.outputSchema,
        input.context
      ),
      user: buildUserPrompt(input.inputData, true), // Always structured input
    };
  },
};
