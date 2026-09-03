import { describe, it, expect } from "vitest";
import {
  validateMediaCapabilities,
  validateWhisperRequest,
  isTranscriptionModel,
  isGenerativeModel,
} from "../../src/lib/capability-validator";
import type { MediaContent } from "@sudobility/shaperouter_types";

describe("Capability Validator", () => {
  describe("isTranscriptionModel", () => {
    it("should return true for Whisper models", () => {
      expect(isTranscriptionModel("whisper-1")).toBe(true);
      expect(isTranscriptionModel("whisper-large-v3")).toBe(true);
      expect(isTranscriptionModel("distil-whisper-large-v3-en")).toBe(true);
    });

    it("should return false for non-Whisper models", () => {
      expect(isTranscriptionModel("gpt-4o")).toBe(false);
      expect(isTranscriptionModel("claude-3-opus")).toBe(false);
      expect(isTranscriptionModel("gemini-pro")).toBe(false);
    });

    it("should be case-insensitive", () => {
      expect(isTranscriptionModel("WHISPER-1")).toBe(true);
      expect(isTranscriptionModel("Whisper-Large")).toBe(true);
    });
  });

  describe("isGenerativeModel", () => {
    it("should return true for Imagen models", () => {
      expect(isGenerativeModel("imagen-3.0-generate-001")).toBe(true);
      expect(isGenerativeModel("imagen-2")).toBe(true);
    });

    it("should return true for Veo models", () => {
      expect(isGenerativeModel("veo-001")).toBe(true);
      expect(isGenerativeModel("veo-2.0-generate-001")).toBe(true);
    });

    it("should return false for non-generative models", () => {
      expect(isGenerativeModel("gpt-4o")).toBe(false);
      expect(isGenerativeModel("claude-3-opus")).toBe(false);
    });

    it("should be case-insensitive", () => {
      expect(isGenerativeModel("IMAGEN-3")).toBe(true);
      expect(isGenerativeModel("VEO-001")).toBe(true);
    });
  });

  describe("validateWhisperRequest", () => {
    it("should pass for non-Whisper models", () => {
      const result = validateWhisperRequest("gpt-4o", []);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it("should require exactly one audio input for Whisper", () => {
      const audioMedia: MediaContent = {
        type: "audio",
        format: "base64",
        mimeType: "audio/mp3",
        data: "AAABBB==",
      };

      const result = validateWhisperRequest("whisper-1", [audioMedia]);
      expect(result.valid).toBe(true);
    });

    it("should fail for Whisper with no audio input", () => {
      const result = validateWhisperRequest("whisper-1", []);
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain("require exactly one audio");
    });

    it("should fail for Whisper with multiple audio inputs", () => {
      const media: MediaContent[] = [
        { type: "audio", format: "base64", mimeType: "audio/mp3", data: "AAA" },
        { type: "audio", format: "base64", mimeType: "audio/wav", data: "BBB" },
      ];

      const result = validateWhisperRequest("whisper-1", media);
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain("only one audio");
    });

    it("should fail for Whisper with non-audio media", () => {
      const media: MediaContent[] = [
        { type: "audio", format: "base64", mimeType: "audio/mp3", data: "AAA" },
        { type: "image", format: "base64", mimeType: "image/png", data: "BBB" },
      ];

      const result = validateWhisperRequest("whisper-1", media);
      expect(result.valid).toBe(false);
      expect(result.errors).toEqual(
        expect.arrayContaining([expect.stringContaining("only accept audio")])
      );
    });
  });

  describe("validateMediaCapabilities", () => {
    it("should pass for empty media with no output expectations", () => {
      const result = validateMediaCapabilities({
        model: "gpt-4o",
        provider: "openai",
        inputMedia: [],
        expectsOutput: {},
      });
      expect(result.valid).toBe(true);
    });

    it("should validate base64 size limits", () => {
      // Create huge base64 data that exceeds image size limit
      const hugeData = "A".repeat(30 * 1024 * 1024);
      const media: MediaContent = {
        type: "image",
        format: "base64",
        mimeType: "image/png",
        data: hugeData,
      };

      const result = validateMediaCapabilities({
        model: "gpt-4o",
        provider: "openai",
        inputMedia: [media],
        expectsOutput: {},
      });

      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain("exceeds");
    });

    it("should reject URL format for non-Gemini providers", () => {
      const media: MediaContent = {
        type: "image",
        format: "url",
        mimeType: "image/png",
        data: "gs://bucket/image.png",
      };

      const result = validateMediaCapabilities({
        model: "gpt-4o",
        provider: "openai",
        inputMedia: [media],
        expectsOutput: {},
      });

      expect(result.valid).toBe(false);
      expect(result.errors).toEqual(
        expect.arrayContaining([expect.stringContaining("only supported for Gemini")])
      );
    });

    it("should allow URL format for Gemini provider with gs:// URL", () => {
      const media: MediaContent = {
        type: "image",
        format: "url",
        mimeType: "image/png",
        data: "gs://bucket/image.png",
      };

      const result = validateMediaCapabilities({
        model: "gemini-2.5-flash",
        provider: "gemini",
        inputMedia: [media],
        expectsOutput: {},
      });

      // Should not have URL-related errors (might have other capability errors)
      const urlErrors = result.errors.filter(e => e.includes("URL format"));
      expect(urlErrors).toHaveLength(0);
    });

    it("should validate provider-specific audio formats", () => {
      const media: MediaContent = {
        type: "audio",
        format: "base64",
        mimeType: "audio/ogg",
        data: "AAABBB==",
      };

      const result = validateMediaCapabilities({
        model: "gpt-4o-audio-preview",
        provider: "openai",
        inputMedia: [media],
        expectsOutput: {},
      });

      expect(result.valid).toBe(false);
      expect(result.errors).toEqual(
        expect.arrayContaining([expect.stringContaining("does not support audio format")])
      );
    });
  });
});
