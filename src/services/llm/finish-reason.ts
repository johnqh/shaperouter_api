/**
 * @fileoverview Finish-reason normalization across LLM providers
 * @description Providers report why generation stopped under different names
 * (`finish_reason`, `stop_reason`, `finishReason`) and with different
 * vocabularies. This maps all of them onto the {@link FinishReason} union that
 * ShapeRouter reports to callers.
 *
 * The distinction that matters is `length`: a truncated answer usually fails
 * schema validation, and without this a caller diagnoses a truncation as a
 * malformed model -- a different fault with a different correct fix.
 */

import type { FinishReason } from "@sudobility/shaperouter_types";

/**
 * Raw provider values, lowercased, mapped to normalized reasons.
 *
 * - OpenAI chat completions: `stop`, `length`, `tool_calls`, `content_filter`, `function_call`
 * - OpenAI Responses API: `max_output_tokens`, `content_filter`
 * - Anthropic: `end_turn`, `max_tokens`, `stop_sequence`, `tool_use`, `refusal`
 * - Gemini: `STOP`, `MAX_TOKENS`, `SAFETY`, `RECITATION`, `OTHER`
 */
const FINISH_REASON_MAP: Record<string, FinishReason> = {
  // Natural completion
  stop: "stop",
  end_turn: "stop",
  stop_sequence: "stop",
  complete: "stop",

  // Hit the token ceiling -- the reason this normalization exists
  length: "length",
  max_tokens: "length",
  max_output_tokens: "length",

  // Stopped by a safety system
  content_filter: "content_filter",
  safety: "content_filter",
  recitation: "content_filter",
  refusal: "content_filter",
  blocklist: "content_filter",

  // Stopped to call a tool
  tool_calls: "tool_calls",
  tool_use: "tool_calls",
  function_call: "tool_calls",

  other: "other",
};

/**
 * Normalize a provider's stop reason.
 *
 * @param raw - The provider's raw value, in whatever casing it used
 * @returns The normalized reason, `"other"` for an unrecognized string, or
 *   `undefined` when the provider reported nothing usable
 */
export function normalizeFinishReason(raw: unknown): FinishReason | undefined {
  if (typeof raw !== "string" || raw.length === 0) {
    return undefined;
  }
  return FINISH_REASON_MAP[raw.toLowerCase()] ?? "other";
}
