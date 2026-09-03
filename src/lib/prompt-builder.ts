/**
 * @fileoverview Schema-to-prompt conversion and provider-specific prompt building
 * @description Converts JSON Schema definitions into human-readable prompt instructions,
 * generates example output, and builds provider-optimized system/user prompts.
 */

import type { JsonSchema, LlmProvider } from "@sudobility/shaperouter_types";

/**
 * Convert JSON Schema to human-readable prompt instructions
 */
export function schemaToPromptInstructions(
  schema: JsonSchema,
  depth: number = 0
): string {
  const indent = "  ".repeat(depth);
  const lines: string[] = [];

  const schemaType = schema.type ?? "object";

  if (schemaType === "object" && schema.properties) {
    const required = schema.required ?? [];

    for (const [propName, propSchema] of Object.entries(schema.properties)) {
      const prop = propSchema as JsonSchema;
      const isRequired = required.includes(propName);
      const reqMarker = isRequired ? "(required)" : "(optional)";

      // Handle map type (x-map with additionalProperties)
      if (
        (prop as Record<string, unknown>)["x-map"] &&
        prop.additionalProperties &&
        typeof prop.additionalProperties === "object"
      ) {
        const valueProp = prop.additionalProperties as JsonSchema;
        const keyDesc = (prop as Record<string, unknown>)[
          "x-key-description"
        ] as string | undefined;
        const valueType = valueProp.type ?? "any";
        const valueDesc = valueProp.description ?? "";
        const propDesc = prop.description ?? "";

        lines.push(
          `${indent}- \`${propName}\` (map) ${reqMarker}: ${propDesc}`
        );
        lines.push(`${indent}  Key: string${keyDesc ? ` — ${keyDesc}` : ""}`);
        lines.push(
          `${indent}  Value: ${valueType}${valueDesc ? ` — ${valueDesc}` : ""}`
        );

        // Handle complex value types
        if (valueType === "object" && valueProp.properties) {
          lines.push(`${indent}  Value properties:`);
          lines.push(schemaToPromptInstructions(valueProp, depth + 2));
        } else if (valueType === "array" && valueProp.items) {
          lines.push(`${indent}  (each value is an array of items:)`);
          lines.push(
            schemaToPromptInstructions(valueProp.items as JsonSchema, depth + 2)
          );
        }
        continue;
      }

      const propType = prop.type ?? "any";
      const propDesc = prop.description ?? "";

      lines.push(
        `${indent}- \`${propName}\` (${propType}) ${reqMarker}: ${propDesc}`
      );

      // Handle enums
      if (prop.enum) {
        const enumValues = prop.enum.map(v => `"${v}"`).join(", ");
        lines.push(`${indent}  Allowed values: ${enumValues}`);
      }

      // Handle constraints
      const constraints = extractConstraints(prop);
      if (constraints) {
        lines.push(`${indent}  Constraints: ${constraints}`);
      }

      // Handle nested objects/arrays
      if (propType === "object" && prop.properties) {
        lines.push(`${indent}  Properties:`);
        lines.push(schemaToPromptInstructions(prop, depth + 2));
      } else if (propType === "array" && prop.items) {
        lines.push(`${indent}  (array of items, each item should have:)`);
        lines.push(
          schemaToPromptInstructions(prop.items as JsonSchema, depth + 2)
        );
      }
    }
  }

  return lines.join("\n");
}

/**
 * Extract validation constraints from schema property
 */
function extractConstraints(schema: JsonSchema): string {
  const constraints: string[] = [];

  if (schema.minimum !== undefined) constraints.push(`min: ${schema.minimum}`);
  if (schema.maximum !== undefined) constraints.push(`max: ${schema.maximum}`);
  if (schema.minLength !== undefined)
    constraints.push(`min length: ${schema.minLength}`);
  if (schema.maxLength !== undefined)
    constraints.push(`max length: ${schema.maxLength}`);
  if (schema.pattern) constraints.push(`pattern: ${schema.pattern}`);
  if (schema.format) constraints.push(`format: ${schema.format}`);

  return constraints.join(", ");
}

/**
 * Generate an example object from schema
 */
export function generateSchemaExample(schema: JsonSchema): unknown {
  const schemaType = schema.type ?? "object";

  if (schema.default !== undefined) return schema.default;
  if (schema.enum && schema.enum.length > 0) return schema.enum[0];

  // Map type: object with x-map and additionalProperties
  if (
    schemaType === "object" &&
    (schema as Record<string, unknown>)["x-map"] &&
    schema.additionalProperties &&
    typeof schema.additionalProperties === "object"
  ) {
    const keyDesc = (schema as Record<string, unknown>)["x-key-description"] as
      | string
      | undefined;
    const sampleKey = keyDesc
      ? `<${keyDesc.split(/[\s(,]/)[0].toLowerCase()}>`
      : "<key>";
    return {
      [sampleKey]: generateSchemaExample(
        schema.additionalProperties as JsonSchema
      ),
    };
  }

  if (schemaType === "object" && schema.properties) {
    const example: Record<string, unknown> = {};
    for (const [propName, propSchema] of Object.entries(schema.properties)) {
      example[propName] = generateSchemaExample(propSchema as JsonSchema);
    }
    return example;
  }

  if (schemaType === "array") {
    if (schema.items) {
      return [generateSchemaExample(schema.items as JsonSchema)];
    }
    return [];
  }

  // Primitive types
  switch (schemaType) {
    case "string":
      return "<string>";
    case "number":
      return 0.0;
    case "integer":
      return 0;
    case "boolean":
      return true;
    default:
      return null;
  }
}

/**
 * Check if schema is complex enough to need an example
 */
export function isComplexSchema(schema: JsonSchema): boolean {
  if (!schema.properties) return false;
  const properties = Object.values(schema.properties);
  if (properties.length > 3) return true;
  return properties.some(p => {
    const prop = p as JsonSchema;
    return (
      prop.type === "object" ||
      prop.type === "array" ||
      (prop as Record<string, unknown>)["x-map"]
    );
  });
}

/**
 * Build the system prompt with schema instructions
 */
/**
 * Build the base instruction section.
 */
export function buildBaseInstruction(): string {
  return "You are a helpful assistant that produces structured data output.";
}

/**
 * Build the task description section from the user's endpoint instructions.
 */
export function buildTaskDescriptionSection(
  userDescription: string | null
): string {
  if (!userDescription) return "";
  return `\n## Task Description\n${userDescription}`;
}

/**
 * Build the output structure section from a JSON schema.
 */
export function buildOutputStructureSection(
  outputSchema: JsonSchema | null
): string {
  if (!outputSchema) return "";
  const parts: string[] = [];

  const schemaInstructions = schemaToPromptInstructions(outputSchema);
  parts.push(
    `\n## Output Structure\nYour response must include the following fields:\n${schemaInstructions}`
  );

  if (isComplexSchema(outputSchema)) {
    const example = generateSchemaExample(outputSchema);
    parts.push(
      `\n## Example Output Structure\n\`\`\`json\n${JSON.stringify(example, null, 2)}\n\`\`\``
    );
  }

  return parts.join("\n");
}

/**
 * Build the response format section.
 */
export function buildResponseFormatSection(): string {
  return (
    "\n## Response Format\nRespond with valid JSON only. Do not include any text outside the JSON object. " +
    'IMPORTANT: All string values must use proper JSON escaping — use \\" for double quotes, \\n for newlines, \\\\ for backslashes. ' +
    "Do NOT escape single quotes — \\' is invalid JSON. Write apostrophes and single quotes literally."
  );
}

/**
 * Build the web search routing section. Inserted between the task description
 * and the output structure when the endpoint supports web search.
 * Clarifies the wrapper object and overrides any conflicting rules.
 */
export function buildWebSearchRoutingSection(): string {
  return (
    "\n## Response Wrapper (OVERRIDES conflicting rules above)\n" +
    "Your JSON response is a wrapper object. You MUST always provide `user_data`.\n\n" +
    "- `user_data` (object, REQUIRED) — your IRenderable response goes here. " +
    "Always fill this with either a clarification form or a complete answer.\n" +
    "- `web_search_needed` (boolean, optional, defaults to false) — " +
    "set to true when you would otherwise say 'I don't have real-time data' " +
    "or 'I cannot access current listings'. The system WILL perform a web " +
    "search for you and call you again with the results.\n\n" +
    "When previous rules say 'return one root IRenderable', they mean inside `user_data`.\n\n" +
    "`web_search_needed` = false:\n" +
    "- Asking user for location/preferences/details (clarification)\n" +
    "- Answering from training data (recipes, coding, general knowledge)\n\n" +
    "`web_search_needed` = true:\n" +
    "- You have the user's location/date but need live data (listings, prices, events, weather)\n" +
    "- You would otherwise respond with 'I don't have access to real-time data'"
  );
}

/**
 * Build the system prompt with schema instructions.
 * Composes all sections: base → task description → output structure → response format.
 */
export function buildSystemPrompt(
  userDescription: string | null,
  outputSchema: JsonSchema | null,
  context?: string | null
): string {
  return [
    buildBaseInstruction(),
    buildTaskDescriptionSection(userDescription),
    context ? `\n## Context\n${context}` : "",
    buildOutputStructureSection(outputSchema),
    buildResponseFormatSection(),
  ]
    .filter(Boolean)
    .join("\n");
}

/**
 * Build the user prompt from input data
 */
export function buildUserPrompt(
  inputData: unknown,
  isStructured: boolean
): string {
  if (isStructured && typeof inputData === "object" && inputData !== null) {
    // Format structured input as readable key-value pairs
    const formatted = formatStructuredInput(
      inputData as Record<string, unknown>
    );
    return `Process the following data and generate the structured response:\n\n${formatted}`;
  } else {
    // Free text input
    return `Process the following text and generate the structured response:\n\n${String(inputData)}`;
  }
}

/**
 * Format structured input data for the prompt
 */
export function formatStructuredInput(data: Record<string, unknown>): string {
  const lines: string[] = [];

  for (const [key, value] of Object.entries(data)) {
    if (typeof value === "object" && value !== null && !Array.isArray(value)) {
      lines.push(`- ${key}:`);
      for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
        lines.push(formatStructuredLine(k, v, "    "));
      }
    } else {
      lines.push(formatStructuredLine(key, value, ""));
    }
  }

  return lines.join("\n");
}

function formatStructuredLine(
  key: string,
  value: unknown,
  indent: string
): string {
  if (typeof value === "string" && value.includes("\n")) {
    const block = value
      .split(/\r?\n/)
      .map(line => `${indent}    ${line}`)
      .join("\n");
    return `${indent}- ${key}: |\n${block}`;
  }
  return `${indent}- ${key}: ${JSON.stringify(value)}`;
}

/**
 * Build complete prompts for an LLM request
 */
export function buildPrompts(
  inputData: unknown,
  outputSchema: JsonSchema | null,
  userDescription: string | null,
  isStructuredInput: boolean
): { system: string; user: string } {
  return {
    system: buildSystemPrompt(userDescription, outputSchema),
    user: buildUserPrompt(inputData, isStructuredInput),
  };
}

// =============================================================================
// Provider-Specific Prompt Customization
// =============================================================================

/**
 * Provider-specific prompt configuration
 */
export interface ProviderPromptConfig {
  /** Base instruction for the assistant role */
  baseInstruction: string;
  /** How to format JSON output requirement */
  jsonInstruction: string;
  /** Whether to include example output */
  includeExample: boolean;
  /** Whether to be more verbose in schema descriptions */
  verboseSchema: boolean;
  /** Additional provider-specific instructions */
  additionalInstructions?: string;
}

/**
 * Get provider-specific prompt configuration
 */
export function getProviderPromptConfig(
  provider: LlmProvider
): ProviderPromptConfig {
  switch (provider) {
    case "openai":
      return {
        baseInstruction:
          "You are a helpful assistant that produces structured data output.",
        jsonInstruction:
          "Respond with valid JSON only. Do not include any text outside the JSON object.",
        includeExample: true,
        verboseSchema: false,
      };

    case "anthropic":
      return {
        baseInstruction:
          "You are Claude, an AI assistant. Your task is to analyze the input and produce structured data output.",
        jsonInstruction:
          "Output valid JSON only. Do not include markdown code blocks, explanations, or any text outside the JSON object.",
        includeExample: true,
        verboseSchema: true,
        additionalInstructions:
          "Think step by step about the data structure before generating output.",
      };

    case "gemini":
      return {
        baseInstruction:
          "You are a helpful assistant that produces structured JSON data.",
        jsonInstruction:
          "Return only valid JSON matching the specified schema.",
        includeExample: false, // Gemini uses responseSchema natively
        verboseSchema: false,
      };

    case "mistral":
      return {
        baseInstruction:
          "You are a helpful assistant specialized in producing structured data output.",
        jsonInstruction:
          'Respond with valid JSON only. No markdown, no explanations, just the JSON object. Use proper JSON escaping in strings — \\" for double quotes, \\n for newlines.',
        includeExample: true,
        verboseSchema: false,
      };

    case "cohere":
      return {
        baseInstruction:
          "You are a helpful assistant that generates structured data responses.",
        jsonInstruction:
          'Output valid JSON only. Do not include any text, markdown, or explanations outside the JSON. Use proper JSON escaping in strings — \\" for double quotes, \\n for newlines.',
        includeExample: true,
        verboseSchema: true,
      };

    case "groq":
      return {
        baseInstruction:
          "You are a fast, efficient assistant that produces structured data.",
        jsonInstruction:
          'Respond with valid JSON only. Use proper JSON escaping in strings — \\" for double quotes, \\n for newlines.',
        includeExample: true,
        verboseSchema: false,
      };

    case "xai":
      return {
        baseInstruction:
          "You are Grok, an AI assistant. Generate structured data output based on the given input.",
        jsonInstruction:
          'Return valid JSON only. No additional text or formatting. Use proper JSON escaping in strings — \\" for double quotes, \\n for newlines.',
        includeExample: true,
        verboseSchema: true,
      };

    case "deepseek":
      return {
        baseInstruction:
          "You are a helpful assistant that produces structured JSON output.",
        jsonInstruction:
          'Respond with valid JSON only. Do not include markdown code blocks or any text outside the JSON. Use proper JSON escaping in strings — \\" for double quotes, \\n for newlines.',
        includeExample: true,
        verboseSchema: true,
        additionalInstructions:
          "Analyze the input carefully before generating the structured response.",
      };

    case "perplexity":
      return {
        baseInstruction:
          "You are a helpful assistant that produces structured data output based on available information.",
        jsonInstruction:
          'Output valid JSON only. No citations, no explanations, just the JSON object. Use proper JSON escaping in strings — \\" for double quotes, \\n for newlines.',
        includeExample: true,
        verboseSchema: false,
        additionalInstructions:
          "Focus on the specific data requested, not general information.",
      };

    case "lm_studio":
    default:
      return {
        baseInstruction:
          "You are a precise assistant that produces structured data output. " +
          "You MUST translate exactly what is given — do not add, remove, reword, or interpret the content. " +
          "Do not add explanations, commentary, or extra fields. " +
          "If the input has numbered steps, the output must have the same numbered steps. " +
          "Preserve all technical terms, variable placeholders (like {{value1}}), and formatting exactly as they appear.",
        jsonInstruction:
          "Respond with valid JSON only. Do not include any text, markdown code blocks, or thinking outside the JSON object. " +
          "IMPORTANT: All string values in the JSON must use proper JSON escaping. " +
          'Use \\" for double quotes, \\n for newlines, \\t for tabs, and \\\\ for backslashes inside string values. ' +
          'Do NOT escape single quotes — \\\' is invalid JSON. Write apostrophes and single quotes literally (e.g. "it\'s" not "it\\\'s"). ' +
          "Do not put literal newlines or unescaped special characters inside JSON strings.",
        includeExample: true,
        verboseSchema: false,
      };
  }
}

/**
 * Build system prompt optimized for a specific provider
 */
export function buildSystemPromptForProvider(
  userDescription: string | null,
  outputSchema: JsonSchema | null,
  provider: LlmProvider
): string {
  const config = getProviderPromptConfig(provider);
  const parts: string[] = [];

  // Provider-specific base instruction
  parts.push(config.baseInstruction);

  // User's description
  if (userDescription) {
    parts.push(`\n## Task Description\n${userDescription}`);
  }

  // Schema instructions
  if (outputSchema) {
    const schemaInstructions = schemaToPromptInstructions(outputSchema);
    parts.push(
      `\n## Output Structure\nYour response must include the following fields:\n${schemaInstructions}`
    );

    // Add example if configured and schema is complex
    if (config.includeExample && isComplexSchema(outputSchema)) {
      const example = generateSchemaExample(outputSchema);
      parts.push(
        `\n## Example Output Structure\n\`\`\`json\n${JSON.stringify(example, null, 2)}\n\`\`\``
      );
    }
  }

  // Additional provider-specific instructions
  if (config.additionalInstructions) {
    parts.push(`\n## Additional Guidelines\n${config.additionalInstructions}`);
  }

  // JSON instruction
  parts.push(`\n## Response Format\n${config.jsonInstruction}`);

  return parts.join("\n");
}

/**
 * Build complete prompts optimized for a specific provider
 */
export function buildPromptsForProvider(
  inputData: unknown,
  outputSchema: JsonSchema | null,
  userDescription: string | null,
  isStructuredInput: boolean,
  provider: LlmProvider
): { system: string; user: string } {
  return {
    system: buildSystemPromptForProvider(
      userDescription,
      outputSchema,
      provider
    ),
    user: buildUserPrompt(inputData, isStructuredInput),
  };
}
