import { describe, it, expect } from "vitest";
import { resolveMaxOutputTokens } from "../../src/lib/output-limit";

describe("resolveMaxOutputTokens", () => {
  describe("when the endpoint has no ceiling (null = no protection)", () => {
    it("stays unlimited when the caller asks for nothing", () => {
      const result = resolveMaxOutputTokens(null, undefined);
      expect(result).toEqual({ ok: true, value: null });
    });

    it("honours a per-call ceiling, since asking for less is always safe", () => {
      const result = resolveMaxOutputTokens(null, 2000);
      expect(result).toEqual({ ok: true, value: 2000 });
    });
  });

  describe("when the endpoint has a ceiling", () => {
    it("uses the endpoint ceiling when the caller asks for nothing", () => {
      const result = resolveMaxOutputTokens(8000, undefined);
      expect(result).toEqual({ ok: true, value: 8000 });
    });

    it("uses the smaller per-call ceiling", () => {
      const result = resolveMaxOutputTokens(8000, 2000);
      expect(result).toEqual({ ok: true, value: 2000 });
    });

    it("clamps a larger per-call ceiling down to the endpoint's", () => {
      const result = resolveMaxOutputTokens(8000, 20000);
      expect(result).toEqual({ ok: true, value: 8000 });
    });

    it("clamps rather than errors, so a caller cannot escape the operator limit", () => {
      const result = resolveMaxOutputTokens(100, Number.MAX_SAFE_INTEGER);
      expect(result).toEqual({ ok: true, value: 100 });
    });
  });

  describe("explicit null from the caller", () => {
    it("cannot be used to remove the endpoint's ceiling", () => {
      const result = resolveMaxOutputTokens(8000, null);
      expect(result).toEqual({ ok: true, value: 8000 });
    });
  });

  describe("GET requests, where every query param arrives as a string", () => {
    it("accepts a numeric string", () => {
      expect(resolveMaxOutputTokens(8000, "2000")).toEqual({
        ok: true,
        value: 2000,
      });
    });

    it("clamps a numeric string to the endpoint ceiling", () => {
      expect(resolveMaxOutputTokens(8000, "20000")).toEqual({
        ok: true,
        value: 8000,
      });
    });

    it.each([
      ["non-numeric", "abc"],
      ["fractional", "12.5"],
      ["zero", "0"],
      ["negative", "-1"],
      ["empty", ""],
      ["numeric with trailing junk", "2000abc"],
    ])("still rejects a %s string", (_label, value) => {
      expect(resolveMaxOutputTokens(8000, value).ok).toBe(false);
    });
  });

  describe("invalid per-call values are rejected, not silently ignored", () => {
    it.each([
      ["zero", 0],
      ["negative", -1],
      ["fractional", 12.5],
      ["a boolean", true],
      ["NaN", NaN],
      ["Infinity", Infinity],
    ])("rejects %s", (_label, value) => {
      const result = resolveMaxOutputTokens(8000, value);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toMatch(/max_output_tokens/);
      }
    });
  });
});
