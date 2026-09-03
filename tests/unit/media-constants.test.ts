import { describe, it, expect } from "vitest";
import {
  ALLOWED_MIME_TYPES,
  CONVERTIBLE_MIME_TYPES,
  ACCEPTED_MIME_TYPES,
  SIZE_LIMITS,
  DATA_URL_REGEX,
  PROVIDER_URL_REGEX,
  isAllowedMimeType,
  getSizeLimit,
  inferMediaTypeFromMime,
  inferMimeFromUrl,
  getProviderAudioFormats,
  getOpenAIAudioFormat,
  OPENAI_AUDIO_INPUT_MIMES,
  GEMINI_AUDIO_INPUT_MIMES,
} from "../../src/lib/media-constants";

describe("Media Constants", () => {
  describe("ALLOWED_MIME_TYPES", () => {
    it("should have image types", () => {
      expect(ALLOWED_MIME_TYPES.image).toContain("image/jpeg");
      expect(ALLOWED_MIME_TYPES.image).toContain("image/png");
      expect(ALLOWED_MIME_TYPES.image).toContain("image/gif");
      expect(ALLOWED_MIME_TYPES.image).toContain("image/webp");
    });

    it("should have audio types", () => {
      expect(ALLOWED_MIME_TYPES.audio).toContain("audio/mp3");
      expect(ALLOWED_MIME_TYPES.audio).toContain("audio/wav");
    });

    it("should have video types", () => {
      expect(ALLOWED_MIME_TYPES.video).toContain("video/mp4");
      expect(ALLOWED_MIME_TYPES.video).toContain("video/webm");
    });
  });

  describe("CONVERTIBLE_MIME_TYPES", () => {
    it("should include SVG for images", () => {
      expect(CONVERTIBLE_MIME_TYPES.image).toContain("image/svg+xml");
    });

    it("should include TIFF for images", () => {
      expect(CONVERTIBLE_MIME_TYPES.image).toContain("image/tiff");
    });

    it("should include HEIC for images", () => {
      expect(CONVERTIBLE_MIME_TYPES.image).toContain("image/heic");
    });

    it("should have no convertible audio formats", () => {
      expect(CONVERTIBLE_MIME_TYPES.audio).toHaveLength(0);
    });

    it("should have no convertible video formats", () => {
      expect(CONVERTIBLE_MIME_TYPES.video).toHaveLength(0);
    });
  });

  describe("ACCEPTED_MIME_TYPES", () => {
    it("should combine allowed and convertible for images", () => {
      expect(ACCEPTED_MIME_TYPES.image).toContain("image/jpeg");
      expect(ACCEPTED_MIME_TYPES.image).toContain("image/svg+xml");
      expect(ACCEPTED_MIME_TYPES.image).toContain("image/tiff");
    });

    it("should equal allowed for audio (no convertible)", () => {
      expect(ACCEPTED_MIME_TYPES.audio).toEqual([
        ...ALLOWED_MIME_TYPES.audio,
      ]);
    });
  });

  describe("SIZE_LIMITS", () => {
    it("should have 20MB limit for images", () => {
      expect(SIZE_LIMITS.image).toBe(20 * 1024 * 1024);
    });

    it("should have 25MB limit for audio", () => {
      expect(SIZE_LIMITS.audio).toBe(25 * 1024 * 1024);
    });

    it("should have 10MB limit for video", () => {
      expect(SIZE_LIMITS.video).toBe(10 * 1024 * 1024);
    });
  });

  describe("DATA_URL_REGEX", () => {
    it("should match valid image data URLs", () => {
      const match = "data:image/png;base64,iVBORw0KGgo=".match(DATA_URL_REGEX);
      expect(match).not.toBeNull();
      expect(match![1]).toBe("image/png");
      expect(match![2]).toBe("image");
      expect(match![3]).toBe("iVBORw0KGgo=");
    });

    it("should match valid audio data URLs", () => {
      const match = "data:audio/mp3;base64,ABCDEFG=".match(DATA_URL_REGEX);
      expect(match).not.toBeNull();
      expect(match![1]).toBe("audio/mp3");
      expect(match![2]).toBe("audio");
    });

    it("should match valid video data URLs", () => {
      const match = "data:video/mp4;base64,ABCDEFG=".match(DATA_URL_REGEX);
      expect(match).not.toBeNull();
      expect(match![1]).toBe("video/mp4");
      expect(match![2]).toBe("video");
    });

    it("should not match non-data URLs", () => {
      expect("https://example.com/image.png".match(DATA_URL_REGEX)).toBeNull();
      expect("not a data url".match(DATA_URL_REGEX)).toBeNull();
    });

    it("should not match data URLs without base64", () => {
      expect("data:image/png,rawdata".match(DATA_URL_REGEX)).toBeNull();
    });
  });

  describe("PROVIDER_URL_REGEX", () => {
    it("should match gs:// URLs", () => {
      expect(PROVIDER_URL_REGEX.test("gs://my-bucket/path/to/file.png")).toBe(true);
    });

    it("should not match http URLs", () => {
      expect(PROVIDER_URL_REGEX.test("http://example.com/file.png")).toBe(false);
    });

    it("should not match https URLs", () => {
      expect(PROVIDER_URL_REGEX.test("https://example.com/file.png")).toBe(false);
    });

    it("should not match s3:// URLs", () => {
      expect(PROVIDER_URL_REGEX.test("s3://my-bucket/file.png")).toBe(false);
    });
  });

  describe("isAllowedMimeType", () => {
    it("should return true for allowed MIME types", () => {
      expect(isAllowedMimeType("image", "image/jpeg")).toBe(true);
      expect(isAllowedMimeType("image", "image/png")).toBe(true);
      expect(isAllowedMimeType("audio", "audio/mp3")).toBe(true);
      expect(isAllowedMimeType("video", "video/mp4")).toBe(true);
    });

    it("should return false for convertible but not directly allowed", () => {
      expect(isAllowedMimeType("image", "image/svg+xml")).toBe(false);
      expect(isAllowedMimeType("image", "image/tiff")).toBe(false);
    });

    it("should return false for unknown MIME types", () => {
      expect(isAllowedMimeType("image", "image/xyz")).toBe(false);
      expect(isAllowedMimeType("audio", "audio/xyz")).toBe(false);
    });
  });

  describe("getSizeLimit", () => {
    it("should return correct limits for each media type", () => {
      expect(getSizeLimit("image")).toBe(20 * 1024 * 1024);
      expect(getSizeLimit("audio")).toBe(25 * 1024 * 1024);
      expect(getSizeLimit("video")).toBe(10 * 1024 * 1024);
    });
  });

  describe("inferMediaTypeFromMime", () => {
    it("should infer image type", () => {
      expect(inferMediaTypeFromMime("image/jpeg")).toBe("image");
      expect(inferMediaTypeFromMime("image/png")).toBe("image");
      expect(inferMediaTypeFromMime("image/svg+xml")).toBe("image");
    });

    it("should infer audio type", () => {
      expect(inferMediaTypeFromMime("audio/mp3")).toBe("audio");
      expect(inferMediaTypeFromMime("audio/wav")).toBe("audio");
    });

    it("should infer video type", () => {
      expect(inferMediaTypeFromMime("video/mp4")).toBe("video");
      expect(inferMediaTypeFromMime("video/webm")).toBe("video");
    });

    it("should return undefined for unknown types", () => {
      expect(inferMediaTypeFromMime("application/json")).toBeUndefined();
      expect(inferMediaTypeFromMime("text/plain")).toBeUndefined();
    });
  });

  describe("inferMimeFromUrl", () => {
    it("should infer image MIME types from extensions", () => {
      expect(inferMimeFromUrl("gs://bucket/file.jpg")).toBe("image/jpeg");
      expect(inferMimeFromUrl("gs://bucket/file.jpeg")).toBe("image/jpeg");
      expect(inferMimeFromUrl("gs://bucket/file.png")).toBe("image/png");
      expect(inferMimeFromUrl("gs://bucket/file.gif")).toBe("image/gif");
      expect(inferMimeFromUrl("gs://bucket/file.webp")).toBe("image/webp");
    });

    it("should infer audio MIME types from extensions", () => {
      expect(inferMimeFromUrl("gs://bucket/file.mp3")).toBe("audio/mp3");
      expect(inferMimeFromUrl("gs://bucket/file.wav")).toBe("audio/wav");
      expect(inferMimeFromUrl("gs://bucket/file.ogg")).toBe("audio/ogg");
      expect(inferMimeFromUrl("gs://bucket/file.flac")).toBe("audio/flac");
    });

    it("should infer video MIME types from extensions", () => {
      expect(inferMimeFromUrl("gs://bucket/file.mp4")).toBe("video/mp4");
      expect(inferMimeFromUrl("gs://bucket/file.webm")).toBe("video/webm");
      expect(inferMimeFromUrl("gs://bucket/file.mov")).toBe("video/quicktime");
    });

    it("should handle query parameters in URLs", () => {
      expect(inferMimeFromUrl("gs://bucket/file.png?version=1")).toBe("image/png");
    });

    it("should return undefined for unknown extensions", () => {
      expect(inferMimeFromUrl("gs://bucket/file.xyz")).toBeUndefined();
    });

    it("should return undefined for no extension", () => {
      expect(inferMimeFromUrl("gs://bucket/file")).toBeUndefined();
    });
  });

  describe("getProviderAudioFormats", () => {
    it("should return OpenAI-specific formats", () => {
      const formats = getProviderAudioFormats("openai");
      expect(formats).toEqual(OPENAI_AUDIO_INPUT_MIMES);
      expect(formats).toContain("audio/mp3");
      expect(formats).toContain("audio/wav");
    });

    it("should return Gemini-specific formats", () => {
      const formats = getProviderAudioFormats("gemini");
      expect(formats).toEqual(GEMINI_AUDIO_INPUT_MIMES);
      expect(formats).toContain("audio/ogg");
      expect(formats).toContain("audio/flac");
    });

    it("should return all allowed formats for other providers", () => {
      const formats = getProviderAudioFormats("anthropic");
      expect(formats).toEqual(ALLOWED_MIME_TYPES.audio);
    });
  });

  describe("getOpenAIAudioFormat", () => {
    it("should return mp3 for audio/mp3", () => {
      expect(getOpenAIAudioFormat("audio/mp3")).toBe("mp3");
    });

    it("should return mp3 for audio/mpeg", () => {
      expect(getOpenAIAudioFormat("audio/mpeg")).toBe("mp3");
    });

    it("should return wav for audio/wav", () => {
      expect(getOpenAIAudioFormat("audio/wav")).toBe("wav");
    });

    it("should throw for unsupported formats", () => {
      expect(() => getOpenAIAudioFormat("audio/ogg")).toThrow("does not support");
      expect(() => getOpenAIAudioFormat("audio/flac")).toThrow("does not support");
    });
  });
});
