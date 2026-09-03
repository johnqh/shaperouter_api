import { describe, it, expect } from "vitest";
import type { JsonSchema, LlmProvider } from "@sudobility/shaperouter_types";
import {
  schemaToPromptInstructions,
  generateSchemaExample,
  isComplexSchema,
  buildSystemPrompt,
  buildUserPrompt,
  formatStructuredInput,
  buildPrompts,
  getProviderPromptConfig,
  buildSystemPromptForProvider,
  buildPromptsForProvider,
} from "../../src/lib/prompt-builder";

describe("Prompt Builder", () => {
  describe("schemaToPromptInstructions", () => {
    it("should convert simple object schema", () => {
      const schema: JsonSchema = {
        type: "object",
        properties: {
          name: { type: "string", description: "The person's name" },
          age: { type: "number", description: "The person's age" },
        },
        required: ["name"],
      };

      const result = schemaToPromptInstructions(schema);

      expect(result).toContain("`name`");
      expect(result).toContain("(string)");
      expect(result).toContain("(required)");
      expect(result).toContain("The person's name");
      expect(result).toContain("`age`");
      expect(result).toContain("(optional)");
    });

    it("should handle enums", () => {
      const schema: JsonSchema = {
        type: "object",
        properties: {
          status: {
            type: "string",
            enum: ["active", "inactive", "pending"],
            description: "Current status",
          },
        },
      };

      const result = schemaToPromptInstructions(schema);

      expect(result).toContain("Allowed values:");
      expect(result).toContain('"active"');
      expect(result).toContain('"inactive"');
      expect(result).toContain('"pending"');
    });

    it("should handle nested objects", () => {
      const schema: JsonSchema = {
        type: "object",
        properties: {
          address: {
            type: "object",
            description: "Address info",
            properties: {
              city: { type: "string", description: "City name" },
              zip: { type: "string", description: "ZIP code" },
            },
          },
        },
      };

      const result = schemaToPromptInstructions(schema);

      expect(result).toContain("`address`");
      expect(result).toContain("Properties:");
      expect(result).toContain("`city`");
      expect(result).toContain("`zip`");
    });

    it("should handle arrays", () => {
      const schema: JsonSchema = {
        type: "object",
        properties: {
          tags: {
            type: "array",
            description: "List of tags",
            items: {
              type: "string",
            },
          },
        },
      };

      const result = schemaToPromptInstructions(schema);

      expect(result).toContain("`tags`");
      expect(result).toContain("(array)");
      expect(result).toContain("array of items");
    });

    it("should handle constraints", () => {
      const schema: JsonSchema = {
        type: "object",
        properties: {
          score: {
            type: "number",
            minimum: 0,
            maximum: 100,
            description: "Score value",
          },
          name: {
            type: "string",
            minLength: 1,
            maxLength: 50,
            description: "Name field",
          },
        },
      };

      const result = schemaToPromptInstructions(schema);

      expect(result).toContain("Constraints:");
      expect(result).toContain("min: 0");
      expect(result).toContain("max: 100");
      expect(result).toContain("min length: 1");
      expect(result).toContain("max length: 50");
    });
  });

  describe("generateSchemaExample", () => {
    it("should generate example for simple types", () => {
      expect(generateSchemaExample({ type: "string" })).toBe("<string>");
      expect(generateSchemaExample({ type: "number" })).toBe(0.0);
      expect(generateSchemaExample({ type: "integer" })).toBe(0);
      expect(generateSchemaExample({ type: "boolean" })).toBe(true);
    });

    it("should use default value if provided", () => {
      const schema: JsonSchema = {
        type: "string",
        default: "default-value",
      };

      expect(generateSchemaExample(schema)).toBe("default-value");
    });

    it("should use first enum value", () => {
      const schema: JsonSchema = {
        type: "string",
        enum: ["first", "second", "third"],
      };

      expect(generateSchemaExample(schema)).toBe("first");
    });

    it("should generate object example", () => {
      const schema: JsonSchema = {
        type: "object",
        properties: {
          name: { type: "string" },
          count: { type: "integer" },
        },
      };

      const example = generateSchemaExample(schema);

      expect(example).toEqual({
        name: "<string>",
        count: 0,
      });
    });

    it("should generate array example", () => {
      const schema: JsonSchema = {
        type: "array",
        items: { type: "string" },
      };

      expect(generateSchemaExample(schema)).toEqual(["<string>"]);
    });
  });

  describe("isComplexSchema", () => {
    it("should return false for simple schemas", () => {
      const schema: JsonSchema = {
        type: "object",
        properties: {
          name: { type: "string" },
          age: { type: "number" },
        },
      };

      expect(isComplexSchema(schema)).toBe(false);
    });

    it("should return true for schemas with many properties", () => {
      const schema: JsonSchema = {
        type: "object",
        properties: {
          a: { type: "string" },
          b: { type: "string" },
          c: { type: "string" },
          d: { type: "string" },
        },
      };

      expect(isComplexSchema(schema)).toBe(true);
    });

    it("should return true for nested objects", () => {
      const schema: JsonSchema = {
        type: "object",
        properties: {
          nested: {
            type: "object",
            properties: { x: { type: "string" } },
          },
        },
      };

      expect(isComplexSchema(schema)).toBe(true);
    });

    it("should return true for arrays", () => {
      const schema: JsonSchema = {
        type: "object",
        properties: {
          items: {
            type: "array",
            items: { type: "string" },
          },
        },
      };

      expect(isComplexSchema(schema)).toBe(true);
    });

    it("should return false for no properties", () => {
      const schema: JsonSchema = { type: "object" };

      expect(isComplexSchema(schema)).toBe(false);
    });
  });

  describe("buildSystemPrompt", () => {
    it("should include base instruction", () => {
      const result = buildSystemPrompt(null, null);

      expect(result).toContain("structured data output");
    });

    it("should include user description", () => {
      const result = buildSystemPrompt("Extract person details", null);

      expect(result).toContain("Extract person details");
      expect(result).toContain("Task Description");
    });

    it("should include schema instructions", () => {
      const schema: JsonSchema = {
        type: "object",
        properties: {
          name: { type: "string", description: "Name" },
        },
      };

      const result = buildSystemPrompt(null, schema);

      expect(result).toContain("Output Structure");
      expect(result).toContain("`name`");
    });

    it("should include JSON format instruction", () => {
      const result = buildSystemPrompt(null, null);

      expect(result).toContain("valid JSON");
      expect(result).toContain("Response Format");
    });
  });

  describe("buildUserPrompt", () => {
    it("should format structured input", () => {
      const data = { name: "John", age: 30 };
      const result = buildUserPrompt(data, true);

      expect(result).toContain("Process the following data");
      expect(result).toContain("name");
      expect(result).toContain("John");
    });

    it("should handle free text input", () => {
      const result = buildUserPrompt("Hello world", false);

      expect(result).toContain("Process the following text");
      expect(result).toContain("Hello world");
    });

    it("should handle non-object data as text", () => {
      const result = buildUserPrompt("plain text", true);

      expect(result).toContain("plain text");
    });
  });

  describe("formatStructuredInput", () => {
    it("should format flat object", () => {
      const data = { name: "Alice", count: 5 };
      const result = formatStructuredInput(data);

      expect(result).toContain("- name:");
      expect(result).toContain("- count:");
    });

    it("should format nested object", () => {
      const data = {
        person: {
          name: "Bob",
          age: 25,
        },
      };
      const result = formatStructuredInput(data);

      expect(result).toContain("- person:");
      expect(result).toContain("- name:");
      expect(result).toContain("- age:");
    });

    it("should keep multi-line string fields readable", () => {
      const result = formatStructuredInput({
        brief: "Line one\nLine two",
      });

      expect(result).toContain("- brief: |");
      expect(result).toContain("    Line one");
      expect(result).toContain("    Line two");
      expect(result).not.toContain("\\n");
    });
  });

  describe("buildPrompts", () => {
    it("should return both system and user prompts", () => {
      const result = buildPrompts(
        { data: "test" },
        { type: "object", properties: { result: { type: "string" } } },
        "Test task",
        true
      );

      expect(result).toHaveProperty("system");
      expect(result).toHaveProperty("user");
      expect(result.system).toContain("Test task");
      expect(result.user).toContain("data");
    });
  });

  describe("getProviderPromptConfig", () => {
    const providers: LlmProvider[] = [
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
    ];

    it("should return config for all providers", () => {
      for (const provider of providers) {
        const config = getProviderPromptConfig(provider);

        expect(config).toHaveProperty("baseInstruction");
        expect(config).toHaveProperty("jsonInstruction");
        expect(config).toHaveProperty("includeExample");
        expect(config).toHaveProperty("verboseSchema");
      }
    });

    it("should return anthropic-specific config", () => {
      const config = getProviderPromptConfig("anthropic");

      expect(config.baseInstruction).toContain("Claude");
      expect(config.additionalInstructions).toBeDefined();
    });

    it("should return gemini config without example", () => {
      const config = getProviderPromptConfig("gemini");

      expect(config.includeExample).toBe(false);
    });
  });

  describe("buildSystemPromptForProvider", () => {
    it("should include provider-specific base instruction", () => {
      const result = buildSystemPromptForProvider(null, null, "anthropic");

      expect(result).toContain("Claude");
    });

    it("should include additional instructions when configured", () => {
      const result = buildSystemPromptForProvider(null, null, "anthropic");

      expect(result).toContain("Additional Guidelines");
    });

    it("should work for all providers", () => {
      const providers: LlmProvider[] = [
        "openai",
        "anthropic",
        "gemini",
        "lm_studio",
      ];

      for (const provider of providers) {
        const result = buildSystemPromptForProvider(
          "Test description",
          { type: "object", properties: { x: { type: "string" } } },
          provider
        );

        expect(result).toContain("Test description");
        expect(result).toContain("Response Format");
      }
    });
  });

  describe("buildPromptsForProvider", () => {
    it("should return provider-optimized prompts", () => {
      const result = buildPromptsForProvider(
        { input: "test" },
        { type: "object", properties: { output: { type: "string" } } },
        "Analyze data",
        true,
        "openai"
      );

      expect(result.system).toContain("Analyze data");
      expect(result.user).toContain("input");
    });
  });
});
