/**
 * @fileoverview Entity API key support
 * @description Extraction and verification for entity-scoped API keys.
 *
 * An entity key ("shrouteent_...") authenticates a caller as the *entity* rather
 * than as a person: CI jobs, deployment scripts, and MCP clients that must keep
 * working when the member who created them leaves. Storage, generation, and
 * verification live in `@sudobility/entity_service`; this module owns the
 * ShapeRouter-specific prefix and the header conventions.
 *
 * Three credentials already exist and must not be confused with this one:
 *   - `shroute_...`    personal key, authenticates a *user* (see user-api-key.ts)
 *   - `sk_live_...`  project key, authenticates callers of an AI endpoint
 *   - Firebase token browser session credential
 */

/** Prefix identifying an entity API key. Distinct from the personal `shroute_`. */
export const ENTITY_API_KEY_PREFIX = "shrouteent";

/** Full prefix including the separator, e.g. "shrouteent_". */
export const ENTITY_API_KEY_PREFIX_WITH_SEPARATOR = `${ENTITY_API_KEY_PREFIX}_`;

/**
 * Check whether a string looks like an entity API key.
 * Used to route an incoming credential to entity auth instead of user auth.
 */
export function isEntityApiKeyFormat(value: string): boolean {
  return (
    value.startsWith(ENTITY_API_KEY_PREFIX_WITH_SEPARATOR) &&
    value.length > ENTITY_API_KEY_PREFIX_WITH_SEPARATOR.length
  );
}

/**
 * Extract an entity API key from request headers.
 *
 * Accepts `X-API-Key: shrouteent_...` (preferred, unambiguous) and
 * `Authorization: Bearer shrouteent_...`. Anything without the prefix is left
 * alone so it can be tried as a personal key or a Firebase ID token instead.
 *
 * @param getHeader Reads a request header by name, case-insensitively
 * @returns The key, or null when the request carries none
 */
export function extractEntityApiKeyFromHeaders(
  getHeader: (name: string) => string | undefined
): string | null {
  const headerKey = getHeader("X-API-Key");
  if (headerKey && isEntityApiKeyFormat(headerKey)) return headerKey;

  const authHeader = getHeader("Authorization");
  if (authHeader) {
    const [type, token] = authHeader.split(" ");
    if (type === "Bearer" && token && isEntityApiKeyFormat(token)) return token;
  }

  return null;
}
