/**
 * @fileoverview Reserved input field extraction for AI invocations
 * @description A handful of input keys are consumed by ShapeRouter rather than
 * passed to the model: `context`, `web_search`, and `max_output_tokens`.
 *
 * They are pulled out in one pass, before the prompt is built, so a reserved key
 * can never leak into the text the model sees. Doing this per-field at different
 * points in the request is what previously let `web_search` reach the prompt.
 */

/** Input keys ShapeRouter consumes instead of forwarding to the model. */
export const RESERVED_INPUT_FIELDS = [
  "context",
  "web_search",
  "max_output_tokens",
] as const;

/** Reserved values pulled from an invocation's input. */
export interface ReservedFields {
  /**
   * Per-call override of the endpoint's configured context. Only a non-empty
   * string counts; anything else is discarded so a malformed value cannot blank
   * out the endpoint's own context.
   */
  context?: string;
  /**
   * The caller's `web_search` preference: `false` only for an explicit `false`,
   * `true` for any other present value, `undefined` when absent. Whether search
   * actually runs is still gated by the endpoint -- this can only turn it off.
   */
  webSearch?: boolean;
  /**
   * Raw `max_output_tokens` as supplied. Left unvalidated here so the caller
   * sees one validation error from `resolveMaxOutputTokens`, which owns the rule.
   */
  maxOutputTokens?: unknown;
  /** The input with every reserved key removed. */
  cleanedInput: unknown;
}

/**
 * Split an invocation's input into reserved values and the payload for the model.
 *
 * @param inputData - Raw input: a JSON body, or parsed query parameters
 * @returns The reserved values plus a copy of the input without them
 */
export function extractReservedFields(inputData: unknown): ReservedFields {
  if (
    typeof inputData !== "object" ||
    inputData === null ||
    Array.isArray(inputData)
  ) {
    return { cleanedInput: inputData };
  }

  const {
    context,
    web_search: webSearchRaw,
    max_output_tokens: maxOutputTokens,
    ...cleanedInput
  } = inputData as Record<string, unknown>;

  const result: ReservedFields = { cleanedInput };

  if (typeof context === "string" && context.trim().length > 0) {
    result.context = context;
  }
  if (webSearchRaw !== undefined) {
    // A GET invocation's params are strings, so an explicit `web_search=false`
    // arrives as the string "false". Treating that as truthy would silently
    // ignore the caller's only way to turn search off on that path.
    const isFalse =
      webSearchRaw === false ||
      (typeof webSearchRaw === "string" &&
        webSearchRaw.toLowerCase() === "false");
    result.webSearch = !isFalse;
  }
  if (maxOutputTokens !== undefined) {
    result.maxOutputTokens = maxOutputTokens;
  }

  return result;
}
