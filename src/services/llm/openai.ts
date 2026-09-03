/**
 * @fileoverview OpenAI LLM provider
 * @description Implements the ILLMProvider interface for OpenAI models.
 * Also used by Mistral, xAI, DeepSeek, Perplexity, and Cohere
 * (OpenAI-compatible APIs). Supports function calling for structured output,
 * multimodal input (images, audio), and audio output generation.
 */

import OpenAI from "openai";
import type {
  FinishReason,
  GeneratedMedia,
  JsonSchema,
} from "@sudobility/shaperouter_types";
import {
  requiresEntityId,
  type ILLMProvider,
  type LLMRequest,
  type LLMResponse,
  type ProviderConfig,
} from "./types";
import { getOpenAIAudioFormat } from "../../lib/media-constants";
import { getModelCapabilities } from "../../config/providers";
import {
  buildOutputStructureSection,
  buildResponseFormatSection,
  buildWebSearchRoutingSection,
} from "../../lib/prompt-builder";
import { normalizeFinishReason } from "./finish-reason";

const DEFAULT_MODEL = "gpt-4o-mini";

class OpenAIProviderError extends Error {
  details?: Record<string, unknown>;

  constructor(message: string, details?: Record<string, unknown>) {
    super(message);
    this.name = "OpenAIProviderError";
    this.details = details;
  }
}

/**
 * What a provider calls its cap on generated tokens.
 *
 * OpenAI's own newer models reject `max_tokens` outright —
 * "Unsupported parameter: 'max_tokens' is not supported with this model. Use
 * 'max_completion_tokens' instead" — while the OpenAI-*compatible* third
 * parties served by this same class (DeepSeek, Mistral, xAI, Perplexity) know
 * only `max_tokens`. One class, two vocabularies, so the caller says which.
 */
export type TokenLimitParam = "max_tokens" | "max_completion_tokens";

/**
 * OpenAI models that reject `max_tokens`.
 *
 * The reasoning-era families — GPT-5 and the o-series. Everything before them
 * (GPT-4o, GPT-4.1) still takes `max_tokens`, and every OpenAI-compatible third
 * party knows only that, so the rule is deliberately narrow rather than
 * "OpenAI always uses the new name".
 *
 * Matched on the family prefix, not an exhaustive list: the point of a family
 * is that its next member behaves like the last, and a list of exact ids would
 * be wrong the day one ships.
 */
const REQUIRES_MAX_COMPLETION_TOKENS = /^(gpt-5|o[1-9])/i;

/**
 * What to call the output cap for this provider and model.
 *
 * Both halves matter. The provider decides the vocabulary available; the model
 * decides which of it applies, and the model is chosen per endpoint rather than
 * per provider — so this cannot be settled when the client is constructed.
 */
export function tokenLimitParamFor(
  isOpenAi: boolean,
  model: string
): TokenLimitParam {
  return isOpenAi && REQUIRES_MAX_COMPLETION_TOKENS.test(model)
    ? "max_completion_tokens"
    : "max_tokens";
}

export class OpenAIProvider implements ILLMProvider {
  readonly providerName = "openai" as const;
  private client: OpenAI;
  private defaultModel: string;

  private disableThinking: boolean;

  /** Whether this client talks to OpenAI itself, or an OpenAI-compatible third party. */
  private isOpenAi: boolean;

  constructor(
    config: ProviderConfig,
    /**
     * Per-provider quirks. Defaults keep every provider that works today
     * working; only one known to need otherwise opts out.
     */
    options: {
      /**
       * Turn the model's chain of thought off.
       *
       * DeepSeek V4 reasons by default, and that is measurably the wrong
       * trade here: the same two-bar plan cost 844 output tokens and 8.6s
       * thinking, against 126 tokens and 2.4s with it off — and the reasoning
       * is discarded, so the caller pays for working it never sees. Worse,
       * thinking mode *rejects* `tool_choice`, so leaving it on also costs the
       * structured-output guarantee.
       *
       * Sent as DeepSeek's native `thinking` object. Its type error on a
       * boolean — "thinking: invalid type: boolean `false`, expected .." — is
       * what identified the parameter.
       */
      disableThinking?: boolean;
      /**
       * True for OpenAI itself. The OpenAI-compatible providers served by this
       * same class (DeepSeek, Mistral, xAI, Perplexity, Cohere) are not, and
       * only know `max_tokens`.
       */
      isOpenAi?: boolean;
    } = {}
  ) {
    this.disableThinking = options.disableThinking ?? false;
    this.isOpenAi = options.isOpenAi ?? false;
    if (!config.apiKey) {
      throw new Error("OpenAI API key is required");
    }
    // Honor a custom base URL so OpenAI-compatible providers (Mistral, xAI,
    // DeepSeek, Perplexity) reach their own API instead of api.openai.com.
    this.client = new OpenAI({
      apiKey: config.apiKey,
      ...(config.endpointUrl ? { baseURL: config.endpointUrl } : {}),
    });
    this.defaultModel = config.model ?? DEFAULT_MODEL;
  }

  async generate(request: LLMRequest): Promise<LLMResponse> {
    console.log(
      `[llm] generate() called, webSearch=${request.webSearch}, model=${request.model}`
    );
    // Use Responses API when web search is enabled
    if (request.webSearch) {
      return this.generateWithSearch(request);
    }

    const model = request.model ?? this.defaultModel;
    const startTime = Date.now();
    const caps = getModelCapabilities(model);
    const generatedMedia: GeneratedMedia[] = [];

    // Build user message content (multimodal)
    const userContent: OpenAI.Chat.ChatCompletionContentPart[] = [];

    if (request.media?.length) {
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
        if (m.type === "audio") {
          // Format already validated at capability validation layer
          const format = getOpenAIAudioFormat(m.mimeType);
          userContent.push({
            type: "input_audio",
            input_audio: {
              data: m.data,
              format,
            },
          } as OpenAI.Chat.ChatCompletionContentPart);
        }
      }
    }

    userContent.push({ type: "text", text: request.prompt });

    // Build messages array
    const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [];
    if (request.systemPrompt) {
      messages.push({ role: "system", content: request.systemPrompt });
    }
    messages.push({ role: "user", content: userContent });

    // Use function calling for structured output
    const tools: OpenAI.Chat.ChatCompletionTool[] = [
      {
        type: "function",
        function: {
          name: "structured_response",
          description: "Generate structured response matching the schema",
          parameters: request.outputSchema as Record<string, unknown>,
        },
      },
    ];

    // Audio output configuration - ONLY enable when endpoint expects audio output
    const modalities: ("text" | "audio")[] = ["text"];
    let audioConfig: { voice: string; format: string } | undefined;

    if (request.expectsMediaOutput?.audio && caps.audioOutput) {
      modalities.push("audio");
      // V1: Output audio format is fixed to mp3
      audioConfig = {
        voice: "alloy", // V1: Fixed to "alloy"
        format: "mp3", // V1: Fixed to "mp3"
      };
    }

    const response = (await this.client.chat.completions.create({
      model,
      messages,
      ...(audioConfig ? { modalities, audio: audioConfig } : {}),
      tools,
      tool_choice: {
        type: "function",
        function: { name: "structured_response" },
      },
      // Off where the model reasons by default: thinking mode rejects
      // `tool_choice` outright, so this is what keeps the line above legal.
      ...(this.disableThinking ? { thinking: { type: "disabled" } } : {}),
      temperature: request.temperature ?? 0,
      [tokenLimitParamFor(this.isOpenAi, model)]: request.maxTokens,
      stream: false,
    } as OpenAI.Chat.ChatCompletionCreateParams)) as OpenAI.Chat.ChatCompletion;

    const latencyMs = Date.now() - startTime;

    // Extract audio from response if present
    const message = response.choices[0]
      ?.message as OpenAI.Chat.ChatCompletionMessage & {
      audio?: { data: string; format: string };
    };
    const audioData = message?.audio;
    if (audioData) {
      const audioMimeType = `audio/${audioData.format}`;

      if (requiresEntityId(request)) {
        // URL output requested but storage upload not implemented in v1
        // For now, return base64 with a warning in the logs
        console.warn(
          "URL output requested but storage upload not implemented. Returning base64."
        );
        generatedMedia.push({
          type: "audio",
          mimeType: audioMimeType,
          data: audioData.data,
        });
      } else {
        // Return base64
        generatedMedia.push({
          type: "audio",
          mimeType: audioMimeType,
          data: audioData.data,
        });
      }
    }

    // Extract structured response from function call
    const toolCall = response.choices[0]?.message.tool_calls?.[0];
    if (!toolCall || toolCall.function.name !== "structured_response") {
      throw new Error("Expected function call response from OpenAI");
    }

    const rawResponse = toolCall.function.arguments;

    const finishReason = normalizeFinishReason(
      response.choices[0]?.finish_reason
    );
    const usage = {
      promptTokens: response.usage?.prompt_tokens ?? 0,
      completionTokens: response.usage?.completion_tokens ?? 0,
      totalTokens: response.usage?.total_tokens ?? 0,
    };

    /*
      Why the stop reason is read BEFORE parsing.

      A model that hits the output ceiling returns arguments cut off mid-value,
      and `JSON.parse` then fails with something like "Expected ']'". Return the
      raw truncated arguments with finishReason instead, so the route can mark
      the response as truncated and preserve usage for the caller.
    */
    if (finishReason === "length") {
      return {
        content: rawResponse,
        rawResponse,
        usage,
        model: response.model,
        provider: this.providerName,
        latencyMs,
        finishReason,
        generatedMedia: generatedMedia.length > 0 ? generatedMedia : undefined,
      };
    }

    let content: unknown;
    try {
      content = JSON.parse(rawResponse);
    } catch (error) {
      // Not truncated, so genuinely malformed. Carry a head of the payload:
      // "Unable to parse JSON string" alone leaves nothing to diagnose from.
      throw new Error(
        `Model returned unparseable JSON (${error instanceof Error ? error.message : String(error)}). First 300 chars: ${rawResponse.slice(0, 300)}`
      );
    }

    return {
      content,
      rawResponse,
      usage,
      model: response.model,
      provider: this.providerName,
      latencyMs,
      finishReason,
      generatedMedia: generatedMedia.length > 0 ? generatedMedia : undefined,
    };
  }

  /**
   * Generate using the OpenAI Responses API with web search enabled.
   * The model can search the web and then call the structured_response function.
   */
  // ---------------------------------------------------------------------------
  // Web-search-aware generation (3-step)
  // ---------------------------------------------------------------------------

  private static INPUT_LAYOUTS = new Set([
    "input_text",
    "input_numeric",
    "input_date",
    "input_email",
    "input_phone",
    "search",
    "line_select",
    "line_toggle",
    "line_slider",
  ]);

  /** Check if a renderable tree contains input controls (clarification). */
  private containsInputControls(data: unknown): boolean {
    if (typeof data !== "object" || data === null) return false;
    const obj = data as Record<string, unknown>;
    const view = obj.view as Record<string, unknown> | undefined;
    if (view?.layout && OpenAIProvider.INPUT_LAYOUTS.has(view.layout as string))
      return true;
    const children = (view?.children ?? obj.children) as unknown[] | undefined;
    if (Array.isArray(children)) {
      return children.some(child => this.containsInputControls(child));
    }
    return false;
  }

  /**
   * Wrap the user's output schema in a container that lets the AI signal
   * whether it needs a web search before it can answer.
   */
  private buildTriageSchema(
    userSchema: Record<string, unknown>
  ): Record<string, unknown> {
    return {
      type: "object",
      required: ["user_data"],
      properties: {
        user_data: userSchema,
        web_search_needed: {
          type: "boolean",
          default: false,
          description:
            "Set to true when you would say 'I don't have real-time data' or " +
            "'I cannot access current listings'. The system WILL perform a web search " +
            "and provide you the results. Set to false when asking for clarification " +
            "or when you can answer from training data.",
        },
      },
      additionalProperties: false,
    };
  }

  /**
   * Build the system prompt for step 1: try to answer fully, signal
   * web_search_needed only if real-time data is genuinely required.
   */

  /**
   * Call the Responses API with a forced function call.
   * Used for both the triage step and the structuring step.
   */
  private async callResponsesStructured(
    model: string,
    input: OpenAI.Responses.ResponseInputItem[],
    schema: Record<string, unknown>,
    temperature: number,
    maxTokens?: number
  ): Promise<{
    content: unknown;
    rawResponse: string;
    usage: { inputTokens: number; outputTokens: number };
    model: string;
    finishReason?: FinishReason;
  }> {
    console.log(
      `[web-search] callResponsesStructured() calling Responses API, model=${model}`
    );
    const response = await this.client.responses.create({
      model,
      input,
      tools: [
        {
          type: "function",
          name: "structured_response",
          description: "Generate structured response matching the schema",
          parameters: schema,
          strict: false,
        },
      ],
      tool_choice: {
        type: "function",
        name: "structured_response",
      },
      temperature,
      max_output_tokens: maxTokens,
    });

    const functionCall = response.output.find(
      (item): item is OpenAI.Responses.ResponseFunctionToolCall =>
        item.type === "function_call" && item.name === "structured_response"
    );

    if (!functionCall) {
      throw new OpenAIProviderError(
        "Expected structured_response function call from Responses API",
        {
          model,
          responseId: response.id,
          outputItems: response.output.map(item => ({
            type: item.type,
            ...("name" in item ? { name: item.name } : {}),
          })),
        }
      );
    }

    return {
      content: JSON.parse(functionCall.arguments),
      rawResponse: functionCall.arguments,
      usage: {
        inputTokens: response.usage?.input_tokens ?? 0,
        outputTokens: response.usage?.output_tokens ?? 0,
      },
      model: response.model,
      // The Responses API reports truncation as an incomplete status with a
      // reason, rather than a finish_reason on the choice.
      finishReason:
        response.status === "incomplete"
          ? normalizeFinishReason(response.incomplete_details?.reason)
          : "stop",
    };
  }

  /**
   * Search the web via the Responses API and return a text summary.
   */
  private async searchWeb(
    model: string,
    query: string,
    temperature: number
  ): Promise<{
    summary: string;
    usage: { inputTokens: number; outputTokens: number };
  }> {
    console.log(
      `[web-search] searchWeb() calling Responses API for query: "${query.substring(0, 100)}..."`
    );
    const response = await this.client.responses.create({
      model,
      input: [
        {
          role: "developer" as const,
          content:
            "Search the web for the requested information. " +
            "Return a thorough summary of the results with specific details, " +
            "names, addresses, dates, and URLs when available.",
        },
        { role: "user" as const, content: query },
      ],
      tools: [{ type: "web_search_preview" }],
      temperature,
    });

    return {
      summary: response.output_text ?? "",
      usage: {
        inputTokens: response.usage?.input_tokens ?? 0,
        outputTokens: response.usage?.output_tokens ?? 0,
      },
    };
  }

  /** Build Responses API input from an LLM request. */
  private buildResponsesInput(
    systemPrompt: string | undefined,
    userPrompt: string,
    media?: LLMRequest["media"]
  ): OpenAI.Responses.ResponseInputItem[] {
    const input: OpenAI.Responses.ResponseInputItem[] = [];

    if (systemPrompt) {
      input.push({ role: "developer" as const, content: systemPrompt });
    }

    const userContent: OpenAI.Responses.ResponseInputContent[] = [];
    if (media?.length) {
      for (const m of media) {
        if (m.type === "image") {
          userContent.push({
            type: "input_image",
            image_url:
              m.format === "base64"
                ? `data:${m.mimeType};base64,${m.data}`
                : m.data,
            detail: "auto",
          });
        }
      }
    }
    userContent.push({ type: "input_text", text: userPrompt });
    input.push({ role: "user" as const, content: userContent });

    return input;
  }

  /**
   * Main entry point when web search is enabled on the endpoint.
   *
   * 1. Try to answer via Responses API with triage wrapper schema.
   *    AI provides full answer OR signals web_search_needed.
   * 2. If no search needed → return user_data directly.
   * 3. If search needed → web search → structure results.
   */
  private async generateWithSearch(request: LLMRequest): Promise<LLMResponse> {
    console.log(`[web-search] generateWithSearch() entered`);
    const model = request.model ?? this.defaultModel;
    const startTime = Date.now();
    const userSchema = request.outputSchema as Record<string, unknown>;
    const temperature = request.temperature ?? 0;

    let totalInputTokens = 0;
    let totalOutputTokens = 0;

    // --- Step 1: Try to answer (Responses API, forced function call) ------
    console.log(
      `[web-search] Step 1: Triage via Responses API, model=${model}`
    );

    const triageSchema = this.buildTriageSchema(userSchema);

    // Replace the output structure / example / response format sections
    // with ones generated from the triage wrapper schema.
    // Keep everything before "## Output Structure" (base + task description + rules).
    const systemPrompt = request.systemPrompt ?? "";
    const outputStructureIdx = systemPrompt.indexOf("\n## Output Structure");
    const basePart =
      outputStructureIdx >= 0
        ? systemPrompt.substring(0, outputStructureIdx)
        : systemPrompt;

    const triageSystemPrompt =
      basePart +
      buildWebSearchRoutingSection() +
      buildOutputStructureSection(triageSchema as JsonSchema) +
      buildResponseFormatSection();
    console.log(`[web-search] System prompt:\n${triageSystemPrompt}`);

    const triageInput = this.buildResponsesInput(
      triageSystemPrompt,
      request.prompt,
      request.media
    );

    const triageResult = await this.callResponsesStructured(
      model,
      triageInput,
      triageSchema,
      temperature,
      request.maxTokens
    );

    totalInputTokens += triageResult.usage.inputTokens;
    totalOutputTokens += triageResult.usage.outputTokens;

    const triageData = triageResult.content as {
      web_search_needed?: boolean;
      user_data?: unknown;
    };

    console.log(
      `[web-search] Triage result: web_search_needed=${triageData.web_search_needed}`
    );

    // --- If no search needed, or user_data is a clarification form, return directly
    const isClarification = this.containsInputControls(triageData.user_data);
    const shouldSearch =
      triageData.web_search_needed === true && !isClarification;

    if (!shouldSearch) {
      if (isClarification && triageData.web_search_needed) {
        console.log(
          `[web-search] AI set web_search_needed=true but response contains input controls — returning clarification`
        );
      } else {
        console.log(
          `[web-search] No search needed (web_search_needed=${triageData.web_search_needed}), returning user_data`
        );
      }
      const rawResponse = JSON.stringify(triageData.user_data);
      return {
        content: triageData.user_data,
        rawResponse,
        usage: {
          promptTokens: totalInputTokens,
          completionTokens: totalOutputTokens,
          totalTokens: totalInputTokens + totalOutputTokens,
        },
        model: triageResult.model,
        provider: this.providerName,
        latencyMs: Date.now() - startTime,
        finishReason: triageResult.finishReason,
      };
    }

    // --- Step 2: Web search -----------------------------------------------
    console.log(`[web-search] Step 2: Searching the web`);
    const searchResult = await this.searchWeb(
      model,
      request.prompt,
      temperature
    );

    totalInputTokens += searchResult.usage.inputTokens;
    totalOutputTokens += searchResult.usage.outputTokens;
    console.log(
      `[web-search] Step 2 done: ${searchResult.summary.length} chars`
    );

    // --- Step 3: Structure search results (Responses API) -----------------
    console.log(`[web-search] Step 3: Structuring search results`);

    const structureSystemPrompt =
      (request.systemPrompt ?? "") +
      "\n\n## Important\n" +
      "You are being given web search results. Use ONLY the facts from " +
      "these results to build your response. Do not fabricate any names, " +
      "addresses, or data not found in the search results.";

    const structureInput = this.buildResponsesInput(
      structureSystemPrompt,
      `Original request: ${request.prompt}\n\n` +
        `Web search results:\n\n${searchResult.summary}\n\n` +
        "Using ONLY the information from the web search results above, " +
        "generate the structured response."
    );

    const structureResult = await this.callResponsesStructured(
      model,
      structureInput,
      userSchema,
      temperature,
      request.maxTokens
    );

    totalInputTokens += structureResult.usage.inputTokens;
    totalOutputTokens += structureResult.usage.outputTokens;

    console.log(
      `[web-search] Step 3 done, total time: ${Date.now() - startTime}ms`
    );

    return {
      content: structureResult.content,
      rawResponse: structureResult.rawResponse,
      usage: {
        promptTokens: totalInputTokens,
        completionTokens: totalOutputTokens,
        totalTokens: totalInputTokens + totalOutputTokens,
      },
      model: structureResult.model,
      provider: this.providerName,
      latencyMs: Date.now() - startTime,
      finishReason: structureResult.finishReason,
    };
  }

  buildApiPayload(request: LLMRequest): Record<string, unknown> {
    const model = request.model ?? this.defaultModel;
    const caps = getModelCapabilities(model);

    // Build user message content (multimodal)
    const userContent: Array<Record<string, unknown>> = [];

    if (request.media?.length) {
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
        if (m.type === "audio") {
          const format = getOpenAIAudioFormat(m.mimeType);
          userContent.push({
            type: "input_audio",
            input_audio: {
              data: m.data,
              format,
            },
          });
        }
      }
    }

    userContent.push({ type: "text", text: request.prompt });

    // Build messages array
    const messages: Array<Record<string, unknown>> = [];
    if (request.systemPrompt) {
      messages.push({ role: "system", content: request.systemPrompt });
    }
    messages.push({ role: "user", content: userContent });

    // Audio output configuration
    const modalities: string[] = ["text"];
    let audioConfig: Record<string, unknown> | undefined;

    if (request.expectsMediaOutput?.audio && caps.audioOutput) {
      modalities.push("audio");
      audioConfig = {
        voice: "alloy",
        format: "mp3",
      };
    }

    return {
      model,
      messages,
      ...(audioConfig ? { modalities, audio: audioConfig } : {}),
      tools: [
        {
          type: "function",
          function: {
            name: "structured_response",
            description: "Generate structured response matching the schema",
            parameters: request.outputSchema,
          },
        },
      ],
      tool_choice: {
        type: "function",
        function: { name: "structured_response" },
      },
      temperature: request.temperature ?? 0,
      [tokenLimitParamFor(this.isOpenAi, model)]: request.maxTokens,
    };
  }
}
