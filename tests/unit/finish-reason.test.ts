import { describe, it, expect } from "vitest";
import { normalizeFinishReason } from "../../src/services/llm/finish-reason";

describe("normalizeFinishReason", () => {
  it("returns undefined when the provider reported nothing", () => {
    expect(normalizeFinishReason(undefined)).toBeUndefined();
    expect(normalizeFinishReason(null)).toBeUndefined();
    expect(normalizeFinishReason("")).toBeUndefined();
  });

  describe("maps each provider's vocabulary for hitting the token ceiling", () => {
    it.each([
      ["OpenAI chat", "length"],
      ["OpenAI Responses API", "max_output_tokens"],
      ["Anthropic", "max_tokens"],
      ["Gemini", "MAX_TOKENS"],
    ])("%s -> length", (_provider, raw) => {
      expect(normalizeFinishReason(raw)).toBe("length");
    });
  });

  describe("maps each provider's vocabulary for a natural stop", () => {
    it.each([
      ["OpenAI", "stop"],
      ["Anthropic end_turn", "end_turn"],
      ["Anthropic stop_sequence", "stop_sequence"],
      ["Gemini", "STOP"],
    ])("%s -> stop", (_provider, raw) => {
      expect(normalizeFinishReason(raw)).toBe("stop");
    });
  });

  it("maps safety stops to content_filter", () => {
    expect(normalizeFinishReason("content_filter")).toBe("content_filter");
    expect(normalizeFinishReason("SAFETY")).toBe("content_filter");
    expect(normalizeFinishReason("RECITATION")).toBe("content_filter");
    expect(normalizeFinishReason("refusal")).toBe("content_filter");
  });

  it("maps tool stops to tool_calls", () => {
    expect(normalizeFinishReason("tool_calls")).toBe("tool_calls");
    expect(normalizeFinishReason("tool_use")).toBe("tool_calls");
    expect(normalizeFinishReason("function_call")).toBe("tool_calls");
  });

  it("is case-insensitive, since providers disagree on casing", () => {
    expect(normalizeFinishReason("Length")).toBe("length");
    expect(normalizeFinishReason("stop")).toBe("stop");
  });

  it("falls back to 'other' for a reason it does not recognise", () => {
    expect(normalizeFinishReason("wormhole")).toBe("other");
  });

  it("ignores non-string values rather than throwing", () => {
    expect(normalizeFinishReason(42)).toBeUndefined();
    expect(normalizeFinishReason({})).toBeUndefined();
  });
});
