import type {
  ILLMProvider,
  LLMRequest,
  LLMResponse,
  ProviderConfig,
} from "./types";
import { normalizeFinishReason } from "./finish-reason";
import { extractJson } from "./extract-json";

/**
 * Custom LLM Server provider that forwards requests to user's endpoint.
 * Expects the endpoint to follow OpenAI-compatible format.
 * Uses streaming to avoid LM Studio's 300s idle timeout.
 */
export class CustomLLMProvider implements ILLMProvider {
  readonly providerName = "lm_studio" as const;
  private endpointUrl: string;
  private timeout: number;

  constructor(config: ProviderConfig) {
    if (!config.endpointUrl) {
      throw new Error("LLM Server endpoint URL is required");
    }
    // Auto-append /chat/completions for OpenAI-compatible endpoints
    let url = config.endpointUrl;
    if (url.endsWith("/v1")) {
      url = url + "/chat/completions";
    } else if (url.endsWith("/v1/")) {
      url = url + "chat/completions";
    }
    this.endpointUrl = url;
    this.timeout = 600_000; // 10 minutes (local models can be slow)
  }

  async generate(request: LLMRequest): Promise<LLMResponse> {
    const startTime = Date.now();

    const payload = this.buildApiPayload(request);

    let response: Response;
    try {
      response = await fetch(this.endpointUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(this.timeout),
      });
    } catch (fetchError) {
      const errorMsg =
        fetchError instanceof Error ? fetchError.message : String(fetchError);
      throw new Error(
        `Failed to connect to LLM Server at ${this.endpointUrl}: ${errorMsg}`
      );
    }

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`LLM Server error (${response.status}): ${errorText}`);
    }

    const result = (await response.json()) as Record<string, unknown>;
    const latencyMs = Date.now() - startTime;

    // Parse response - try multiple common formats
    const { rawResponse, content } = this.parseResponse(result);
    const usage = this.extractUsage(result);

    return {
      content,
      rawResponse,
      usage,
      model: request.model ?? "custom",
      provider: this.providerName,
      latencyMs,
      finishReason: normalizeFinishReason(
        (
          (result.choices as Array<Record<string, unknown>> | undefined)?.[0] ??
          {}
        ).finish_reason
      ),
    };
  }

  /**
   * Parse response from custom endpoint - supports multiple formats
   */
  private parseResponse(result: Record<string, unknown>): {
    rawResponse: string;
    content: unknown;
  } {
    let rawResponse: string;

    // OpenAI format
    if (result.choices && Array.isArray(result.choices)) {
      const choice = result.choices[0] as Record<string, unknown>;
      const message = choice.message as Record<string, unknown> | undefined;

      if (
        message?.tool_calls &&
        Array.isArray(message.tool_calls) &&
        message.tool_calls.length > 0
      ) {
        const toolCall = message.tool_calls[0] as Record<string, unknown>;
        const func = toolCall.function as Record<string, unknown>;
        rawResponse = func.arguments as string;
      } else if (message?.content) {
        rawResponse = message.content as string;
      } else if (choice.text) {
        rawResponse = choice.text as string;
      } else {
        throw new Error("Unable to parse OpenAI-format response");
      }
    }
    // Anthropic format
    else if (result.content && Array.isArray(result.content)) {
      const contentBlock = result.content[0] as Record<string, unknown>;
      if (contentBlock.type === "tool_use") {
        return {
          rawResponse: JSON.stringify(contentBlock.input),
          content: contentBlock.input,
        };
      } else if (contentBlock.text) {
        rawResponse = contentBlock.text as string;
      } else {
        throw new Error("Unable to parse Anthropic-format response");
      }
    }
    // Direct response format
    else if (typeof result.response === "string") {
      rawResponse = result.response;
    } else if (typeof result.text === "string") {
      rawResponse = result.text;
    } else if (typeof result.output === "string") {
      rawResponse = result.output;
    }
    // Assume entire result is the response
    else {
      rawResponse = JSON.stringify(result);
    }

    // Extract JSON from response
    const extracted = extractJson(rawResponse);
    try {
      const content = this.safeJsonParse(extracted);
      return { rawResponse, content };
    } catch (parseError) {
      const msg =
        parseError instanceof Error ? parseError.message : String(parseError);
      console.error(`[CustomLLM] JSON parse failed: ${msg}`);
      console.error(
        `[CustomLLM] Raw response (first 500 chars): ${rawResponse.slice(0, 500)}`
      );
      console.error(
        `[CustomLLM] Extracted (first 500 chars): ${extracted.slice(0, 500)}`
      );
      throw new Error(`${msg}\n---RAW---\n${rawResponse.slice(0, 1000)}`);
    }
  }

  /**
   * Parse JSON with recovery for common LLM output issues:
   * - Unescaped double quotes inside string values
   * - Literal newlines/tabs inside string values
   * - Invalid escape sequences
   */
  private safeJsonParse(text: string): unknown {
    try {
      return JSON.parse(text);
    } catch {
      // Fix invalid escape sequences first:
      // 1. \' -> ' (common LLM error — valid in JS/Python but invalid in JSON)
      // 2. "\ n" -> "\n" (LLMs sometimes insert a space between backslash and escape char)
      let repaired = text.replace(/\\'/g, "'");
      repaired = repaired.replace(/\\ ([nrtbf"\\\/])/g, "\\$1");

      try {
        return JSON.parse(repaired);
      } catch {
        // noop
      }

      // Repair unescaped quotes inside string values,
      // since regex-based fixes can't match strings correctly with broken quotes
      repaired = this.repairJsonQuotes(repaired);
      try {
        return JSON.parse(repaired);
      } catch {
        // Fix literal newlines/tabs inside JSON string values
        const fixed = repaired.replace(/"(?:[^"\\]|\\.)*"/g, match =>
          match
            .replace(/(?<!\\)\n/g, "\\n")
            .replace(/(?<!\\)\r/g, "\\r")
            .replace(/(?<!\\)\t/g, "\\t")
        );
        try {
          return JSON.parse(fixed);
        } catch {
          // Last resort: strip all control characters inside strings
          const stripped = repaired.replace(/"(?:[^"\\]|\\.)*"/g, match =>
            match.replace(/[\x00-\x1f]/g, " ")
          );
          return JSON.parse(stripped);
        }
      }
    }
  }

  /**
   * Repair unescaped double quotes inside JSON string values.
   * Uses a heuristic: a quote inside a string is structural (closing) if followed
   * by JSON structural characters (:, }, ], ,) after optional whitespace.
   * Otherwise it's an unescaped content quote and gets escaped.
   */
  private repairJsonQuotes(text: string): string {
    const result: string[] = [];
    let i = 0;
    let inString = false;

    while (i < text.length) {
      const ch = text[i]!;

      if (inString) {
        if (ch === "\\") {
          // Escape sequence — pass through both characters
          result.push(ch);
          i++;
          if (i < text.length) {
            result.push(text[i]!);
            i++;
          }
          continue;
        }
        if (ch === '"') {
          // Look ahead past whitespace for a JSON structural character
          let j = i + 1;
          while (j < text.length && " \t\n\r".includes(text[j]!)) {
            j++;
          }
          const next = j < text.length ? text[j]! : "";
          if (
            next === ":" ||
            next === "," ||
            next === "}" ||
            next === "]" ||
            next === ""
          ) {
            // Structural closing quote
            inString = false;
            result.push(ch);
          } else {
            // Unescaped inner quote — escape it
            result.push("\\", '"');
          }
          i++;
          continue;
        }
        result.push(ch);
      } else {
        if (ch === '"') {
          inString = true;
        }
        result.push(ch);
      }
      i++;
    }

    return result.join("");
  }

  /**
   * Extract usage information from response
   */
  private extractUsage(result: Record<string, unknown>): {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  } {
    const usage = result.usage as Record<string, unknown> | undefined;

    if (!usage) {
      return { promptTokens: 0, completionTokens: 0, totalTokens: 0 };
    }

    const promptTokens =
      (usage.prompt_tokens as number) ?? (usage.input_tokens as number) ?? 0;
    const completionTokens =
      (usage.completion_tokens as number) ??
      (usage.output_tokens as number) ??
      0;
    const totalTokens =
      (usage.total_tokens as number) ?? promptTokens + completionTokens;

    return { promptTokens, completionTokens, totalTokens };
  }

  buildApiPayload(request: LLMRequest): Record<string, unknown> {
    // Build OpenAI-compatible payload with multimodal support
    const messages: Array<{
      role: string;
      content: string | Array<Record<string, unknown>>;
    }> = [];

    if (request.systemPrompt) {
      messages.push({ role: "system", content: request.systemPrompt });
    }

    // Build user message content (multimodal if images present)
    if (request.media?.length) {
      const userContent: Array<Record<string, unknown>> = [];

      for (const m of request.media) {
        if (m.type === "image") {
          userContent.push({
            type: "image_url",
            image_url: {
              url:
                m.format === "base64"
                  ? `data:${m.mimeType};base64,${m.data}`
                  : m.data,
            },
          });
        }
      }

      userContent.push({ type: "text", text: request.prompt });
      messages.push({ role: "user", content: userContent });
    } else {
      messages.push({ role: "user", content: request.prompt });
    }

    // Use simple payload for custom LLM servers - rely on system prompt for JSON formatting
    // Many servers don't support response_format or tools
    const payload: Record<string, unknown> = {
      messages,
      temperature: request.temperature ?? 0,
      max_tokens: request.maxTokens,
    };

    // Include model if specified (required when multiple models are loaded, e.g., LM Studio)
    if (request.model) {
      payload.model = request.model;
    }

    return payload;
  }

  /**
   * Get the actual endpoint URL (after auto-append)
   */
  getEndpointUrl(): string {
    return this.endpointUrl;
  }
}
