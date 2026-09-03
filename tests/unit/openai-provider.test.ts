import { describe, expect, it } from "vitest";
import { OpenAIProvider } from "../../src/services/llm/openai";

describe("OpenAIProvider", () => {
  it("returns truncated tool-call arguments with usage instead of parsing them", async () => {
    const provider = new OpenAIProvider({ apiKey: "test" });
    (provider as unknown as {
      client: {
        chat: { completions: { create: () => Promise<unknown> } };
      };
    }).client = {
      chat: {
        completions: {
          create: async () => ({
            model: "gpt-5.4",
            usage: {
              prompt_tokens: 12,
              completion_tokens: 99,
              total_tokens: 111,
            },
            choices: [
              {
                finish_reason: "length",
                message: {
                  tool_calls: [
                    {
                      function: {
                        name: "structured_response",
                        arguments: "{\"items\":[",
                      },
                    },
                  ],
                },
              },
            ],
          }),
        },
      },
    };

    const response = await provider.generate({
      prompt: "write data",
      outputSchema: { type: "object" },
      model: "gpt-5.4",
      maxTokens: 100,
    });

    expect(response.finishReason).toBe("length");
    expect(response.content).toBe("{\"items\":[");
    expect(response.usage).toEqual({
      promptTokens: 12,
      completionTokens: 99,
      totalTokens: 111,
    });
  });
});
