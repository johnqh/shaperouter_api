/**
 * @fileoverview ShapeRouter's instance of @sudobility/shapeshyft_service
 * @description Everything product-specific is decided here: key prefixes,
 * where provider credentials come from (per-entity LLM keys), and the routes
 * only ShapeRouter has.
 */

import type { Hono } from "hono";
import { createShapeshyftService } from "@sudobility/shapeshyft_service";
import { db } from "./db";
import { serviceTables } from "./db/schema";
import { encryption } from "./lib/encryption";
import { getEnv } from "./lib/env-helper";
import { readPeerAddress } from "./lib/peer-address";
import {
  getUserInfo,
  isAnonymousUser,
  isSiteAdmin,
  verifyIdToken,
} from "./services/firebase";
import { sendInvitationEmail } from "./services/email";
import { createLlmKeyCredentialResolver } from "./credentials/llm-key-resolver";
import { endpointBinding } from "./schemas/endpoint-binding";
import { createKeysRouter } from "./routes/keys";
import providerSyncRouter from "./routes/provider-sync";

function optionalNumber(value: string | undefined): number | undefined {
  return value ? Number(value) : undefined;
}

export const service = createShapeshyftService({
  db: db as any, // drizzle instances can differ under bun link
  tables: serviceTables,
  keyPrefixes: { user: "shroute_", entity: "shrouteent" },
  encryption,
  auth: { verifyIdToken, isSiteAdmin, isAnonymousUser, getUserInfo },
  email: { sendInvitationEmail },
  credentials: createLlmKeyCredentialResolver({
    db,
    encryption,
    lmStudioTimeoutMs: optionalNumber(getEnv("LM_STUDIO_TIMEOUT_MS")),
  }),
  getPeerAddress: readPeerAddress,
  endpointBinding,
  revenueCatApiKey: getEnv("REVENUECAT_API_KEY"),
});

/**
 * ShapeRouter-only admin routes. Mounted before the shared admin routes so the
 * literal "self" is matched here rather than taken as an entity slug.
 */
export function mountShaperouterRoutes(admin: Hono): void {
  admin.route("/entities/self/providers", providerSyncRouter);
  admin.route("/entities/:entitySlug/keys", createKeysRouter(service.ctx));
}

export const routes = service.buildRoutes({
  mountAdmin: mountShaperouterRoutes,
});
