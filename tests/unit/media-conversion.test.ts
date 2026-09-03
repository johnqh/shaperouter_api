import { describe, it, expect } from "vitest";
import {
  needsConversion,
  isConvertibleMimeType,
  convertMediaIfNeeded,
  convertAllMediaIfNeeded,
} from "../../src/lib/media-conversion";
import type { MediaContent } from "@sudobility/shaperouter_types";

describe("Media Conversion", () => {
  describe("needsConversion", () => {
    it("should return false for directly supported formats", () => {
      expect(needsConversion("image/jpeg")).toBe(false);
      expect(needsConversion("image/png")).toBe(false);
      expect(needsConversion("image/gif")).toBe(false);
      expect(needsConversion("image/webp")).toBe(false);
    });

    it("should return true for convertible formats", () => {
      expect(needsConversion("image/svg+xml")).toBe(true);
      expect(needsConversion("image/tiff")).toBe(true);
      expect(needsConversion("image/bmp")).toBe(true);
      expect(needsConversion("image/heic")).toBe(true);
      expect(needsConversion("image/heif")).toBe(true);
      expect(needsConversion("image/avif")).toBe(true);
    });

    it("should return false for unknown formats", () => {
      expect(needsConversion("image/xyz")).toBe(false);
      expect(needsConversion("audio/mp3")).toBe(false);
    });
  });

  describe("isConvertibleMimeType", () => {
    it("should return true for convertible MIME types", () => {
      expect(isConvertibleMimeType("image/svg+xml")).toBe(true);
      expect(isConvertibleMimeType("image/tiff")).toBe(true);
    });

    it("should return false for directly supported types", () => {
      expect(isConvertibleMimeType("image/jpeg")).toBe(false);
      expect(isConvertibleMimeType("image/png")).toBe(false);
    });

    it("should return false for audio/video types", () => {
      expect(isConvertibleMimeType("audio/mp3")).toBe(false);
      expect(isConvertibleMimeType("video/mp4")).toBe(false);
    });
  });

  describe("convertMediaIfNeeded", () => {
    it("should pass through non-image media unchanged", async () => {
      const media: MediaContent = {
        type: "audio",
        format: "base64",
        mimeType: "audio/mp3",
        data: "AAABBB==",
      };

      const result = await convertMediaIfNeeded(media);
      expect(result).toEqual(media);
    });

    it("should pass through URL-format media unchanged", async () => {
      const media: MediaContent = {
        type: "image",
        format: "url",
        mimeType: "image/svg+xml",
        data: "gs://bucket/file.svg",
      };

      const result = await convertMediaIfNeeded(media);
      expect(result).toEqual(media);
    });

    it("should pass through already-supported image formats", async () => {
      const media: MediaContent = {
        type: "image",
        format: "base64",
        mimeType: "image/jpeg",
        data: "/9j/4AAQ", // Not a real JPEG, just testing passthrough
      };

      const result = await convertMediaIfNeeded(media);
      expect(result).toEqual(media);
    });
  });

  describe("convertAllMediaIfNeeded", () => {
    it("should handle empty array", async () => {
      const result = await convertAllMediaIfNeeded([]);
      expect(result).toEqual([]);
    });

    it("should pass through already-supported media", async () => {
      const media: MediaContent[] = [
        {
          type: "image",
          format: "base64",
          mimeType: "image/png",
          data: "iVBORw0KGgo=",
        },
        {
          type: "audio",
          format: "base64",
          mimeType: "audio/mp3",
          data: "AAABBB==",
        },
      ];

      const result = await convertAllMediaIfNeeded(media);
      expect(result).toHaveLength(2);
      expect(result[0]!.mimeType).toBe("image/png");
      expect(result[1]!.mimeType).toBe("audio/mp3");
    });
  });
});
