/**
 * @fileoverview Anthropic LLM provider
 * @description Implements the ILLMProvider interface for Anthropic Claude models.
 * Uses tool_use for structured output extraction. Supports image input
 * via base64 and URL formats.
 */

import Anthropic from "@anthropic-ai/sdk";
import type {
  ILLMProvider,
  LLMRequest,
  LLMResponse,
  ProviderConfig,
} from "./types";
import { normalizeFinishReason } from "./finish-reason";

// Fallback when an endpoint doesn't pin a model. claude-sonnet-4-20250514 is
// deprecated (retires 2026-06-15); use a current, non-deprecated Sonnet-tier id.
// (Bump to "claude-sonnet-5" or "claude-opus-4-8" for the latest tier.)
const DEFAULT_MODEL = "claude-sonnet-4-6";

export class AnthropicProvider implements ILLMProvider {
  readonly providerName = "anthropic" as const;
  private client: Anthropic;
  private defaultModel: string;

  constructor(config: ProviderConfig) {
    if (!config.apiKey) {
      throw new Error("Anthropic API key is required");
    }
    this.client = new Anthropic({ apiKey: config.apiKey });
    this.defaultModel = config.model ?? DEFAULT_MODEL;
  }

  async generate(request: LLMRequest): Promise<LLMResponse> {
    const model = request.model ?? this.defaultModel;
    const startTime = Date.now();

    // Use tool_use for structured output
    const tools: Anthropic.Tool[] = [
      {
        name: "structured_response",
        description: "Generate structured response matching the schema",
        input_schema: request.outputSchema as Anthropic.Tool.InputSchema,
      },
    ];

    // Build multimodal content blocks
    const userContent: Anthropic.ContentBlockParam[] = [];

    // Add media blocks first (images only for Claude)
    if (request.media?.length) {
      for (const m of request.media) {
        if (m.type === "image") {
          if (m.format === "base64") {
            userContent.push({
              type: "image",
              source: {
                type: "base64",
                media_type: m.mimeType as
                  | "image/jpeg"
                  | "image/png"
                  | "image/gif"
                  | "image/webp",
                data: m.data,
              },
            });
          } else if (m.format === "url") {
            userContent.push({
              type: "image",
              source: {
                type: "url",
                url: m.data,
              },
            });
          }
        }
        // Claude doesn't support audio/video input currently
      }
    }

    // Add text prompt
    userContent.push({ type: "text", text: request.prompt });

    const response = await this.client.messages.create({
      model,
      max_tokens: request.maxTokens ?? 4096,
      system: request.systemPrompt,
      messages: [{ role: "user", content: userContent }],
      tools,
      tool_choice: { type: "tool", name: "structured_response" },
      // `temperature`/`top_p` are rejected (400) on Opus 4.7+, Sonnet 5, and
      // Fable 5. Only send it when a caller explicitly requests one; older
      // models still accept it. Omitting it lets current models work.
      ...(request.temperature !== undefined
        ? { temperature: request.temperature }
        : {}),
    });

    const latencyMs = Date.now() - startTime;

    // Extract structured response from tool use
    const toolUseBlock = response.content.find(
      (block): block is Anthropic.ToolUseBlock => block.type === "tool_use"
    );

    if (!toolUseBlock || toolUseBlock.name !== "structured_response") {
      throw new Error("Expected tool_use response from Anthropic");
    }

    const content = toolUseBlock.input;
    const rawResponse = JSON.stringify(content);

    return {
      content,
      rawResponse,
      usage: {
        promptTokens: response.usage.input_tokens,
        completionTokens: response.usage.output_tokens,
        totalTokens: response.usage.input_tokens + response.usage.output_tokens,
      },
      model: response.model,
      provider: this.providerName,
      latencyMs,
      finishReason: normalizeFinishReason(response.stop_reason),
    };
  }

  buildApiPayload(request: LLMRequest): Record<string, unknown> {
    const model = request.model ?? this.defaultModel;

    // Build multimodal content blocks
    const userContent: Anthropic.ContentBlockParam[] = [];

    // Add media blocks first (images only for Claude)
    if (request.media?.length) {
      for (const m of request.media) {
        if (m.type === "image") {
          if (m.format === "base64") {
            userContent.push({
              type: "image",
              source: {
                type: "base64",
                media_type: m.mimeType as
                  | "image/jpeg"
                  | "image/png"
                  | "image/gif"
                  | "image/webp",
                data: m.data,
              },
            });
          } else if (m.format === "url") {
            userContent.push({
              type: "image",
              source: {
                type: "url",
                url: m.data,
              },
            });
          }
        }
      }
    }

    // Add text prompt
    userContent.push({ type: "text", text: request.prompt });

    return {
      model,
      max_tokens: request.maxTokens ?? 4096,
      system: request.systemPrompt,
      messages: [{ role: "user", content: userContent }],
      tools: [
        {
          name: "structured_response",
          description: "Generate structured response matching the schema",
          input_schema: request.outputSchema,
        },
      ],
      tool_choice: { type: "tool", name: "structured_response" },
      // See generate(): only include temperature when explicitly requested.
      ...(request.temperature !== undefined
        ? { temperature: request.temperature }
        : {}),
    };
  }
}
