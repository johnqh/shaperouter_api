/**
 * @fileoverview Per-invocation output ceiling resolution
 * @description Combines an endpoint's configured `max_output_tokens` with an
 * optional per-call override into the single ceiling handed to the provider.
 *
 * Its own module, free of Hono and the database, so the clamping rule -- the
 * part with security consequences -- is testable in isolation.
 */

/** Result of resolving a ceiling: a usable value, or a caller-facing error. */
export type ResolvedMaxOutputTokens =
  | { ok: true; value: number | null }
  | { ok: false; error: string };

/**
 * Resolve the output ceiling for one invocation.
 *
 * The per-call value is a **ceiling, not a raise**: it is clamped to the
 * endpoint's own ceiling, so a caller can only ever ask for fewer tokens. That
 * keeps it from becoming a way around an operator's limit.
 *
 * An endpoint ceiling of `null` means no protection at all. A per-call value is
 * still honoured in that case -- asking for less than unlimited is safe, and it
 * is the only protection available on endpoints that predate this field.
 *
 * A malformed per-call value is an error rather than a silent fallback: a caller
 * who typos their ceiling should learn immediately, not discover later that the
 * protection they thought they had was never applied.
 *
 * @param endpointCeiling - The endpoint's configured ceiling, or null for none
 * @param requested - The caller's `max_output_tokens`, if any. `null` and
 *   `undefined` both mean "not specified" and leave the endpoint ceiling intact.
 * @returns The ceiling to send to the provider, or a validation error
 */
export function resolveMaxOutputTokens(
  endpointCeiling: number | null,
  requested: unknown
): ResolvedMaxOutputTokens {
  if (requested === undefined || requested === null) {
    return { ok: true, value: endpointCeiling };
  }

  // GET invocations parse their input from the query string, so a perfectly
  // valid ceiling arrives as the string "2000". Accept that spelling, but only
  // when it denotes a whole number exactly -- "12.5" and "2000abc" are errors.
  const candidate =
    typeof requested === "string" && /^\d+$/.test(requested.trim())
      ? Number(requested.trim())
      : requested;

  if (
    typeof candidate !== "number" ||
    !Number.isInteger(candidate) ||
    candidate <= 0
  ) {
    return {
      ok: false,
      error:
        "max_output_tokens must be a positive integer, or omitted to use the endpoint's own limit",
    };
  }

  // Clamp rather than reject: a caller asking for more than the operator allows
  // gets the operator's limit, not a failed request.
  if (endpointCeiling === null) {
    return { ok: true, value: candidate };
  }
  return { ok: true, value: Math.min(candidate, endpointCeiling) };
}
