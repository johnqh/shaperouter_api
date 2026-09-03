/**
 * Media conversion utilities for converting unsupported image formats to supported ones.
 * Used to convert SVG and other formats to PNG before sending to LLM.
 */

import sharp from "sharp";
import type { MediaContent } from "@sudobility/shaperouter_types";
import { ALLOWED_MIME_TYPES, CONVERTIBLE_MIME_TYPES } from "./media-constants";

/**
 * Check if a MIME type needs conversion
 */
export function needsConversion(mimeType: string): boolean {
  // If already supported, no conversion needed
  if (ALLOWED_MIME_TYPES.image.includes(mimeType)) {
    return false;
  }
  // Check if it's a convertible format
  return CONVERTIBLE_MIME_TYPES.image.includes(mimeType);
}

/**
 * Check if a MIME type is convertible (but not currently supported)
 */
export function isConvertibleMimeType(mimeType: string): boolean {
  return CONVERTIBLE_MIME_TYPES.image.includes(mimeType);
}

/**
 * Convert an image buffer to PNG using sharp
 */
export async function convertToPng(
  inputBuffer: Buffer,
  mimeType: string
): Promise<Buffer> {
  let sharpInstance = sharp(inputBuffer);

  // For SVG, we need to handle it specially with density for better quality
  if (mimeType === "image/svg+xml") {
    // Re-create sharp instance with density option for SVG
    sharpInstance = sharp(inputBuffer, { density: 300 });
  }

  // Convert to PNG
  return sharpInstance.png().toBuffer();
}

/**
 * Convert a base64-encoded image to PNG
 * Returns the new base64 data and MIME type
 */
export async function convertBase64ToPng(
  base64Data: string,
  mimeType: string
): Promise<{ data: string; mimeType: string }> {
  const inputBuffer = Buffer.from(base64Data, "base64");
  const outputBuffer = await convertToPng(inputBuffer, mimeType);
  return {
    data: outputBuffer.toString("base64"),
    mimeType: "image/png",
  };
}

/**
 * Convert media content if needed.
 * Returns the original or converted media.
 */
export async function convertMediaIfNeeded(
  media: MediaContent
): Promise<MediaContent> {
  // Only convert images
  if (media.type !== "image") {
    return media;
  }

  // Only convert if format is base64 (can't convert URLs)
  if (media.format !== "base64") {
    return media;
  }

  // Check if conversion is needed
  if (!needsConversion(media.mimeType)) {
    return media;
  }

  try {
    const { data, mimeType } = await convertBase64ToPng(
      media.data,
      media.mimeType
    );

    return {
      ...media,
      data,
      mimeType,
    };
  } catch (error) {
    // If conversion fails, throw with helpful message
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";
    throw new Error(
      `Failed to convert ${media.mimeType} to PNG: ${errorMessage}`
    );
  }
}

/**
 * Convert all media in an array if needed.
 * Returns a new array with converted media.
 */
export async function convertAllMediaIfNeeded(
  mediaArray: MediaContent[]
): Promise<MediaContent[]> {
  return Promise.all(mediaArray.map(convertMediaIfNeeded));
}
