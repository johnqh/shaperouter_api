/**
 * @fileoverview Firebase authentication middleware
 *
 * Uses @sudobility/auth_service helpers to build app-specific middleware.
 */

import type { Context, Next } from "hono";
import type { DecodedIdToken } from "firebase-admin/auth";
import { isSiteAdmin, isAnonymousUser } from "@sudobility/auth_service";
import { verifyIdToken } from "../services/firebase";
import { errorResponse } from "@sudobility/shaperouter_types";
import { eq } from "drizzle-orm";
import { db, users } from "../db";
import { extractUserApiKeyFromHeaders } from "../lib/user-api-key";
import { resolveUserApiKey } from "../lib/user-api-key-cache";
import { extractEntityApiKeyFromHeaders } from "../lib/entity-api-key";
import { entityHelpers } from "../lib/entity-helpers";

/**
 * Augment Hono's ContextVariableMap for type-safe context access.
 */
declare module "hono" {
  interface ContextVariableMap {
    firebaseUser: DecodedIdToken;
    userId: string;
    userEmail: string | null;
    siteAdmin: boolean;
    /**
     * How the caller authenticated. Neither key method has a firebaseUser.
     * "api_key" is a personal key (acts as a user); "entity_api_key" is an
     * entity key (acts as the entity itself).
     */
    authMethod: "firebase" | "api_key" | "entity_api_key";
    /** UUID of the user API key used, when authMethod is "api_key" */
    apiKeyId: string;
    /** UUID of the entity API key used, when authMethod is "entity_api_key" */
    entityApiKeyId: string;
    /** Entity the request acts as, when authMethod is "entity_api_key" */
    entityApiKeyEntityId: string;
  }
}

/**
 * Path prefix an entity API key may reach.
 *
 * Entity keys are scoped to entity-owned resources: projects, endpoints,
 * provider keys, storage, analytics. They must not reach `/users/...`, which
 * would let a key read or mint credentials belonging to the person who created
 * it -- an escalation from "acts as the entity" to "acts as its author".
 */
const ENTITY_API_KEY_PATH_PREFIX = "/entities/";

/**
 * Ensure user record exists in database.
 * Uses firebase_uid as the primary key.
 */
async function ensureUserExists(
  firebaseUid: string,
  email?: string | null
): Promise<void> {
  const existing = await db
    .select()
    .from(users)
    .where(eq(users.firebase_uid, firebaseUid));

  if (existing.length === 0) {
    await db.insert(users).values({
      firebase_uid: firebaseUid,
      email: email ?? null,
    });
  }
}

/**
 * Firebase authentication middleware.
 *
 * Verifies Firebase token and sets context variables:
 * - firebaseUser: The decoded Firebase token
 * - userId: The Firebase UID
 * - userEmail: The user's email (or null)
 * - siteAdmin: Whether the user is a site admin
 *
 * Also ensures user record exists in database (fire-and-forget).
 */
export async function firebaseAuthMiddleware(c: Context, next: Next) {
  // 1. Personal API key ("shroute_..."), from X-API-Key or Authorization: Bearer.
  // A resolved key sets exactly the same context variables a token would, minus
  // firebaseUser, so every downstream handler behaves identically.
  const userApiKey = extractUserApiKeyFromHeaders(name => c.req.header(name));
  if (userApiKey) {
    const resolved = await resolveUserApiKey(userApiKey);
    if (!resolved) {
      return c.json(errorResponse("Invalid or inactive API key"), 401);
    }

    c.set("userId", resolved.userId);
    c.set("userEmail", resolved.userEmail);
    c.set("siteAdmin", isSiteAdmin(resolved.userEmail));
    c.set("authMethod", "api_key");
    c.set("apiKeyId", resolved.keyId);

    await next();
    return;
  }

  // 2. Entity API key ("shrouteent_..."). Authenticates as the entity itself: no
  // user identity, so downstream permission checks match on the entity instead
  // of a membership role. `userId` is still populated with the key's author so
  // audit columns keep a value.
  const entityApiKey = extractEntityApiKeyFromHeaders(name =>
    c.req.header(name)
  );
  if (entityApiKey) {
    if (!entityHelpers.apiKeys) {
      return c.json(errorResponse("Entity API keys are not enabled"), 501);
    }

    const identity = await entityHelpers.apiKeys.verifyKey(entityApiKey);
    if (!identity) {
      return c.json(errorResponse("Invalid or inactive API key"), 401);
    }

    if (!c.req.path.includes(ENTITY_API_KEY_PATH_PREFIX)) {
      return c.json(
        errorResponse(
          "Entity API keys may only access entity-scoped routes. Use a Firebase token or personal API key for this request."
        ),
        403
      );
    }

    c.set("userId", identity.createdByUserId);
    c.set("userEmail", null);
    c.set("siteAdmin", false);
    c.set("authMethod", "entity_api_key");
    c.set("entityApiKeyId", identity.keyId);
    c.set("entityApiKeyEntityId", identity.entityId);

    // Best-effort usage bookkeeping; never blocks the request
    entityHelpers.apiKeys
      .touchLastUsed(identity.keyId)
      .catch(err => console.error("Failed to stamp API key usage:", err));

    await next();
    return;
  }

  // 3. Firebase ID token
  const authHeader = c.req.header("Authorization");

  if (!authHeader) {
    return c.json(
      errorResponse(
        "Authorization required. Provide a Firebase ID token as 'Authorization: Bearer <token>', a personal API key as 'X-API-Key: shroute_...', or an entity API key as 'X-API-Key: shrouteent_...'"
      ),
      401
    );
  }

  const [type, token] = authHeader.split(" ");

  if (type !== "Bearer" || !token) {
    return c.json(
      errorResponse("Invalid authorization format. Use: Bearer <token>"),
      401
    );
  }

  try {
    const decodedToken = await verifyIdToken(token);

    if (isAnonymousUser(decodedToken)) {
      return c.json(
        errorResponse("Anonymous users cannot access this resource"),
        403
      );
    }

    const userId = decodedToken.uid;
    const userEmail = decodedToken.email ?? null;

    c.set("firebaseUser", decodedToken);
    c.set("userId", userId);
    c.set("userEmail", userEmail);
    c.set("siteAdmin", isSiteAdmin(userEmail));
    c.set("authMethod", "firebase");

    // Ensure user exists in database (fire-and-forget)
    ensureUserExists(userId, userEmail).catch(err =>
      console.error("Failed to ensure user exists:", err)
    );

    await next();
  } catch {
    return c.json(errorResponse("Invalid or expired Firebase token"), 401);
  }
}
