/**
 * @fileoverview LLM provider factory and exports
 * @description Creates the appropriate LLM provider instance based on provider type.
 * OpenAI-compatible providers (Mistral, xAI, DeepSeek, Perplexity, Cohere) reuse
 * the OpenAIProvider class. Groq has a dedicated provider for Whisper transcription.
 */

import type { LlmProvider } from "@sudobility/shaperouter_types";
import type { ILLMProvider, ProviderConfig } from "./types";
import { OpenAIProvider } from "./openai";
import { AnthropicProvider } from "./anthropic";
import { GeminiProvider } from "./gemini";
import { GroqProvider } from "./groq";
import { CustomLLMProvider } from "./custom";

export type {
  ILLMProvider,
  LLMRequest,
  LLMResponse,
  ProviderConfig,
} from "./types";
export { estimateCost, getModelPricing } from "./types";

/**
 * Create an LLM provider instance based on provider type
 */
export function createLLMProvider(
  providerType: LlmProvider,
  config: ProviderConfig
): ILLMProvider {
  switch (providerType) {
    case "openai":
      // The only caller that is OpenAI itself: its newer models name the output
      // cap `max_completion_tokens`, which the compatible providers do not know.
      return new OpenAIProvider(config, { isOpenAi: true });
    case "anthropic":
      return new AnthropicProvider(config);
    case "gemini":
      return new GeminiProvider(config);
    case "groq":
      return new GroqProvider(config); // Groq has dedicated provider for Whisper
    // Providers with OpenAI-compatible API format. Supply the provider's own
    // base URL so requests don't fall through to api.openai.com.
    case "mistral":
    case "xai":
    case "perplexity":
      return new OpenAIProvider({
        ...config,
        endpointUrl:
          config.endpointUrl ?? OPENAI_COMPATIBLE_BASE_URLS[providerType],
      });
    /*
      DeepSeek V4 reasons by default, and thinking mode rejects `tool_choice`.

      Turning thinking off restores function calling — and is the right trade
      anyway: measured on the same two-bar plan, 844 output tokens and 8.6s
      with thinking against 126 tokens and 2.4s without, for an answer of the
      same size. The reasoning is discarded, so it was working the caller paid
      for and never saw.
    */
    case "deepseek":
      return new OpenAIProvider(
        {
          ...config,
          endpointUrl:
            config.endpointUrl ?? OPENAI_COMPATIBLE_BASE_URLS[providerType],
        },
        { disableThinking: true }
      );
    // NOTE: Cohere's API is NOT OpenAI-compatible (different request/response
    // shape); routing it through OpenAIProvider will not work regardless of base
    // URL. It needs a dedicated provider — left as-is to avoid changing behavior.
    case "cohere":
      return new OpenAIProvider(config);
    case "lm_studio":
      return new CustomLLMProvider(config);
    default:
      throw new Error(`Unknown provider type: ${providerType}`);
  }
}

/**
 * OpenAI-SDK base URLs for OpenAI-compatible providers (no /chat/completions —
 * the SDK appends the path). Used by the factory so these providers reach their
 * own API rather than api.openai.com.
 */
const OPENAI_COMPATIBLE_BASE_URLS: Partial<Record<LlmProvider, string>> = {
  mistral: "https://api.mistral.ai/v1",
  xai: "https://api.x.ai/v1",
  deepseek: "https://api.deepseek.com/v1",
  perplexity: "https://api.perplexity.ai",
};

/**
 * Provider endpoint hints for Type 3/4 endpoints
 */
export const PROVIDER_ENDPOINTS: Record<LlmProvider, string> = {
  openai: "https://api.openai.com/v1/chat/completions",
  anthropic: "https://api.anthropic.com/v1/messages",
  gemini:
    "https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent",
  mistral: "https://api.mistral.ai/v1/chat/completions",
  cohere: "https://api.cohere.ai/v1/chat",
  groq: "https://api.groq.com/openai/v1/chat/completions",
  xai: "https://api.x.ai/v1/chat/completions",
  deepseek: "https://api.deepseek.com/v1/chat/completions",
  perplexity: "https://api.perplexity.ai/chat/completions",
  lm_studio: "{custom_endpoint}",
};
