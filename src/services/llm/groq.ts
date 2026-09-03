/**
 * Groq LLM Provider
 *
 * Groq provides fast inference for various models including Whisper for transcription.
 * For chat completions, Groq uses an OpenAI-compatible API format.
 * For Whisper transcription, a dedicated implementation is needed.
 */

import Groq from "groq-sdk";
import { toFile } from "groq-sdk/uploads";
import type {
  ILLMProvider,
  LLMRequest,
  LLMResponse,
  ProviderConfig,
} from "./types";
import { createLLMProvider } from "./index";
import { getProviderForModel } from "../../config/providers";
import { isTranscriptionModel } from "../../lib/capability-validator";
import { normalizeFinishReason } from "./finish-reason";

const DEFAULT_MODEL = "llama-3.3-70b-versatile";
const DEFAULT_WHISPER_MODEL = "whisper-large-v3";

/**
 * Convert base64 audio data to an Uploadable for the Groq SDK.
 */
async function base64ToUploadable(
  base64Data: string,
  mimeType: string,
  fieldName?: string
): Promise<Awaited<ReturnType<typeof toFile>>> {
  // Validate base64 before decoding
  if (!/^[A-Za-z0-9+/=]+$/.test(base64Data)) {
    throw new Error("Invalid base64 encoding in audio data");
  }

  // Decode base64 to binary
  const binaryString = atob(base64Data);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }

  // Validate buffer is not empty
  if (bytes.length === 0) {
    throw new Error("Audio data decoded to empty buffer");
  }

  // Determine file extension from MIME type
  const extension = mimeType.split("/")[1] ?? "mp3";
  const filename = fieldName
    ? `${fieldName}.${extension}`
    : `audio.${extension}`;

  // Use Groq SDK's toFile utility to create a proper Uploadable
  return toFile(bytes, filename, { type: mimeType });
}

export class GroqProvider implements ILLMProvider {
  readonly providerName = "groq" as const;
  private client: Groq;
  private defaultModel: string;
  private apiKey: string;

  constructor(config: ProviderConfig) {
    if (!config.apiKey) {
      throw new Error("Groq API key is required");
    }
    this.apiKey = config.apiKey;
    this.client = new Groq({ apiKey: config.apiKey });
    this.defaultModel = config.model ?? DEFAULT_MODEL;
  }

  async generate(request: LLMRequest): Promise<LLMResponse> {
    const model = request.model ?? this.defaultModel;

    // Check if this is a transcription model (Whisper)
    if (isTranscriptionModel(model)) {
      return this.generateTranscription(request, model);
    }

    // For non-Whisper models, use chat completions (OpenAI-compatible)
    return this.generateChatCompletion(request, model);
  }

  /**
   * Generate transcription using Whisper model.
   * If an extraction model is configured, the transcription is fed through
   * that model to produce structured output.
   */
  private async generateTranscription(
    request: LLMRequest,
    model: string
  ): Promise<LLMResponse> {
    const startTime = Date.now();

    // Validate: exactly one audio input
    const audioMedia = request.media?.filter(m => m.type === "audio");
    if (!audioMedia || audioMedia.length === 0) {
      throw new Error("Whisper requires exactly one audio input");
    }
    if (audioMedia.length > 1) {
      throw new Error(
        `Whisper accepts only one audio input, got ${audioMedia.length}`
      );
    }

    const audio = audioMedia[0];

    // Convert base64 to Uploadable for SDK
    let audioFile: Awaited<ReturnType<typeof toFile>>;
    try {
      audioFile = await base64ToUploadable(
        audio.data,
        audio.mimeType,
        audio.fieldName
      );
    } catch (error) {
      throw new Error(
        `Invalid audio data: ${error instanceof Error ? error.message : error}`
      );
    }

    // Transcribe using Groq Whisper
    const transcription = await this.client.audio.transcriptions.create({
      file: audioFile,
      model: model || DEFAULT_WHISPER_MODEL,
    });

    const transcriptionText = transcription.text;
    const transcriptionLatency = Date.now() - startTime;

    // If no extraction model configured, return raw transcription
    if (!request.extractionModel) {
      return {
        content: { transcription: transcriptionText },
        rawResponse: transcriptionText,
        usage: {
          promptTokens: 0,
          completionTokens: 0,
          totalTokens: 0,
        },
        model: model || DEFAULT_WHISPER_MODEL,
        provider: this.providerName,
        latencyMs: transcriptionLatency,
        // Whisper transcribes to completion; there is no token ceiling to hit.
        finishReason: "stop",
      };
    }

    // Feed transcription through extraction model for structured output
    const extractionProvider = createLLMProvider(
      getProviderForModel(request.extractionModel),
      {
        apiKey: request.extractionApiKey,
        model: request.extractionModel,
      }
    );

    // Build extraction prompt that includes the transcription
    const extractionPrompt = request.prompt
      ? `${request.prompt}\n\nTranscription:\n${transcriptionText}`
      : `Extract structured data from this transcription:\n\n${transcriptionText}`;

    const extractionRequest: LLMRequest = {
      prompt: extractionPrompt,
      systemPrompt: request.systemPrompt,
      outputSchema: request.outputSchema,
      model: request.extractionModel,
      temperature: request.temperature,
      maxTokens: request.maxTokens,
    };

    const extractionResponse =
      await extractionProvider.generate(extractionRequest);

    // Combine latency from both steps
    return {
      ...extractionResponse,
      // Override latency to include both transcription and extraction
      latencyMs: Date.now() - startTime,
      // Include raw transcription in response for debugging
      rawResponse: JSON.stringify({
        transcription: transcriptionText,
        extraction: extractionResponse.rawResponse,
      }),
    };
  }

  /**
   * Generate chat completion using Groq's OpenAI-compatible API.
   */
  private async generateChatCompletion(
    request: LLMRequest,
    model: string
  ): Promise<LLMResponse> {
    const startTime = Date.now();

    // Build messages
    const messages: Groq.Chat.ChatCompletionMessageParam[] = [];

    if (request.systemPrompt) {
      messages.push({ role: "system", content: request.systemPrompt });
    }

    // For Groq chat models, we don't have native multimodal support
    // Media should have been extracted and replaced with placeholders
    messages.push({ role: "user", content: request.prompt });

    // Use function calling for structured output
    const tools: Groq.Chat.ChatCompletionTool[] = [
      {
        type: "function",
        function: {
          name: "structured_response",
          description: "Generate structured response matching the schema",
          parameters: request.outputSchema as Record<string, unknown>,
        },
      },
    ];

    const response = await this.client.chat.completions.create({
      model,
      messages,
      tools,
      tool_choice: {
        type: "function",
        function: { name: "structured_response" },
      },
      temperature: request.temperature ?? 0,
      max_tokens: request.maxTokens,
    });

    const latencyMs = Date.now() - startTime;

    // Extract structured response from function call
    const toolCall = response.choices[0]?.message.tool_calls?.[0];
    if (!toolCall || toolCall.function.name !== "structured_response") {
      throw new Error("Expected function call response from Groq");
    }

    const rawResponse = toolCall.function.arguments;
    const content = JSON.parse(rawResponse);

    return {
      content,
      rawResponse,
      usage: {
        promptTokens: response.usage?.prompt_tokens ?? 0,
        completionTokens: response.usage?.completion_tokens ?? 0,
        totalTokens: response.usage?.total_tokens ?? 0,
      },
      model: response.model,
      provider: this.providerName,
      latencyMs,
      finishReason: normalizeFinishReason(response.choices[0]?.finish_reason),
    };
  }

  buildApiPayload(request: LLMRequest): Record<string, unknown> {
    const model = request.model ?? this.defaultModel;

    // For Whisper, return transcription request format
    if (isTranscriptionModel(model)) {
      return {
        model,
        // Note: file would be added separately as multipart form data
        response_format: "json",
      };
    }

    // For chat models, return chat completion format
    const messages: Array<Record<string, unknown>> = [];

    if (request.systemPrompt) {
      messages.push({ role: "system", content: request.systemPrompt });
    }
    messages.push({ role: "user", content: request.prompt });

    return {
      model,
      messages,
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
      max_tokens: request.maxTokens,
    };
  }
}
