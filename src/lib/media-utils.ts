/**
 * Media utilities for extracting and parsing media from input data.
 */

import type { MediaContent, MediaType } from "@sudobility/shaperouter_types";
import {
  DATA_URL_REGEX,
  PROVIDER_URL_REGEX,
  ACCEPTED_MIME_TYPES,
  SIZE_LIMITS,
  inferMimeFromUrl,
  inferMediaTypeFromMime,
} from "./media-constants";

// =============================================================================
// Types
// =============================================================================

export interface ExtractedMedia {
  /** Input data with media fields replaced by placeholders */
  cleanedInput: Record<string, unknown>;
  /** Extracted media content */
  media: MediaContent[];
}

export interface ExtractionResult {
  result?: ExtractedMedia;
  error?: string;
}

interface ParseResult {
  media?: MediaContent;
  error?: string;
}

// =============================================================================
// Data URL Parsing
// =============================================================================

/**
 * Parse a data URL into MediaContent.
 * Returns error if invalid or unsupported.
 */
export function parseDataUrl(value: string, fieldName?: string): ParseResult {
  const match = value.match(DATA_URL_REGEX);
  if (!match) {
    return {}; // Not a data URL
  }

  const mimeType = match[1];
  const mediaCategory = match[2] as MediaType;
  const data = match[3];

  // Validate MIME type is in allowlist (includes convertible types)
  if (!ACCEPTED_MIME_TYPES[mediaCategory]?.includes(mimeType)) {
    return { error: `Unsupported MIME type: ${mimeType}` };
  }

  // Validate size (base64 is ~33% larger than binary)
  const estimatedSize = (data.length * 3) / 4;
  const limit = SIZE_LIMITS[mediaCategory];
  if (estimatedSize > limit) {
    return {
      error: `${mediaCategory} exceeds ${limit / 1024 / 1024}MB limit`,
    };
  }

  return {
    media: {
      type: mediaCategory,
      format: "base64",
      mimeType,
      data,
      fieldName,
    },
  };
}

/**
 * Parse a provider URL (gs:// for Gemini).
 * Returns error if URL is not allowed (SSRF prevention).
 */
export function parseProviderUrl(
  value: string,
  mimeType?: string,
  fieldName?: string
): ParseResult {
  // SECURITY: Reject http/https URLs to prevent SSRF
  if (value.startsWith("http://") || value.startsWith("https://")) {
    return {
      error: "HTTP/HTTPS URLs not allowed. Use base64 or gs:// (Gemini only)",
    };
  }

  // Only allow gs:// URLs for Gemini
  if (!PROVIDER_URL_REGEX.test(value)) {
    return {}; // Not a URL we handle
  }

  // Infer MIME type from URL if not provided
  const inferredMime = mimeType ?? inferMimeFromUrl(value);
  if (!inferredMime) {
    return {
      error:
        "Cannot infer MIME type from URL, please specify contentMediaType in schema",
    };
  }

  const mediaType = inferMediaTypeFromMime(inferredMime);
  if (!mediaType) {
    return { error: `Unknown media type for MIME: ${inferredMime}` };
  }

  return {
    media: {
      type: mediaType,
      format: "url",
      mimeType: inferredMime,
      data: value,
      fieldName,
    },
  };
}

// =============================================================================
// Media Extraction
// =============================================================================

/**
 * Check if a value looks like media (data URL or provider URL).
 */
function isMediaValue(value: unknown): value is string {
  if (typeof value !== "string") return false;
  return DATA_URL_REGEX.test(value) || PROVIDER_URL_REGEX.test(value);
}

/**
 * Recursively extract media from input data.
 * Replaces media fields with placeholders like "[Image: fieldName]".
 */
function extractFromObject(
  data: Record<string, unknown>,
  media: MediaContent[],
  errors: string[],
  path: string = ""
): Record<string, unknown> {
  const result: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(data)) {
    const fieldPath = path ? `${path}.${key}` : key;

    if (isMediaValue(value)) {
      // Try to parse as data URL first
      let parseResult = parseDataUrl(value, fieldPath);

      // If not a data URL, try provider URL
      if (!parseResult.media && !parseResult.error) {
        parseResult = parseProviderUrl(value, undefined, fieldPath);
      }

      if (parseResult.error) {
        errors.push(`${fieldPath}: ${parseResult.error}`);
        result[key] = value; // Keep original on error
      } else if (parseResult.media) {
        media.push(parseResult.media);
        // Replace with placeholder
        const typeLabel =
          parseResult.media.type.charAt(0).toUpperCase() +
          parseResult.media.type.slice(1);
        result[key] = `[${typeLabel}: ${key}]`;
      } else {
        result[key] = value;
      }
    } else if (Array.isArray(value)) {
      // Recursively handle arrays
      result[key] = value.map((item, index) => {
        if (typeof item === "object" && item !== null) {
          return extractFromObject(
            item as Record<string, unknown>,
            media,
            errors,
            `${fieldPath}[${index}]`
          );
        }
        if (isMediaValue(item)) {
          const itemPath = `${fieldPath}[${index}]`;
          let parseResult = parseDataUrl(item, itemPath);
          if (!parseResult.media && !parseResult.error) {
            parseResult = parseProviderUrl(item, undefined, itemPath);
          }
          if (parseResult.error) {
            errors.push(`${itemPath}: ${parseResult.error}`);
            return item;
          } else if (parseResult.media) {
            media.push(parseResult.media);
            const typeLabel =
              parseResult.media.type.charAt(0).toUpperCase() +
              parseResult.media.type.slice(1);
            return `[${typeLabel}: ${itemPath}]`;
          }
        }
        return item;
      });
    } else if (typeof value === "object" && value !== null) {
      // Recursively handle nested objects
      result[key] = extractFromObject(
        value as Record<string, unknown>,
        media,
        errors,
        fieldPath
      );
    } else {
      result[key] = value;
    }
  }

  return result;
}

/**
 * Extract media from input data.
 * Returns cleaned input (with placeholders) and extracted media array.
 */
export function extractMediaFromInput(
  input: Record<string, unknown>
): ExtractionResult {
  const media: MediaContent[] = [];
  const errors: string[] = [];

  const cleanedInput = extractFromObject(input, media, errors);

  if (errors.length > 0) {
    return { error: errors.join("; ") };
  }

  return {
    result: {
      cleanedInput,
      media,
    },
  };
}
