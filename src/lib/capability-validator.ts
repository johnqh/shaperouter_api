/**
 * Model capability validation for multimodal requests.
 */

import type {
  MediaContent,
  MediaType,
  MediaFormatSupport,
  MediaInputFormat,
  LlmProvider,
} from "@sudobility/shaperouter_types";
import { getModelCapabilities } from "../config/providers";
import {
  isAllowedMimeType,
  getSizeLimit,
  getProviderAudioFormats,
} from "./media-constants";

// =============================================================================
// Types
// =============================================================================

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

export interface ValidationContext {
  model: string;
  provider: LlmProvider;
  inputMedia: MediaContent[];
  expectsOutput: {
    image?: boolean;
    audio?: boolean;
    video?: boolean;
  };
}

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Get supported formats for a media type from MediaFormatSupport.
 * Returns empty array if not specified.
 */
function getMediaFormats(
  mediaFormats: MediaFormatSupport | undefined,
  mediaType: MediaType
): MediaInputFormat[] {
  if (!mediaFormats) return [];
  switch (mediaType) {
    case "image":
      return mediaFormats.imageFormats ?? [];
    case "audio":
      return mediaFormats.audioFormats ?? [];
    case "video":
      return mediaFormats.videoFormats ?? [];
  }
}

// =============================================================================
// Validation Functions
// =============================================================================

/**
 * Validate that the model supports the requested media capabilities.
 */
export function validateMediaCapabilities(
  ctx: ValidationContext
): ValidationResult {
  const caps = getModelCapabilities(ctx.model);
  const errors: string[] = [];

  // =========================================================================
  // INPUT VALIDATION
  // =========================================================================

  for (const media of ctx.inputMedia) {
    // 1. Check model supports this media type
    // Only block if capability is explicitly false (known to not support)
    // If undefined (unknown), allow the request and let the provider reject if unsupported
    if (media.type === "image" && caps.visionInput === false) {
      errors.push(`Model ${ctx.model} does not support image input`);
    }
    if (media.type === "audio" && caps.audioInput === false) {
      errors.push(`Model ${ctx.model} does not support audio input`);
    }
    if (media.type === "video" && caps.videoInput === false) {
      errors.push(`Model ${ctx.model} does not support video input`);
    }

    // 2. Check format support (base64 vs url)
    const formats = getMediaFormats(caps.mediaFormats, media.type);
    if (
      formats.length > 0 &&
      !formats.includes(
        media.format as "base64" | "url" | "gcs" | "s3" | "file"
      )
    ) {
      errors.push(
        `Model ${ctx.model} does not support ${media.format} format for ${media.type}`
      );
    }

    // 3. Check provider-specific URL restrictions
    if (media.format === "url") {
      if (ctx.provider !== "gemini") {
        errors.push(
          `URL format only supported for Gemini provider (gs:// URLs)`
        );
      }
      if (!media.data.startsWith("gs://")) {
        errors.push(`Only gs:// URLs are allowed for Gemini`);
      }
    }

    // 4. Validate MIME type is in global allowlist
    if (!isAllowedMimeType(media.type, media.mimeType)) {
      errors.push(`Unsupported MIME type ${media.mimeType} for ${media.type}`);
    }

    // 5. Provider-specific audio format validation
    if (media.type === "audio") {
      const supportedFormats = getProviderAudioFormats(ctx.provider);
      if (!supportedFormats.includes(media.mimeType)) {
        errors.push(
          `${ctx.provider} does not support audio format ${media.mimeType}. ` +
            `Supported: ${supportedFormats.join(", ")}`
        );
      }
    }

    // 6. Size validation for base64
    if (media.format === "base64") {
      const estimatedSize = (media.data.length * 3) / 4;
      const limit = getSizeLimit(media.type);
      if (estimatedSize > limit) {
        errors.push(`${media.type} exceeds ${limit / 1024 / 1024}MB limit`);
      }
    }
  }

  // =========================================================================
  // OUTPUT VALIDATION
  // Only block if capability is explicitly false (known to not support)
  // If undefined (unknown), allow the request and let the provider reject if unsupported
  // =========================================================================

  if (ctx.expectsOutput.image && caps.imageOutput === false) {
    errors.push(`Model ${ctx.model} does not support image generation`);
  }
  if (ctx.expectsOutput.audio && caps.audioOutput === false) {
    errors.push(`Model ${ctx.model} does not support audio generation`);
  }
  if (ctx.expectsOutput.video && caps.videoOutput === false) {
    errors.push(`Model ${ctx.model} does not support video generation`);
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Validate Whisper-specific requirements.
 * Whisper models require exactly one audio input and no other media types.
 */
export function validateWhisperRequest(
  model: string,
  inputMedia: MediaContent[]
): ValidationResult {
  const errors: string[] = [];

  // Check if this is a Whisper model
  if (!isTranscriptionModel(model)) {
    return { valid: true, errors: [] };
  }

  // Whisper requires exactly one audio input
  const audioInputs = inputMedia.filter(m => m.type === "audio");

  if (audioInputs.length === 0) {
    errors.push("Whisper models require exactly one audio input");
  }
  if (audioInputs.length > 1) {
    errors.push(
      `Whisper models accept only one audio input, got ${audioInputs.length}`
    );
  }

  // Whisper doesn't accept other media types
  const nonAudioInputs = inputMedia.filter(m => m.type !== "audio");
  if (nonAudioInputs.length > 0) {
    errors.push("Whisper models only accept audio input, not images or video");
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Check if a model is a transcription model (Whisper).
 */
export function isTranscriptionModel(model: string): boolean {
  return model.toLowerCase().includes("whisper");
}

/**
 * Check if a model is a generative model (Imagen, Veo).
 */
export function isGenerativeModel(model: string): boolean {
  return (
    model.toLowerCase().includes("imagen") ||
    model.toLowerCase().includes("veo")
  );
}
