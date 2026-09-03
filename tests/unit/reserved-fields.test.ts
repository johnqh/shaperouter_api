import { describe, it, expect } from "vitest";
import { extractReservedFields } from "../../src/lib/reserved-fields";

describe("extractReservedFields", () => {
  it("leaves ordinary input untouched", () => {
    const input = { text: "hello", count: 3 };
    const result = extractReservedFields(input);

    expect(result.cleanedInput).toEqual({ text: "hello", count: 3 });
    expect(result.context).toBeUndefined();
    expect(result.webSearch).toBeUndefined();
    expect(result.maxOutputTokens).toBeUndefined();
  });

  it("removes every reserved field from the input the model sees", () => {
    const input = {
      text: "hello",
      context: "be terse",
      web_search: false,
      max_output_tokens: 2000,
    };

    const result = extractReservedFields(input);

    expect(result.cleanedInput).toEqual({ text: "hello" });
  });

  it("does not mutate the caller's object", () => {
    const input = { text: "hello", max_output_tokens: 2000 };
    extractReservedFields(input);
    expect(input).toEqual({ text: "hello", max_output_tokens: 2000 });
  });

  describe("context", () => {
    it("extracts a non-empty string", () => {
      expect(extractReservedFields({ context: "be terse" }).context).toBe(
        "be terse"
      );
    });

    it("ignores a blank string, so it does not override the endpoint's", () => {
      expect(extractReservedFields({ context: "   " }).context).toBeUndefined();
    });

    it("ignores a non-string", () => {
      expect(extractReservedFields({ context: 42 }).context).toBeUndefined();
    });

    it("still strips a rejected context from the input", () => {
      expect(extractReservedFields({ a: 1, context: 42 }).cleanedInput).toEqual({
        a: 1,
      });
    });
  });

  describe("web_search", () => {
    it("is undefined when absent", () => {
      expect(extractReservedFields({ a: 1 }).webSearch).toBeUndefined();
    });

    it("is false only for an explicit false", () => {
      expect(extractReservedFields({ web_search: false }).webSearch).toBe(false);
    });

    it("is true for any other present value", () => {
      expect(extractReservedFields({ web_search: true }).webSearch).toBe(true);
      expect(extractReservedFields({ web_search: "yes" }).webSearch).toBe(true);
    });

    it('treats the string "false" as false, since GET params are strings', () => {
      expect(extractReservedFields({ web_search: "false" }).webSearch).toBe(
        false
      );
      expect(extractReservedFields({ web_search: "FALSE" }).webSearch).toBe(
        false
      );
    });
  });

  describe("max_output_tokens", () => {
    it("passes the raw value through for validation elsewhere", () => {
      expect(extractReservedFields({ max_output_tokens: 2000 }).maxOutputTokens).toBe(2000);
      expect(extractReservedFields({ max_output_tokens: "bad" }).maxOutputTokens).toBe("bad");
    });

    it("is undefined when absent", () => {
      expect(extractReservedFields({ a: 1 }).maxOutputTokens).toBeUndefined();
    });
  });

  describe("non-object input", () => {
    it.each([
      ["a string", "just text"],
      ["an array", [1, 2, 3]],
      ["null", null],
      ["a number", 7],
    ])("passes %s through unchanged with no reserved fields", (_label, input) => {
      const result = extractReservedFields(input);
      expect(result.cleanedInput).toEqual(input);
      expect(result.context).toBeUndefined();
      expect(result.webSearch).toBeUndefined();
      expect(result.maxOutputTokens).toBeUndefined();
    });
  });
});
