/**
 * LLM Provider and Model Configuration
 *
 * This configuration is served via API endpoints so it can be updated
 * without requiring frontend package updates.
 *
 * ## Supported Providers
 *
 * Catalog verified against provider documentation on 2026-08-18.
 *
 * - **openai**: GPT-5.6 (Sol/Terra/Luna), GPT-5.5, GPT-5.4, GPT-5, GPT-4.1, GPT-4o
 * - **anthropic**: Claude Fable 5, Opus 5, Sonnet 5, Haiku 4.5 (+ Opus 4.8/4.7/4.6, Sonnet 4.6)
 * - **gemini**: Gemini 3.7/3.6/3.5/3.1 and 2.5, Nano Banana image models, Veo 3.1 video
 * - **mistral**: Mistral Large 3, Medium 3.5, Small 4, Ministral 3, Codestral, OCR
 * - **cohere**: Command A+, Command A (reasoning/vision/translate), Command R
 * - **groq**: GPT-OSS, Qwen3.6, MiniMax M2.7, Compound, Whisper
 * - **xai**: Grok 4.6, 4.5, 4.3, Grok 4.20 variants, Grok Build
 * - **deepseek**: DeepSeek V4 Pro and V4 Flash
 * - **perplexity**: Sonar models with live web search grounding
 * - **lm_studio**: Local LLM server (LM Studio or any OpenAI-compatible endpoint)
 *
 * ## Keeping this current
 *
 * Model lineups turn over every few weeks and retired IDs fail at the provider,
 * not here -- `MODEL_CAPABILITIES` and `MODEL_PRICING` fall back to permissive
 * defaults for anything unknown, so a stale entry surfaces as a runtime error in
 * a user's endpoint. When updating, work from each provider's own model and
 * pricing pages (linked above each section below), and check the provider's
 * deprecation page for retirements: Groq retired `llama-3.3-70b-versatile` and
 * `llama-3.1-8b-instant` on 2026-08-16, and both were listed here until then.
 *
 * Pricing is in **cents per 1M tokens** (image per image, audio/video per minute).
 *
 * ## LM Studio Model Identifiers
 *
 * LM Studio uses the OpenAI-compatible API format. When specifying models:
 *
 * - **API requests** use just the model name (e.g., `"qwen2.5-vl-7b-instruct"`)
 * - **Downloading models** uses publisher/name format (e.g., `lmstudio-community/Qwen2.5-VL-7B-Instruct-GGUF`)
 *
 * The model identifier in API requests matches what's returned by `GET /v1/models`.
 * Example response:
 * ```json
 * { "id": "qwen2.5-vl-7b-instruct", "object": "model" }
 * ```
 *
 * To discover available models on a running LM Studio server:
 * ```bash
 * curl http://localhost:1234/v1/models
 * ```
 *
 * For multi-variant models, you can specify quantization with `@`:
 * ```
 * google/gemma-3-12b@q3_k_l
 * google/gemma-3-12b@4bit
 * ```
 *
 * ## Vision Models
 *
 * Vision-capable models can process images in addition to text:
 * - Qwen2.5-VL series: Excellent object recognition, 128k context window
 * - Gemma 3 series: Google's multimodal models
 * - GLM-4V: Optimized for local deployment
 * - Pixtral: Mistral's vision model
 * - olmOCR: Specialized for OCR tasks
 * - Janus-Pro: Visual QA and scene interpretation
 *
 * Note: Vision models are not optimal for text-only tasks. For text-only
 * workloads, use dedicated text models like Qwen3 or Mistral.
 *
 * @see https://lmstudio.ai/docs/developer/openai-compat
 * @see https://lmstudio.ai/docs/developer/openai-compat/models
 */

import type {
  LlmProvider,
  ModelCapabilities,
  ModelPricing,
  ProviderConfig,
} from "@sudobility/shaperouter_types";

// =============================================================================
// Provider Configuration
// =============================================================================

export const PROVIDERS: ProviderConfig[] = [
  {
    id: "openai",
    name: "OpenAI",
    description: "GPT-5.6 (Sol, Terra, Luna), GPT-5.5, GPT-5.4, GPT-4.1 models",
    allowsCustomModel: false,
    defaultModel: "gpt-5.6-terra",
    requiresEndpointUrl: false,
  },
  {
    id: "anthropic",
    name: "Anthropic",
    description: "Claude Fable 5, Opus 5, Sonnet 5, Haiku 4.5 models",
    allowsCustomModel: false,
    defaultModel: "claude-sonnet-5",
    requiresEndpointUrl: false,
  },
  {
    id: "gemini",
    name: "Google Gemini",
    description:
      "Gemini 3.7, 3.6, 3.5, 3.1 and 2.5 models, plus Nano Banana image models",
    allowsCustomModel: false,
    defaultModel: "gemini-3.7-flash",
    requiresEndpointUrl: false,
  },
  {
    id: "mistral",
    name: "Mistral AI",
    description:
      "Mistral Large 3, Medium 3.5, Small 4, Ministral 3, Codestral models",
    allowsCustomModel: false,
    defaultModel: "mistral-medium-latest",
    requiresEndpointUrl: false,
  },
  {
    id: "cohere",
    name: "Cohere",
    description: "Command A+, Command A, Command R models",
    allowsCustomModel: false,
    defaultModel: "command-a-plus-05-2026",
    requiresEndpointUrl: false,
  },
  {
    id: "groq",
    name: "Groq",
    description:
      "Fast inference with GPT-OSS, Qwen, MiniMax, Compound, and Whisper",
    allowsCustomModel: false,
    defaultModel: "openai/gpt-oss-120b",
    requiresEndpointUrl: false,
  },
  {
    id: "xai",
    name: "xAI",
    description: "Grok 4.6, 4.5, 4.3 and Grok Build models",
    allowsCustomModel: false,
    defaultModel: "grok-4.6",
    requiresEndpointUrl: false,
  },
  {
    id: "deepseek",
    name: "DeepSeek",
    description: "DeepSeek V4 Pro and V4 Flash models",
    allowsCustomModel: false,
    defaultModel: "deepseek-v4-flash",
    requiresEndpointUrl: false,
  },
  {
    id: "perplexity",
    name: "Perplexity",
    description: "Sonar models with live web search grounding",
    allowsCustomModel: false,
    defaultModel: "sonar",
    requiresEndpointUrl: false,
  },
  {
    id: "lm_studio",
    name: "LM Studio / Custom",
    description: "Local LLM server or custom OpenAI-compatible endpoint",
    allowsCustomModel: true,
    defaultModel: "qwen3-8b",
    requiresEndpointUrl: true,
  },
];

// =============================================================================
// Models per Provider
// =============================================================================

export const PROVIDER_MODELS: Record<LlmProvider, string[]> = {
  openai: [
    // GPT-5.6 family (July 2026) - 1.05M context
    "gpt-5.6-sol",
    "gpt-5.6-terra",
    "gpt-5.6-luna",
    // GPT-5.5 / 5.4
    "gpt-5.5",
    "gpt-5.4",
    "gpt-5.4-mini",
    "gpt-5.4-nano",
    // GPT-5
    "gpt-5",
    "gpt-5-mini",
    "gpt-5-nano",
    // GPT-4 family
    "gpt-4.1",
    "gpt-4.1-mini",
    "gpt-4.1-nano",
    "gpt-4o",
    "gpt-4o-mini",
  ],
  anthropic: [
    // Current generation
    "claude-fable-5",
    "claude-opus-5",
    "claude-sonnet-5",
    "claude-haiku-4-5",
    // Still available, superseded
    "claude-opus-4-8",
    "claude-opus-4-7",
    "claude-opus-4-6",
    "claude-sonnet-4-6",
    "claude-opus-4-5-20251101",
    "claude-sonnet-4-5-20250929",
  ],
  gemini: [
    // Gemini 3 series (stable)
    "gemini-3.7-flash",
    "gemini-3.6-flash",
    "gemini-3.5-flash",
    "gemini-3.5-flash-lite",
    "gemini-3.1-flash-lite",
    // Preview
    "gemini-3.1-pro-preview",
    "gemini-3-flash-preview",
    // Image generation (Nano Banana)
    "gemini-3.1-flash-image",
    "gemini-3.1-flash-lite-image",
    "gemini-3-pro-image",
    // Gemini 2.5 series
    "gemini-2.5-pro",
    "gemini-2.5-flash",
    "gemini-2.5-flash-lite",
    "gemini-2.5-flash-image",
    "gemini-2.5-flash-native-audio-preview-12-2025",
    // Video generation
    "veo-3.1-generate-preview",
    "veo-3.1-lite-generate-preview",
  ],
  mistral: [
    "mistral-large-latest",
    "mistral-large-2512",
    "mistral-medium-latest",
    "mistral-small-latest",
    "mistral-small-2603",
    "ministral-14b-2512",
    "ministral-8b-2512",
    "ministral-3b-2512",
    "codestral-latest",
    "codestral-2508",
    "mistral-ocr-latest",
  ],
  cohere: [
    "command-a-plus-05-2026",
    "command-a-03-2025",
    "command-a-reasoning-08-2025",
    "command-a-vision-07-2025",
    "command-a-translate-08-2025",
    "command-r7b-12-2024",
    "command-r-plus-08-2024",
    "command-r-08-2024",
  ],
  groq: [
    "openai/gpt-oss-120b",
    "openai/gpt-oss-20b",
    "qwen/qwen3.6-27b",
    "minimaxai/minimax-m2.7",
    "groq/compound",
    "groq/compound-mini",
    // Audio transcription (two-stage pipeline with transcription_extraction_model)
    "whisper-large-v3",
    "whisper-large-v3-turbo",
  ],
  xai: [
    "grok-4.6",
    "grok-4.5",
    "grok-4.3",
    "grok-4.20-0309-reasoning",
    "grok-4.20-0309-non-reasoning",
    "grok-4.20-multi-agent-0309",
    "grok-build-0.1",
  ],
  deepseek: ["deepseek-v4-pro", "deepseek-v4-flash"],
  perplexity: [
    "sonar",
    "sonar-pro",
    "sonar-pro-search",
    "sonar-reasoning-pro",
    "sonar-deep-research",
  ],
  /**
   * LM Studio Model Identifiers
   *
   * IMPORTANT: LM Studio API uses just the model name as the identifier, NOT the
   * full publisher/model path used for downloading models.
   *
   * - Download format: `lmstudio-community/Qwen2.5-VL-7B-Instruct-GGUF`
   * - API request format: `qwen2.5-vl-7b-instruct`
   *
   * These identifiers match what's returned by `GET /v1/models` on your LM Studio server.
   * If you have different models loaded, you can use `allowsCustomModel: true` to enter
   * any model name, or query your server directly: `curl http://localhost:1234/v1/models`
   *
   * Multi-model loading: LM Studio supports loading multiple models simultaneously
   * (since v0.2.17). You can have both text and vision models loaded at once.
   */
  lm_studio: [
    // -------------------------------------------------------------------------
    // Text Models - Use for text-only tasks (faster, lower memory)
    // -------------------------------------------------------------------------
    "qwen3-8b", // Qwen3 8B - excellent general purpose
    "qwen3-14b", // Qwen3 14B - better reasoning
    "qwen3-30b-a3b", // Qwen3 30B MoE (3B active) - efficiency sweet spot
    "qwen2.5-coder-14b-instruct", // Code-specialized
    "mistral-7b-instruct-v0.3", // Fast, good for simple tasks
    "deepseek-r1-distill-qwen-7b", // Reasoning-focused
    // -------------------------------------------------------------------------
    // Vision Models - Process images + text (higher memory, slower)
    // -------------------------------------------------------------------------
    // Google Gemma 3 - state-of-the-art multimodal from Google
    "gemma-3-4b-it", // Lightweight vision
    "gemma-3-12b-it", // Balanced
    "gemma-3-27b-it", // Best quality
    // Qwen2.5-VL - excellent object recognition, 128k context window
    "qwen2.5-vl-3b-instruct", // Lightweight
    "qwen2.5-vl-7b-instruct", // Recommended for most use cases
    "qwen2.5-vl-32b-instruct", // High quality
    "qwen2.5-vl-72b-instruct", // Best quality (requires significant VRAM)
    // Other vision models
    "glm-4v-9b", // GLM-4V - optimized for local deployment
    "pixtral-12b-2409", // Mistral's vision model
    "olmocr-2-7b-1025", // olmOCR 2 - specialized for OCR (Oct 2025)
    "janus-pro-7b", // DeepSeek Janus-Pro - visual QA, scene interpretation
  ],
};

// =============================================================================
// Model Capabilities
// =============================================================================

export const MODEL_CAPABILITIES: Record<string, ModelCapabilities> = {
  // OpenAI — https://developers.openai.com/api/docs/models
  "gpt-5.6-sol": {
    visionInput: true,
    audioInput: false,
    videoInput: false,
    imageOutput: false,
    audioOutput: false,
    videoOutput: false,
    webSearch: true,
    mediaFormats: { imageFormats: ["url", "base64"] },
  },
  "gpt-5.6-terra": {
    visionInput: true,
    audioInput: false,
    videoInput: false,
    imageOutput: false,
    audioOutput: false,
    videoOutput: false,
    webSearch: true,
    mediaFormats: { imageFormats: ["url", "base64"] },
  },
  "gpt-5.6-luna": {
    visionInput: true,
    audioInput: false,
    videoInput: false,
    imageOutput: false,
    audioOutput: false,
    videoOutput: false,
    webSearch: true,
    mediaFormats: { imageFormats: ["url", "base64"] },
  },
  "gpt-5.5": {
    visionInput: true,
    audioInput: false,
    videoInput: false,
    imageOutput: false,
    audioOutput: false,
    videoOutput: false,
    webSearch: true,
    mediaFormats: { imageFormats: ["url", "base64"] },
  },
  "gpt-5.4": {
    visionInput: true,
    audioInput: false,
    videoInput: false,
    imageOutput: false,
    audioOutput: false,
    videoOutput: false,
    webSearch: true,
    mediaFormats: { imageFormats: ["url", "base64"] },
  },
  "gpt-5.4-mini": {
    visionInput: true,
    audioInput: false,
    videoInput: false,
    imageOutput: false,
    audioOutput: false,
    videoOutput: false,
    webSearch: true,
    mediaFormats: { imageFormats: ["url", "base64"] },
  },
  "gpt-5.4-nano": {
    visionInput: true,
    audioInput: false,
    videoInput: false,
    imageOutput: false,
    audioOutput: false,
    videoOutput: false,
    mediaFormats: { imageFormats: ["url", "base64"] },
  },
  "gpt-5": {
    visionInput: true,
    audioInput: false,
    videoInput: false,
    imageOutput: false,
    audioOutput: false,
    videoOutput: false,
    webSearch: true,
    mediaFormats: { imageFormats: ["url", "base64"] },
  },
  "gpt-5-mini": {
    visionInput: true,
    audioInput: false,
    videoInput: false,
    imageOutput: false,
    audioOutput: false,
    videoOutput: false,
    webSearch: true,
    mediaFormats: { imageFormats: ["url", "base64"] },
  },
  "gpt-5-nano": {
    visionInput: true,
    audioInput: false,
    videoInput: false,
    imageOutput: false,
    audioOutput: false,
    videoOutput: false,
    mediaFormats: { imageFormats: ["url", "base64"] },
  },
  "gpt-4.1": {
    visionInput: true,
    audioInput: false,
    videoInput: false,
    imageOutput: false,
    audioOutput: false,
    videoOutput: false,
    webSearch: true,
    mediaFormats: { imageFormats: ["url", "base64"] },
  },
  "gpt-4.1-mini": {
    visionInput: true,
    audioInput: false,
    videoInput: false,
    imageOutput: false,
    audioOutput: false,
    videoOutput: false,
    mediaFormats: { imageFormats: ["url", "base64"] },
  },
  "gpt-4.1-nano": {
    visionInput: true,
    audioInput: false,
    videoInput: false,
    imageOutput: false,
    audioOutput: false,
    videoOutput: false,
    mediaFormats: { imageFormats: ["url", "base64"] },
  },
  "gpt-4o": {
    visionInput: true,
    audioInput: false,
    videoInput: false,
    imageOutput: false,
    audioOutput: false,
    videoOutput: false,
    webSearch: true,
    mediaFormats: { imageFormats: ["url", "base64"] },
  },
  "gpt-4o-mini": {
    visionInput: true,
    audioInput: false,
    videoInput: false,
    imageOutput: false,
    audioOutput: false,
    videoOutput: false,
    mediaFormats: { imageFormats: ["url", "base64"] },
  },

  // Anthropic — https://platform.claude.com/docs/en/about-claude/models/overview
  "claude-fable-5": {
    visionInput: true,
    audioInput: false,
    videoInput: false,
    imageOutput: false,
    audioOutput: false,
    videoOutput: false,
    mediaFormats: { imageFormats: ["url", "base64"] },
  },
  "claude-opus-5": {
    visionInput: true,
    audioInput: false,
    videoInput: false,
    imageOutput: false,
    audioOutput: false,
    videoOutput: false,
    mediaFormats: { imageFormats: ["url", "base64"] },
  },
  "claude-sonnet-5": {
    visionInput: true,
    audioInput: false,
    videoInput: false,
    imageOutput: false,
    audioOutput: false,
    videoOutput: false,
    mediaFormats: { imageFormats: ["url", "base64"] },
  },
  "claude-haiku-4-5": {
    visionInput: true,
    audioInput: false,
    videoInput: false,
    imageOutput: false,
    audioOutput: false,
    videoOutput: false,
    mediaFormats: { imageFormats: ["url", "base64"] },
  },
  "claude-opus-4-8": {
    visionInput: true,
    audioInput: false,
    videoInput: false,
    imageOutput: false,
    audioOutput: false,
    videoOutput: false,
    mediaFormats: { imageFormats: ["url", "base64"] },
  },
  "claude-opus-4-7": {
    visionInput: true,
    audioInput: false,
    videoInput: false,
    imageOutput: false,
    audioOutput: false,
    videoOutput: false,
    mediaFormats: { imageFormats: ["url", "base64"] },
  },
  "claude-opus-4-6": {
    visionInput: true,
    audioInput: false,
    videoInput: false,
    imageOutput: false,
    audioOutput: false,
    videoOutput: false,
    mediaFormats: { imageFormats: ["url", "base64"] },
  },
  "claude-sonnet-4-6": {
    visionInput: true,
    audioInput: false,
    videoInput: false,
    imageOutput: false,
    audioOutput: false,
    videoOutput: false,
    mediaFormats: { imageFormats: ["url", "base64"] },
  },
  "claude-opus-4-5-20251101": {
    visionInput: true,
    audioInput: false,
    videoInput: false,
    imageOutput: false,
    audioOutput: false,
    videoOutput: false,
    mediaFormats: { imageFormats: ["url", "base64"] },
  },
  "claude-sonnet-4-5-20250929": {
    visionInput: true,
    audioInput: false,
    videoInput: false,
    imageOutput: false,
    audioOutput: false,
    videoOutput: false,
    mediaFormats: { imageFormats: ["url", "base64"] },
  },

  // Google Gemini — https://ai.google.dev/gemini-api/docs/models
  "gemini-3.7-flash": {
    visionInput: true,
    audioInput: true,
    videoInput: true,
    imageOutput: false,
    audioOutput: false,
    videoOutput: false,
    webSearch: true,
    mediaFormats: {
      imageFormats: ["url", "base64", "gcs"],
      audioFormats: ["url", "base64", "gcs"],
      videoFormats: ["url", "base64", "gcs"],
    },
  },
  "gemini-3.6-flash": {
    visionInput: true,
    audioInput: true,
    videoInput: true,
    imageOutput: false,
    audioOutput: false,
    videoOutput: false,
    webSearch: true,
    mediaFormats: {
      imageFormats: ["url", "base64", "gcs"],
      audioFormats: ["url", "base64", "gcs"],
      videoFormats: ["url", "base64", "gcs"],
    },
  },
  "gemini-3.5-flash": {
    visionInput: true,
    audioInput: true,
    videoInput: true,
    imageOutput: false,
    audioOutput: false,
    videoOutput: false,
    webSearch: true,
    mediaFormats: {
      imageFormats: ["url", "base64", "gcs"],
      audioFormats: ["url", "base64", "gcs"],
      videoFormats: ["url", "base64", "gcs"],
    },
  },
  "gemini-3.5-flash-lite": {
    visionInput: true,
    audioInput: true,
    videoInput: true,
    imageOutput: false,
    audioOutput: false,
    videoOutput: false,
    mediaFormats: {
      imageFormats: ["url", "base64", "gcs"],
      audioFormats: ["url", "base64", "gcs"],
      videoFormats: ["url", "base64", "gcs"],
    },
  },
  "gemini-3.1-flash-lite": {
    visionInput: true,
    audioInput: true,
    videoInput: true,
    imageOutput: false,
    audioOutput: false,
    videoOutput: false,
    mediaFormats: {
      imageFormats: ["url", "base64", "gcs"],
      audioFormats: ["url", "base64", "gcs"],
      videoFormats: ["url", "base64", "gcs"],
    },
  },
  "gemini-3.1-pro-preview": {
    visionInput: true,
    audioInput: true,
    videoInput: true,
    imageOutput: false,
    audioOutput: false,
    videoOutput: false,
    webSearch: true,
    mediaFormats: {
      imageFormats: ["url", "base64", "gcs"],
      audioFormats: ["url", "base64", "gcs"],
      videoFormats: ["url", "base64", "gcs"],
    },
  },
  "gemini-3-flash-preview": {
    visionInput: true,
    audioInput: true,
    videoInput: true,
    imageOutput: false,
    audioOutput: false,
    videoOutput: false,
    mediaFormats: {
      imageFormats: ["url", "base64", "gcs"],
      audioFormats: ["url", "base64", "gcs"],
      videoFormats: ["url", "base64", "gcs"],
    },
  },
  "gemini-3.1-flash-image": {
    visionInput: true,
    audioInput: false,
    videoInput: false,
    imageOutput: true,
    audioOutput: false,
    videoOutput: false,
    mediaFormats: { imageFormats: ["url", "base64", "gcs"] },
  },
  "gemini-3.1-flash-lite-image": {
    visionInput: true,
    audioInput: false,
    videoInput: false,
    imageOutput: true,
    audioOutput: false,
    videoOutput: false,
    mediaFormats: { imageFormats: ["url", "base64", "gcs"] },
  },
  "gemini-3-pro-image": {
    visionInput: true,
    audioInput: false,
    videoInput: false,
    imageOutput: true,
    audioOutput: false,
    videoOutput: false,
    mediaFormats: { imageFormats: ["url", "base64", "gcs"] },
  },
  "gemini-2.5-pro": {
    visionInput: true,
    audioInput: true,
    videoInput: true,
    imageOutput: false,
    audioOutput: false,
    videoOutput: false,
    mediaFormats: {
      imageFormats: ["url", "base64", "gcs"],
      audioFormats: ["url", "base64", "gcs"],
      videoFormats: ["url", "base64", "gcs"],
    },
  },
  "gemini-2.5-flash": {
    visionInput: true,
    audioInput: true,
    videoInput: true,
    imageOutput: false,
    audioOutput: false,
    videoOutput: false,
    mediaFormats: {
      imageFormats: ["url", "base64", "gcs"],
      audioFormats: ["url", "base64", "gcs"],
      videoFormats: ["url", "base64", "gcs"],
    },
  },
  "gemini-2.5-flash-lite": {
    visionInput: true,
    audioInput: true,
    videoInput: true,
    imageOutput: false,
    audioOutput: false,
    videoOutput: false,
    mediaFormats: {
      imageFormats: ["url", "base64", "gcs"],
      audioFormats: ["url", "base64", "gcs"],
      videoFormats: ["url", "base64", "gcs"],
    },
  },
  "gemini-2.5-flash-image": {
    visionInput: true,
    audioInput: false,
    videoInput: false,
    imageOutput: true,
    audioOutput: false,
    videoOutput: false,
    mediaFormats: { imageFormats: ["url", "base64", "gcs"] },
  },
  "gemini-2.5-flash-native-audio-preview-12-2025": {
    visionInput: true,
    audioInput: true,
    videoInput: false,
    imageOutput: false,
    audioOutput: true,
    videoOutput: false,
    mediaFormats: {
      imageFormats: ["url", "base64", "gcs"],
      audioFormats: ["url", "base64", "gcs"],
    },
  },
  "veo-3.1-generate-preview": {
    visionInput: true,
    audioInput: false,
    videoInput: false,
    imageOutput: false,
    audioOutput: false,
    videoOutput: true,
    mediaFormats: { imageFormats: ["url", "base64", "gcs"] },
  },
  "veo-3.1-lite-generate-preview": {
    visionInput: true,
    audioInput: false,
    videoInput: false,
    imageOutput: false,
    audioOutput: false,
    videoOutput: true,
    mediaFormats: { imageFormats: ["url", "base64", "gcs"] },
  },

  // Mistral — https://docs.mistral.ai/getting-started/models/models_overview/
  "mistral-large-latest": {
    visionInput: true,
    audioInput: false,
    videoInput: false,
    imageOutput: false,
    audioOutput: false,
    videoOutput: false,
    mediaFormats: { imageFormats: ["url", "base64"] },
  },
  "mistral-large-2512": {
    visionInput: true,
    audioInput: false,
    videoInput: false,
    imageOutput: false,
    audioOutput: false,
    videoOutput: false,
    mediaFormats: { imageFormats: ["url", "base64"] },
  },
  "mistral-medium-latest": {
    visionInput: true,
    audioInput: false,
    videoInput: false,
    imageOutput: false,
    audioOutput: false,
    videoOutput: false,
    mediaFormats: { imageFormats: ["url", "base64"] },
  },
  "mistral-small-latest": {
    visionInput: false,
    audioInput: false,
    videoInput: false,
    imageOutput: false,
    audioOutput: false,
    videoOutput: false,
  },
  "mistral-small-2603": {
    visionInput: false,
    audioInput: false,
    videoInput: false,
    imageOutput: false,
    audioOutput: false,
    videoOutput: false,
  },
  "ministral-14b-2512": {
    visionInput: true,
    audioInput: false,
    videoInput: false,
    imageOutput: false,
    audioOutput: false,
    videoOutput: false,
    mediaFormats: { imageFormats: ["url", "base64"] },
  },
  "ministral-8b-2512": {
    visionInput: true,
    audioInput: false,
    videoInput: false,
    imageOutput: false,
    audioOutput: false,
    videoOutput: false,
    mediaFormats: { imageFormats: ["url", "base64"] },
  },
  "ministral-3b-2512": {
    visionInput: true,
    audioInput: false,
    videoInput: false,
    imageOutput: false,
    audioOutput: false,
    videoOutput: false,
    mediaFormats: { imageFormats: ["url", "base64"] },
  },
  "codestral-latest": {
    visionInput: false,
    audioInput: false,
    videoInput: false,
    imageOutput: false,
    audioOutput: false,
    videoOutput: false,
  },
  "codestral-2508": {
    visionInput: false,
    audioInput: false,
    videoInput: false,
    imageOutput: false,
    audioOutput: false,
    videoOutput: false,
  },
  "mistral-ocr-latest": {
    visionInput: true,
    audioInput: false,
    videoInput: false,
    imageOutput: false,
    audioOutput: false,
    videoOutput: false,
    mediaFormats: { imageFormats: ["url", "base64"] },
  },

  // Cohere — https://docs.cohere.com/docs/models
  "command-a-plus-05-2026": {
    visionInput: true,
    audioInput: false,
    videoInput: false,
    imageOutput: false,
    audioOutput: false,
    videoOutput: false,
    mediaFormats: { imageFormats: ["url", "base64"] },
  },
  "command-a-03-2025": {
    visionInput: false,
    audioInput: false,
    videoInput: false,
    imageOutput: false,
    audioOutput: false,
    videoOutput: false,
  },
  "command-a-reasoning-08-2025": {
    visionInput: false,
    audioInput: false,
    videoInput: false,
    imageOutput: false,
    audioOutput: false,
    videoOutput: false,
  },
  "command-a-vision-07-2025": {
    visionInput: true,
    audioInput: false,
    videoInput: false,
    imageOutput: false,
    audioOutput: false,
    videoOutput: false,
    mediaFormats: { imageFormats: ["url", "base64"] },
  },
  "command-a-translate-08-2025": {
    visionInput: false,
    audioInput: false,
    videoInput: false,
    imageOutput: false,
    audioOutput: false,
    videoOutput: false,
  },
  "command-r7b-12-2024": {
    visionInput: false,
    audioInput: false,
    videoInput: false,
    imageOutput: false,
    audioOutput: false,
    videoOutput: false,
  },
  "command-r-plus-08-2024": {
    visionInput: false,
    audioInput: false,
    videoInput: false,
    imageOutput: false,
    audioOutput: false,
    videoOutput: false,
  },
  "command-r-08-2024": {
    visionInput: false,
    audioInput: false,
    videoInput: false,
    imageOutput: false,
    audioOutput: false,
    videoOutput: false,
  },

  // Groq — https://console.groq.com/docs/models
  "openai/gpt-oss-120b": {
    visionInput: true,
    audioInput: false,
    videoInput: false,
    imageOutput: false,
    audioOutput: false,
    videoOutput: false,
    mediaFormats: { imageFormats: ["url", "base64"] },
  },
  "openai/gpt-oss-20b": {
    visionInput: true,
    audioInput: false,
    videoInput: false,
    imageOutput: false,
    audioOutput: false,
    videoOutput: false,
    mediaFormats: { imageFormats: ["url", "base64"] },
  },
  "qwen/qwen3.6-27b": {
    visionInput: false,
    audioInput: false,
    videoInput: false,
    imageOutput: false,
    audioOutput: false,
    videoOutput: false,
  },
  "minimaxai/minimax-m2.7": {
    visionInput: false,
    audioInput: false,
    videoInput: false,
    imageOutput: false,
    audioOutput: false,
    videoOutput: false,
  },
  "groq/compound": {
    visionInput: true,
    audioInput: false,
    videoInput: false,
    imageOutput: false,
    audioOutput: false,
    videoOutput: false,
    webSearch: true,
    mediaFormats: { imageFormats: ["url", "base64"] },
  },
  "groq/compound-mini": {
    visionInput: true,
    audioInput: false,
    videoInput: false,
    imageOutput: false,
    audioOutput: false,
    videoOutput: false,
    webSearch: true,
    mediaFormats: { imageFormats: ["url", "base64"] },
  },
  "whisper-large-v3": {
    visionInput: false,
    audioInput: true,
    videoInput: false,
    imageOutput: false,
    audioOutput: false,
    videoOutput: false,
    mediaFormats: { audioFormats: ["file"] },
  },
  "whisper-large-v3-turbo": {
    visionInput: false,
    audioInput: true,
    videoInput: false,
    imageOutput: false,
    audioOutput: false,
    videoOutput: false,
    mediaFormats: { audioFormats: ["file"] },
  },

  // xAI — https://docs.x.ai/docs/models
  "grok-4.6": {
    visionInput: true,
    audioInput: false,
    videoInput: false,
    imageOutput: false,
    audioOutput: false,
    videoOutput: false,
    webSearch: true,
    mediaFormats: { imageFormats: ["url", "base64"] },
  },
  "grok-4.5": {
    visionInput: true,
    audioInput: false,
    videoInput: false,
    imageOutput: false,
    audioOutput: false,
    videoOutput: false,
    webSearch: true,
    mediaFormats: { imageFormats: ["url", "base64"] },
  },
  "grok-4.3": {
    visionInput: true,
    audioInput: false,
    videoInput: false,
    imageOutput: false,
    audioOutput: false,
    videoOutput: false,
    webSearch: true,
    mediaFormats: { imageFormats: ["url", "base64"] },
  },
  "grok-4.20-0309-reasoning": {
    visionInput: true,
    audioInput: false,
    videoInput: false,
    imageOutput: false,
    audioOutput: false,
    videoOutput: false,
    webSearch: true,
    mediaFormats: { imageFormats: ["url", "base64"] },
  },
  "grok-4.20-0309-non-reasoning": {
    visionInput: true,
    audioInput: false,
    videoInput: false,
    imageOutput: false,
    audioOutput: false,
    videoOutput: false,
    webSearch: true,
    mediaFormats: { imageFormats: ["url", "base64"] },
  },
  "grok-4.20-multi-agent-0309": {
    visionInput: true,
    audioInput: false,
    videoInput: false,
    imageOutput: false,
    audioOutput: false,
    videoOutput: false,
    webSearch: true,
    mediaFormats: { imageFormats: ["url", "base64"] },
  },
  "grok-build-0.1": {
    visionInput: true,
    audioInput: false,
    videoInput: false,
    imageOutput: false,
    audioOutput: false,
    videoOutput: false,
    webSearch: true,
    mediaFormats: { imageFormats: ["url", "base64"] },
  },

  // DeepSeek — https://api-docs.deepseek.com/quick_start/pricing (standard, cache miss)
  "deepseek-v4-pro": {
    visionInput: false,
    audioInput: false,
    videoInput: false,
    imageOutput: false,
    audioOutput: false,
    videoOutput: false,
  },
  "deepseek-v4-flash": {
    visionInput: false,
    audioInput: false,
    videoInput: false,
    imageOutput: false,
    audioOutput: false,
    videoOutput: false,
  },

  // Perplexity — https://docs.perplexity.ai (per-request search fees are billed separately)
  sonar: {
    visionInput: false,
    audioInput: false,
    videoInput: false,
    imageOutput: false,
    audioOutput: false,
    videoOutput: false,
    webSearch: true,
  },
  "sonar-pro": {
    visionInput: false,
    audioInput: false,
    videoInput: false,
    imageOutput: false,
    audioOutput: false,
    videoOutput: false,
    webSearch: true,
  },
  "sonar-pro-search": {
    visionInput: false,
    audioInput: false,
    videoInput: false,
    imageOutput: false,
    audioOutput: false,
    videoOutput: false,
    webSearch: true,
  },
  "sonar-reasoning-pro": {
    visionInput: false,
    audioInput: false,
    videoInput: false,
    imageOutput: false,
    audioOutput: false,
    videoOutput: false,
    webSearch: true,
  },
  "sonar-deep-research": {
    visionInput: false,
    audioInput: false,
    videoInput: false,
    imageOutput: false,
    audioOutput: false,
    videoOutput: false,
    webSearch: true,
  },

  // LM Studio / custom OpenAI-compatible servers — self-hosted, no per-token cost
  "qwen3-8b": {
    visionInput: false,
    audioInput: false,
    videoInput: false,
    imageOutput: false,
    audioOutput: false,
    videoOutput: false,
  },
  "qwen3-14b": {
    visionInput: false,
    audioInput: false,
    videoInput: false,
    imageOutput: false,
    audioOutput: false,
    videoOutput: false,
  },
  "qwen3-30b-a3b": {
    visionInput: false,
    audioInput: false,
    videoInput: false,
    imageOutput: false,
    audioOutput: false,
    videoOutput: false,
  },
  "qwen2.5-coder-14b-instruct": {
    visionInput: false,
    audioInput: false,
    videoInput: false,
    imageOutput: false,
    audioOutput: false,
    videoOutput: false,
  },
  "mistral-7b-instruct-v0.3": {
    visionInput: false,
    audioInput: false,
    videoInput: false,
    imageOutput: false,
    audioOutput: false,
    videoOutput: false,
  },
  "deepseek-r1-distill-qwen-7b": {
    visionInput: false,
    audioInput: false,
    videoInput: false,
    imageOutput: false,
    audioOutput: false,
    videoOutput: false,
  },
  "gemma-3-4b-it": {
    visionInput: true,
    audioInput: false,
    videoInput: false,
    imageOutput: false,
    audioOutput: false,
    videoOutput: false,
    mediaFormats: { imageFormats: ["base64"] },
  },
  "gemma-3-12b-it": {
    visionInput: true,
    audioInput: false,
    videoInput: false,
    imageOutput: false,
    audioOutput: false,
    videoOutput: false,
    mediaFormats: { imageFormats: ["base64"] },
  },
  "gemma-3-27b-it": {
    visionInput: true,
    audioInput: false,
    videoInput: false,
    imageOutput: false,
    audioOutput: false,
    videoOutput: false,
    mediaFormats: { imageFormats: ["base64"] },
  },
  "qwen2.5-vl-3b-instruct": {
    visionInput: true,
    audioInput: false,
    videoInput: false,
    imageOutput: false,
    audioOutput: false,
    videoOutput: false,
    mediaFormats: { imageFormats: ["base64"] },
  },
  "qwen2.5-vl-7b-instruct": {
    visionInput: true,
    audioInput: false,
    videoInput: false,
    imageOutput: false,
    audioOutput: false,
    videoOutput: false,
    mediaFormats: { imageFormats: ["base64"] },
  },
  "qwen2.5-vl-32b-instruct": {
    visionInput: true,
    audioInput: false,
    videoInput: false,
    imageOutput: false,
    audioOutput: false,
    videoOutput: false,
    mediaFormats: { imageFormats: ["base64"] },
  },
  "qwen2.5-vl-72b-instruct": {
    visionInput: true,
    audioInput: false,
    videoInput: false,
    imageOutput: false,
    audioOutput: false,
    videoOutput: false,
    mediaFormats: { imageFormats: ["base64"] },
  },
  "glm-4v-9b": {
    visionInput: true,
    audioInput: false,
    videoInput: false,
    imageOutput: false,
    audioOutput: false,
    videoOutput: false,
    mediaFormats: { imageFormats: ["base64"] },
  },
  "pixtral-12b-2409": {
    visionInput: true,
    audioInput: false,
    videoInput: false,
    imageOutput: false,
    audioOutput: false,
    videoOutput: false,
    mediaFormats: { imageFormats: ["base64"] },
  },
  "olmocr-2-7b-1025": {
    visionInput: true,
    audioInput: false,
    videoInput: false,
    imageOutput: false,
    audioOutput: false,
    videoOutput: false,
    mediaFormats: { imageFormats: ["base64"] },
  },
  "janus-pro-7b": {
    visionInput: true,
    audioInput: false,
    videoInput: false,
    imageOutput: false,
    audioOutput: false,
    videoOutput: false,
    mediaFormats: { imageFormats: ["base64"] },
  },
};

// =============================================================================
// Model Pricing (cents per 1M tokens)
// =============================================================================

export const MODEL_PRICING: Record<string, ModelPricing> = {
  // OpenAI — https://developers.openai.com/api/docs/models
  "gpt-5.6-sol": { input: 500, output: 3000 },
  "gpt-5.6-terra": { input: 200, output: 1200 },
  "gpt-5.6-luna": { input: 20, output: 120 },
  "gpt-5.5": { input: 500, output: 3000 },
  "gpt-5.4": { input: 250, output: 1500 },
  "gpt-5.4-mini": { input: 75, output: 450 },
  "gpt-5.4-nano": { input: 20, output: 125 },
  "gpt-5": { input: 125, output: 1000 },
  "gpt-5-mini": { input: 25, output: 200 },
  "gpt-5-nano": { input: 5, output: 40 },
  "gpt-4.1": { input: 200, output: 800 },
  "gpt-4.1-mini": { input: 40, output: 160 },
  "gpt-4.1-nano": { input: 10, output: 40 },
  "gpt-4o": { input: 250, output: 1000 },
  "gpt-4o-mini": { input: 15, output: 60 },

  // Anthropic — https://platform.claude.com/docs/en/about-claude/models/overview
  "claude-fable-5": { input: 1000, output: 5000 },
  "claude-opus-5": { input: 500, output: 2500 },
  "claude-sonnet-5": { input: 200, output: 1000 },
  "claude-haiku-4-5": { input: 100, output: 500 },
  "claude-opus-4-8": { input: 500, output: 2500 },
  "claude-opus-4-7": { input: 500, output: 2500 },
  "claude-opus-4-6": { input: 500, output: 2500 },
  "claude-sonnet-4-6": { input: 300, output: 1500 },
  "claude-opus-4-5-20251101": { input: 500, output: 2500 },
  "claude-sonnet-4-5-20250929": { input: 300, output: 1500 },

  // Google Gemini — https://ai.google.dev/gemini-api/docs/models
  "gemini-3.7-flash": {
    input: 75,
    output: 375,
    imageInput: 39,
    audioInput: 10,
    videoInput: 39,
  },
  "gemini-3.6-flash": {
    input: 75,
    output: 375,
    imageInput: 39,
    audioInput: 10,
    videoInput: 39,
  },
  "gemini-3.5-flash": {
    input: 150,
    output: 900,
    imageInput: 39,
    audioInput: 10,
    videoInput: 39,
  },
  "gemini-3.5-flash-lite": {
    input: 30,
    output: 250,
    imageInput: 30,
    audioInput: 50,
    videoInput: 30,
  },
  "gemini-3.1-flash-lite": {
    input: 25,
    output: 150,
    imageInput: 25,
    audioInput: 50,
    videoInput: 25,
  },
  "gemini-3.1-pro-preview": {
    input: 200,
    output: 1200,
    imageInput: 32.9,
    audioInput: 10,
    videoInput: 32.9,
  },
  "gemini-3-flash-preview": {
    input: 75,
    output: 375,
    imageInput: 39,
    audioInput: 10,
    videoInput: 39,
  },
  "gemini-3.1-flash-image": {
    input: 75,
    output: 375,
    imageInput: 39,
    imageOutput: 3.9,
  }, // Nano Banana 2
  "gemini-3.1-flash-lite-image": {
    input: 25,
    output: 150,
    imageInput: 25,
    imageOutput: 2.4,
  }, // Nano Banana 2 Lite
  "gemini-3-pro-image": {
    input: 125,
    output: 1000,
    imageInput: 32.9,
    imageOutput: 12,
  }, // Nano Banana Pro
  "gemini-2.5-pro": {
    input: 125,
    output: 1000,
    imageInput: 32.9,
    audioInput: 10,
    videoInput: 32.9,
  },
  "gemini-2.5-flash": {
    input: 30,
    output: 250,
    imageInput: 30,
    audioInput: 100,
    videoInput: 30,
  },
  "gemini-2.5-flash-lite": {
    input: 10,
    output: 40,
    imageInput: 10,
    audioInput: 30,
    videoInput: 10,
  },
  "gemini-2.5-flash-image": {
    input: 30,
    output: 250,
    imageInput: 30,
    imageOutput: 3.9,
  },
  "gemini-2.5-flash-native-audio-preview-12-2025": {
    input: 30,
    output: 250,
    audioInput: 100,
    audioOutput: 200,
  },
  "veo-3.1-generate-preview": { input: 0, output: 0, videoOutput: 4000 }, // priced per second of video
  "veo-3.1-lite-generate-preview": { input: 0, output: 0, videoOutput: 1500 }, // priced per second of video

  // Mistral — https://docs.mistral.ai/getting-started/models/models_overview/
  "mistral-large-latest": { input: 50, output: 150 },
  "mistral-large-2512": { input: 50, output: 150 },
  "mistral-medium-latest": { input: 150, output: 750 },
  "mistral-small-latest": { input: 15, output: 60 },
  "mistral-small-2603": { input: 15, output: 60 },
  "ministral-14b-2512": { input: 20, output: 20 },
  "ministral-8b-2512": { input: 15, output: 15 },
  "ministral-3b-2512": { input: 10, output: 10 },
  "codestral-latest": { input: 30, output: 90 },
  "codestral-2508": { input: 30, output: 90 },
  "mistral-ocr-latest": { input: 100, output: 300 }, // document OCR

  // Cohere — https://docs.cohere.com/docs/models
  "command-a-plus-05-2026": { input: 250, output: 1000 },
  "command-a-03-2025": { input: 250, output: 1000 },
  "command-a-reasoning-08-2025": { input: 250, output: 1000 },
  "command-a-vision-07-2025": { input: 250, output: 1000 },
  "command-a-translate-08-2025": { input: 250, output: 1000 },
  "command-r7b-12-2024": { input: 3.75, output: 15 },
  "command-r-plus-08-2024": { input: 250, output: 1000 },
  "command-r-08-2024": { input: 15, output: 60 },

  // Groq — https://console.groq.com/docs/models
  "openai/gpt-oss-120b": { input: 15, output: 75 },
  "openai/gpt-oss-20b": { input: 10, output: 50 },
  "qwen/qwen3.6-27b": { input: 29, output: 59 },
  "minimaxai/minimax-m2.7": { input: 29, output: 115 },
  "groq/compound": { input: 15, output: 75 },
  "groq/compound-mini": { input: 10, output: 50 },
  "whisper-large-v3": { input: 11, output: 0 }, // per hour of audio
  "whisper-large-v3-turbo": { input: 4, output: 0 }, // per hour of audio

  // xAI — https://docs.x.ai/docs/models
  "grok-4.6": { input: 200, output: 600 },
  "grok-4.5": { input: 200, output: 600 },
  "grok-4.3": { input: 125, output: 250 },
  "grok-4.20-0309-reasoning": { input: 125, output: 250 },
  "grok-4.20-0309-non-reasoning": { input: 125, output: 250 },
  "grok-4.20-multi-agent-0309": { input: 125, output: 250 },
  "grok-build-0.1": { input: 100, output: 200 },

  // DeepSeek — https://api-docs.deepseek.com/quick_start/pricing (standard, cache miss)
  "deepseek-v4-pro": { input: 66, output: 198 },
  "deepseek-v4-flash": { input: 22, output: 66 },

  // Perplexity — https://docs.perplexity.ai (per-request search fees are billed separately)
  sonar: { input: 100, output: 100 },
  "sonar-pro": { input: 300, output: 1500 },
  "sonar-pro-search": { input: 300, output: 1500 },
  "sonar-reasoning-pro": { input: 200, output: 800 },
  "sonar-deep-research": { input: 200, output: 800 },

  // LM Studio / custom OpenAI-compatible servers — self-hosted, no per-token cost
  "qwen3-8b": { input: 0, output: 0 },
  "qwen3-14b": { input: 0, output: 0 },
  "qwen3-30b-a3b": { input: 0, output: 0 },
  "qwen2.5-coder-14b-instruct": { input: 0, output: 0 },
  "mistral-7b-instruct-v0.3": { input: 0, output: 0 },
  "deepseek-r1-distill-qwen-7b": { input: 0, output: 0 },
  "gemma-3-4b-it": { input: 0, output: 0 },
  "gemma-3-12b-it": { input: 0, output: 0 },
  "gemma-3-27b-it": { input: 0, output: 0 },
  "qwen2.5-vl-3b-instruct": { input: 0, output: 0 },
  "qwen2.5-vl-7b-instruct": { input: 0, output: 0 },
  "qwen2.5-vl-32b-instruct": { input: 0, output: 0 },
  "qwen2.5-vl-72b-instruct": { input: 0, output: 0 },
  "glm-4v-9b": { input: 0, output: 0 },
  "pixtral-12b-2409": { input: 0, output: 0 },
  "olmocr-2-7b-1025": { input: 0, output: 0 },
  "janus-pro-7b": { input: 0, output: 0 },
};

// Default pricing for unknown models
export const DEFAULT_MODEL_PRICING: ModelPricing = { input: 100, output: 300 };

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Get provider configuration by ID.
 * @param providerId - The provider identifier (e.g., "openai", "anthropic")
 * @returns The provider config or undefined if not found
 */
export function getProviderById(
  providerId: LlmProvider
): ProviderConfig | undefined {
  return PROVIDERS.find(p => p.id === providerId);
}

/**
 * Get the list of model IDs for a given provider.
 * @param providerId - The provider identifier
 * @returns Array of model ID strings
 */
export function getModelsForProvider(providerId: LlmProvider): string[] {
  return PROVIDER_MODELS[providerId] ?? [];
}

/**
 * Get capabilities for a specific model (vision, audio, video I/O).
 * Returns empty object for unknown models (permissive by default).
 * @param model - The model identifier
 * @returns Model capabilities
 */
export function getModelCapabilities(model: string): ModelCapabilities {
  return MODEL_CAPABILITIES[model] ?? {};
}

/**
 * Get pricing for a specific model (cents per 1M tokens).
 * Returns DEFAULT_MODEL_PRICING for unknown models.
 * @param model - The model identifier
 * @returns Model pricing
 */
export function getModelPricing(model: string): ModelPricing {
  // Try exact match first, then strip date suffix (e.g., "gpt-4.1-mini-2025-04-14" -> "gpt-4.1-mini")
  if (MODEL_PRICING[model]) return MODEL_PRICING[model]!;
  const baseModel = model.replace(/-\d{4}-\d{2}-\d{2}$/, "");
  return MODEL_PRICING[baseModel] ?? DEFAULT_MODEL_PRICING;
}

/**
 * Get the provider for a given model name.
 * Searches through PROVIDER_MODELS to find which provider owns this model.
 */
export function getProviderForModel(model: string): LlmProvider {
  for (const [provider, models] of Object.entries(PROVIDER_MODELS)) {
    if (models.includes(model)) {
      return provider as LlmProvider;
    }
  }
  // Default to openai for unknown models (OpenAI-compatible format)
  return "openai";
}
