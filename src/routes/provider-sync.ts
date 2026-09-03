/**
 * @fileoverview Provider IP sync route
 * @description Points an entity's self-hosted LM Studio providers at whatever
 * address the caller is currently reaching the API from.
 *
 * This exists for a provider running on a home connection with a dynamic IP:
 * the machine calls this endpoint (from a cron job, or on boot) and its stored
 * provider URLs follow it, without anyone editing a dashboard.
 *
 * The address comes from the TCP peer whenever the client reached the API
 * directly. A forwarded header is honoured only when the peer is itself a
 * private address, which means the request arrived through our own reverse
 * proxy -- an attacker on the internet cannot make their connection appear to
 * come from inside the Docker network. See `resolveCallerIp`.
 */

import { Hono, type Context } from "hono";
import { getConnInfo } from "hono/bun";
import { and, eq } from "drizzle-orm";
import { db, entities, llmApiKeys } from "../db";
import {
  successResponse,
  errorResponse,
  type ClientIpDiagnostics,
  type ProviderIpSyncResponse,
} from "@sudobility/shaperouter_types";
import {
  collectForwardingHeaders,
  isRoutableClientIp,
  normalizeClientIp,
  planProviderSync,
  resolveCallerIp,
} from "../lib/provider-url";

const providerSyncRouter = new Hono();

/** The only provider type with a caller-supplied URL to keep current. */
const SELF_HOSTED_PROVIDER = "lm_studio" as const;

/**
 * Read the peer address off the connection.
 *
 * Returns null when the server is not reachable from the context -- which is
 * the case under the test harness, where no Bun server exists.
 */
function readPeerAddress(c: Context): string | null {
  try {
    return getConnInfo(c).remote.address ?? null;
  } catch {
    return null;
  }
}

/**
 * Reject anything that did not authenticate with an entity API key.
 *
 * @returns An error response to return, or null when the caller may proceed
 */
function requireEntityKey(c: Context) {
  if (c.get("authMethod") !== "entity_api_key") {
    return c.json(
      errorResponse(
        "This route requires an entity API key (X-API-Key: shrouteent_...)"
      ),
      403
    );
  }
  if (!c.get("entityApiKeyEntityId")) {
    return c.json(errorResponse("API key is not bound to an entity"), 403);
  }
  return null;
}

/**
 * GET /entities/self/providers/client-ip
 *
 * Report what the API sees about the caller's address, without changing
 * anything. Which header carries the real client IP depends on the deployment's
 * proxy chain -- Cloudflare in front of Traefik behaves differently from Traefik
 * alone -- and reading it here is how you find out rather than guess.
 *
 * Only allowlisted forwarding headers are echoed; the caller's API key is not.
 */
providerSyncRouter.get("/client-ip", async c => {
  const forbidden = requireEntityKey(c);
  if (forbidden) return forbidden;

  const peerRaw = readPeerAddress(c);
  const peer = normalizeClientIp(peerRaw);

  const diagnostics: ClientIpDiagnostics = {
    peer_raw: peerRaw,
    peer,
    peer_is_public: peer !== null && isRoutableClientIp(peer),
    resolved_ip: resolveCallerIp(peerRaw, name => c.req.header(name)),
    forwarding_headers: collectForwardingHeaders(name => c.req.header(name)),
  };

  return c.json(successResponse<ClientIpDiagnostics>(diagnostics));
});

/**
 * POST /entities/self/providers/sync-ip
 *
 * Requires an entity API key: the entity comes from the key, and the address
 * comes from the connection, so the caller sends no body and needs to know
 * nothing about itself.
 */
providerSyncRouter.post("/sync-ip", async c => {
  // 1. Entity API key only. A Firebase session's peer address is the browser's,
  // which has nothing to do with where the provider is running.
  const forbidden = requireEntityKey(c);
  if (forbidden) return forbidden;

  const entityId = c.get("entityApiKeyEntityId");

  // 2. The caller's address: the peer when they reached us directly, or what
  // our own proxy forwarded when they did not.
  // resolveCallerIp only ever yields a public address -- a loopback, private, or
  // link-local result is reported as "could not determine" rather than being
  // written into a provider URL, where it would resolve nowhere useful.
  const clientIp = resolveCallerIp(readPeerAddress(c), name =>
    c.req.header(name)
  );
  if (!clientIp) {
    return c.json(
      errorResponse(
        "Could not determine the caller's IP address. If this API sits behind " +
          "a reverse proxy, the proxy must set X-Forwarded-For or X-Real-Ip."
      ),
      400
    );
  }

  try {
    // 3. The entity itself must still exist. Authorisation is inherent -- the
    // key is bound to this entity and only its rows are ever selected -- but a
    // key outliving its entity should fail loudly rather than sync nothing.
    const [entity] = await db
      .select({ id: entities.id })
      .from(entities)
      .where(eq(entities.id, entityId))
      .limit(1);

    if (!entity) {
      return c.json(errorResponse("Entity not found"), 404);
    }

    // 4. Every self-hosted provider the entity owns, active or not -- an
    // inactive provider still needs a correct URL for when it is re-enabled.
    const providers = await db
      .select()
      .from(llmApiKeys)
      .where(
        and(
          eq(llmApiKeys.entity_id, entityId),
          eq(llmApiKeys.provider, SELF_HOSTED_PROVIDER)
        )
      );

    // 5. Decide everything before writing anything, then apply the whole plan
    // in one transaction. A failure partway through would otherwise leave some
    // providers pointing at the new address and some at the old, with the
    // caller getting a 500 and no way to tell which.
    const plan = planProviderSync(providers, clientIp);

    if (plan.updated.length > 0) {
      await db.transaction(async tx => {
        for (const change of plan.updated) {
          await tx
            .update(llmApiKeys)
            .set({ endpoint_url: change.to, updated_at: new Date() })
            .where(eq(llmApiKeys.uuid, change.uuid));
        }
      });
    }

    const { updated, unchanged, skipped } = plan;

    console.log("[provider-sync] Synced providers to caller IP:", {
      entityId,
      clientIp,
      updated: updated.length,
      unchanged: unchanged.length,
      skipped: skipped.length,
    });

    const response: ProviderIpSyncResponse = {
      client_ip: clientIp,
      updated,
      unchanged,
      skipped,
    };
    return c.json(successResponse<ProviderIpSyncResponse>(response));
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "Internal server error";
    console.error("Error syncing provider IPs:", message);
    return c.json(errorResponse(message), 500);
  }
});

export default providerSyncRouter;
