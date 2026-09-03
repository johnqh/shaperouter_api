/**
 * Media constants for multimodal support.
 * Single source of truth for MIME types, size limits, and validation.
 */

import type { MediaType, LlmProvider } from "@sudobility/shaperouter_types";

// =============================================================================
// MIME Type Allowlists
// =============================================================================

/** Allowed MIME types per media type (directly supported by LLMs) */
export const ALLOWED_MIME_TYPES: Record<MediaType, readonly string[]> = {
  image: ["image/jpeg", "image/png", "image/gif", "image/webp"],
  audio: [
    "audio/mp3",
    "audio/mpeg",
    "audio/wav",
    "audio/ogg",
    "audio/flac",
    "audio/m4a",
  ],
  video: ["video/mp4", "video/webm", "video/quicktime"],
} as const;

/** MIME types that can be converted to supported formats */
export const CONVERTIBLE_MIME_TYPES: Record<MediaType, readonly string[]> = {
  image: [
    "image/svg+xml",
    "image/tiff",
    "image/bmp",
    "image/heic",
    "image/heif",
    "image/avif",
  ],
  audio: [],
  video: [],
} as const;

/** All accepted MIME types (allowed + convertible) */
export const ACCEPTED_MIME_TYPES: Record<MediaType, readonly string[]> = {
  image: [...ALLOWED_MIME_TYPES.image, ...CONVERTIBLE_MIME_TYPES.image],
  audio: [...ALLOWED_MIME_TYPES.audio, ...CONVERTIBLE_MIME_TYPES.audio],
  video: [...ALLOWED_MIME_TYPES.video, ...CONVERTIBLE_MIME_TYPES.video],
} as const;

// =============================================================================
// Provider-Specific Audio Formats (Single Source of Truth)
// =============================================================================

/** OpenAI only supports mp3/wav for audio input */
export const OPENAI_AUDIO_INPUT_MIMES = [
  "audio/mp3",
  "audio/mpeg",
  "audio/wav",
] as const;

/** Gemini supports more audio formats */
export const GEMINI_AUDIO_INPUT_MIMES = [
  "audio/mp3",
  "audio/mpeg",
  "audio/wav",
  "audio/ogg",
  "audio/flac",
] as const;

/** Map MIME types to OpenAI format strings */
export const OPENAI_MIME_TO_FORMAT: Record<string, "mp3" | "wav"> = {
  "audio/mp3": "mp3",
  "audio/mpeg": "mp3", // mpeg is mp3
  "audio/wav": "wav",
};

/**
 * Get provider-specific supported audio formats
 */
export function getProviderAudioFormats(
  provider: LlmProvider
): readonly string[] {
  switch (provider) {
    case "openai":
      return OPENAI_AUDIO_INPUT_MIMES;
    case "gemini":
      return GEMINI_AUDIO_INPUT_MIMES;
    default:
      // Other providers: allow all formats in global allowlist
      return ALLOWED_MIME_TYPES.audio;
  }
}

/**
 * Convert MIME type to OpenAI format string.
 * Throws if the format is not supported by OpenAI.
 */
export function getOpenAIAudioFormat(mimeType: string): "mp3" | "wav" {
  const format = OPENAI_MIME_TO_FORMAT[mimeType];
  if (!format) {
    throw new Error(
      `OpenAI does not support audio format: ${mimeType}. ` +
        `Supported: ${OPENAI_AUDIO_INPUT_MIMES.join(", ")}`
    );
  }
  return format;
}

// =============================================================================
// Size Limits
// =============================================================================

/** Size limits in bytes per media type */
export const SIZE_LIMITS: Record<MediaType, number> = {
  image: 20 * 1024 * 1024, // 20 MB
  audio: 25 * 1024 * 1024, // 25 MB
  video: 10 * 1024 * 1024, // 10 MB (base64 only, URLs handled by provider)
} as const;

// =============================================================================
// Regex Patterns
// =============================================================================

/**
 * Data URL pattern for base64-encoded media.
 * Captures: [1] full MIME type, [2] media category, [3] base64 data
 */
export const DATA_URL_REGEX =
  /^data:((image|audio|video)\/[\w+-]+);base64,(.+)$/;

/**
 * Provider-native URL pattern (gs:// for Gemini).
 * SECURITY: Only allow gs:// URLs to prevent SSRF.
 */
export const PROVIDER_URL_REGEX = /^gs:\/\/[\w-]+\/.+$/;

// =============================================================================
// Validation Helpers
// =============================================================================

/**
 * Check if a MIME type is allowed for a given media type
 */
export function isAllowedMimeType(type: MediaType, mimeType: string): boolean {
  return ALLOWED_MIME_TYPES[type]?.includes(mimeType) ?? false;
}

/**
 * Get the size limit for a media type
 */
export function getSizeLimit(type: MediaType): number {
  return SIZE_LIMITS[type] ?? 0;
}

/**
 * Infer media type from MIME type string
 */
export function inferMediaTypeFromMime(
  mimeType: string
): MediaType | undefined {
  if (mimeType.startsWith("image/")) return "image";
  if (mimeType.startsWith("audio/")) return "audio";
  if (mimeType.startsWith("video/")) return "video";
  return undefined;
}

/**
 * Infer MIME type from file extension in URL
 */
export function inferMimeFromUrl(url: string): string | undefined {
  const extensionMatch = url.match(/\.(\w+)(?:\?|$)/);
  if (!extensionMatch) return undefined;

  const ext = extensionMatch[1].toLowerCase();
  const mimeMap: Record<string, string> = {
    // Images
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    png: "image/png",
    gif: "image/gif",
    webp: "image/webp",
    // Audio
    mp3: "audio/mp3",
    wav: "audio/wav",
    ogg: "audio/ogg",
    flac: "audio/flac",
    m4a: "audio/m4a",
    // Video
    mp4: "video/mp4",
    webm: "video/webm",
    mov: "video/quicktime",
  };

  return mimeMap[ext];
}
