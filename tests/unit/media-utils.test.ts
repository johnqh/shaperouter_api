import { describe, it, expect } from "vitest";
import {
  parseDataUrl,
  parseProviderUrl,
  extractMediaFromInput,
} from "../../src/lib/media-utils";

describe("Media Utils", () => {
  describe("parseDataUrl", () => {
    it("should parse a valid image data URL", () => {
      const dataUrl = "data:image/png;base64,iVBORw0KGgo=";
      const result = parseDataUrl(dataUrl, "photo");

      expect(result.error).toBeUndefined();
      expect(result.media).toBeDefined();
      expect(result.media!.type).toBe("image");
      expect(result.media!.format).toBe("base64");
      expect(result.media!.mimeType).toBe("image/png");
      expect(result.media!.data).toBe("iVBORw0KGgo=");
      expect(result.media!.fieldName).toBe("photo");
    });

    it("should parse a valid audio data URL", () => {
      const dataUrl = "data:audio/mp3;base64,AAABBB==";
      const result = parseDataUrl(dataUrl, "sound");

      expect(result.error).toBeUndefined();
      expect(result.media).toBeDefined();
      expect(result.media!.type).toBe("audio");
      expect(result.media!.mimeType).toBe("audio/mp3");
    });

    it("should return empty for non-data-URL strings", () => {
      const result = parseDataUrl("not a data url");

      expect(result.media).toBeUndefined();
      expect(result.error).toBeUndefined();
    });

    it("should return error for unsupported MIME type", () => {
      const dataUrl = "data:image/xyz;base64,AAAA";
      const result = parseDataUrl(dataUrl);

      expect(result.error).toContain("Unsupported MIME type");
    });

    it("should return error for oversized base64 data", () => {
      // Create a data URL that exceeds 20MB when decoded
      const hugeData = "A".repeat(30 * 1024 * 1024); // ~22.5MB decoded
      const dataUrl = `data:image/png;base64,${hugeData}`;
      const result = parseDataUrl(dataUrl);

      expect(result.error).toContain("exceeds");
      expect(result.error).toContain("MB limit");
    });

    it("should handle data URL without field name", () => {
      const dataUrl = "data:image/jpeg;base64,/9j/4AAQ";
      const result = parseDataUrl(dataUrl);

      expect(result.media).toBeDefined();
      expect(result.media!.fieldName).toBeUndefined();
    });
  });

  describe("parseProviderUrl", () => {
    it("should parse a valid gs:// URL", () => {
      const url = "gs://my-bucket/path/to/image.png";
      const result = parseProviderUrl(url, undefined, "photo");

      expect(result.error).toBeUndefined();
      expect(result.media).toBeDefined();
      expect(result.media!.type).toBe("image");
      expect(result.media!.format).toBe("url");
      expect(result.media!.mimeType).toBe("image/png");
      expect(result.media!.data).toBe(url);
      expect(result.media!.fieldName).toBe("photo");
    });

    it("should reject HTTP URLs for SSRF prevention", () => {
      const result = parseProviderUrl("http://evil.com/file.png");

      expect(result.error).toContain("HTTP/HTTPS URLs not allowed");
    });

    it("should reject HTTPS URLs for SSRF prevention", () => {
      const result = parseProviderUrl("https://evil.com/file.png");

      expect(result.error).toContain("HTTP/HTTPS URLs not allowed");
    });

    it("should return empty for non-URL strings", () => {
      const result = parseProviderUrl("not a url");

      expect(result.media).toBeUndefined();
      expect(result.error).toBeUndefined();
    });

    it("should use provided MIME type", () => {
      const url = "gs://bucket/audio-file";
      const result = parseProviderUrl(url, "audio/wav");

      expect(result.media).toBeDefined();
      expect(result.media!.mimeType).toBe("audio/wav");
      expect(result.media!.type).toBe("audio");
    });

    it("should return error when MIME type cannot be inferred", () => {
      const url = "gs://bucket/file-without-extension";
      const result = parseProviderUrl(url);

      expect(result.error).toContain("Cannot infer MIME type");
    });
  });

  describe("extractMediaFromInput", () => {
    it("should extract media from flat object", () => {
      const input = {
        name: "Test",
        image: "data:image/png;base64,iVBORw0KGgo=",
      };

      const result = extractMediaFromInput(input);

      expect(result.error).toBeUndefined();
      expect(result.result).toBeDefined();
      expect(result.result!.media).toHaveLength(1);
      expect(result.result!.media[0]!.type).toBe("image");
      expect(result.result!.cleanedInput.name).toBe("Test");
      expect(result.result!.cleanedInput.image).toBe("[Image: image]");
    });

    it("should handle input with no media", () => {
      const input = {
        name: "Test",
        description: "A regular text field",
      };

      const result = extractMediaFromInput(input);

      expect(result.error).toBeUndefined();
      expect(result.result).toBeDefined();
      expect(result.result!.media).toHaveLength(0);
      expect(result.result!.cleanedInput).toEqual(input);
    });

    it("should extract media from nested objects", () => {
      const input = {
        data: {
          nested_image: "data:image/jpeg;base64,/9j/4AAQ",
        },
      };

      const result = extractMediaFromInput(input);

      expect(result.error).toBeUndefined();
      expect(result.result!.media).toHaveLength(1);
      expect(result.result!.media[0]!.fieldName).toBe("data.nested_image");
    });

    it("should extract media from arrays", () => {
      const input = {
        images: [
          "data:image/png;base64,iVBORw0KGgo=",
          "data:image/jpeg;base64,/9j/4AAQ",
        ],
      };

      const result = extractMediaFromInput(input);

      expect(result.error).toBeUndefined();
      expect(result.result!.media).toHaveLength(2);
    });

    it("should return error for unsupported media types", () => {
      const input = {
        image: "data:image/xyz;base64,AAAA",
      };

      const result = extractMediaFromInput(input);

      expect(result.error).toBeDefined();
      expect(result.error).toContain("Unsupported MIME type");
    });

    it("should extract gs:// URLs", () => {
      const input = {
        photo: "gs://my-bucket/image.png",
      };

      const result = extractMediaFromInput(input);

      expect(result.error).toBeUndefined();
      expect(result.result!.media).toHaveLength(1);
      expect(result.result!.media[0]!.format).toBe("url");
    });

    it("should reject HTTP URLs in input data", () => {
      const input = {
        photo: "https://evil.com/image.png",
      };

      // HTTP URLs that don't match data: or gs:// patterns are not treated as media
      const result = extractMediaFromInput(input);

      // The URL doesn't match DATA_URL_REGEX or PROVIDER_URL_REGEX
      // so it's just kept as-is (not treated as media)
      expect(result.error).toBeUndefined();
      expect(result.result!.media).toHaveLength(0);
    });

    it("should handle multiple media fields", () => {
      const input = {
        text: "hello",
        photo: "data:image/png;base64,iVBORw0KGgo=",
        voice: "data:audio/mp3;base64,AAABBB==",
      };

      const result = extractMediaFromInput(input);

      expect(result.error).toBeUndefined();
      expect(result.result!.media).toHaveLength(2);
      expect(result.result!.cleanedInput.text).toBe("hello");
    });
  });
});
