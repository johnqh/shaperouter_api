/**
 * @fileoverview Provider URL host rewriting and sync planning
 * @description Supports the provider IP sync route, which points an entity's
 * self-hosted LM Studio providers at whatever address the caller is currently
 * reaching the API from -- dynamic DNS, without the DNS.
 *
 * Client IP resolution lives in @sudobility/shapeshyft_service (the endpoint IP
 * allowlist uses it too) and is re-exported here for the sync route.
 *
 * Kept free of Hono and the database so the URL surgery and sync planning --
 * which is where the sharp edges are -- can be tested directly.
 */

import type {
  ProviderIpSyncSkipped,
  ProviderIpSyncUnchanged,
  ProviderIpSyncUpdated,
} from "@sudobility/shaperouter_types";

import {
  collectForwardingHeaders,
  FORWARDING_HEADERS,
  isIpLiteral,
  isIpv4,
  isIpv6,
  isRoutableClientIp,
  normalizeClientIp,
  resolveCallerIp,
} from "@sudobility/shapeshyft_service";

export {
  collectForwardingHeaders,
  FORWARDING_HEADERS,
  isIpLiteral,
  isIpv4,
  isIpv6,
  isRoutableClientIp,
  normalizeClientIp,
  resolveCallerIp,
};

/** Outcome of rewriting one provider URL. */
export type UrlRewrite =
  | { status: "updated"; url: string }
  | { status: "unchanged" }
  | { status: "skipped"; reason: string };

/** Wrap an IPv6 literal in brackets for use in a URL authority. */
function toUrlHost(ip: string): string {
  return isIpv6(ip) ? `[${ip}]` : ip;
}

/**
 * Point a provider URL at a new IP, changing nothing else.
 *
 * Deliberately does *not* round-trip through `URL.toString()`. That normalizes
 * as it serializes -- dropping a default port, appending a slash to an empty
 * path -- and this value is a stored configuration a human wrote. Only the host
 * substring is replaced; scheme, credentials, port, path, query and fragment
 * come through byte for byte.
 *
 * @param rawUrl - The provider's current `endpoint_url`
 * @param ip - The caller's normalized IP
 * @returns What happened, ready to drop into the response's buckets
 */
export function rewriteUrlHost(rawUrl: string, ip: string): UrlRewrite {
  if (typeof rawUrl !== "string" || rawUrl.trim().length === 0) {
    return { status: "skipped", reason: "endpoint_url is empty" };
  }

  const schemeEnd = rawUrl.indexOf("://");
  if (schemeEnd === -1) {
    return { status: "skipped", reason: "endpoint_url is not a valid URL" };
  }

  const authorityStart = schemeEnd + 3;
  // The authority runs to the first delimiter that starts the path/query/fragment.
  let authorityEnd = rawUrl.length;
  for (let i = authorityStart; i < rawUrl.length; i++) {
    const ch = rawUrl[i]!;
    if (ch === "/" || ch === "?" || ch === "#") {
      authorityEnd = i;
      break;
    }
  }

  const authority = rawUrl.slice(authorityStart, authorityEnd);
  if (authority.length === 0) {
    return { status: "skipped", reason: "endpoint_url is not a valid URL" };
  }

  // Credentials, if any, end at the last "@" -- a password may itself contain one.
  const atIndex = authority.lastIndexOf("@");
  const userinfo = atIndex === -1 ? "" : authority.slice(0, atIndex + 1);
  const hostPort = authority.slice(atIndex + 1);

  let host: string;
  let port: string;
  if (hostPort.startsWith("[")) {
    const close = hostPort.indexOf("]");
    if (close === -1) {
      return { status: "skipped", reason: "endpoint_url is not a valid URL" };
    }
    host = hostPort.slice(1, close);
    port = hostPort.slice(close + 1);
  } else {
    const colon = hostPort.lastIndexOf(":");
    host = colon === -1 ? hostPort : hostPort.slice(0, colon);
    port = colon === -1 ? "" : hostPort.slice(colon);
  }

  if (host.length === 0) {
    return { status: "skipped", reason: "endpoint_url is not a valid URL" };
  }

  // A DNS name already follows a moving IP on its own; replacing it with a bare
  // address would throw that away.
  if (!isIpLiteral(host)) {
    return {
      status: "skipped",
      reason: "host is a hostname, not an IP address",
    };
  }

  if (host === ip) {
    return { status: "unchanged" };
  }

  const rewritten =
    rawUrl.slice(0, authorityStart) +
    userinfo +
    toUrlHost(ip) +
    port +
    rawUrl.slice(authorityEnd);

  return { status: "updated", url: rewritten };
}

// =============================================================================
// Sync planning
// =============================================================================

/** The provider fields a sync needs; a narrowed `llm_api_keys` row. */
export interface SyncableProvider {
  uuid: string;
  key_name: string;
  endpoint_url: string | null;
}

/**
 * What a sync would do, decided before anything is written.
 *
 * `updated` doubles as the write list, so the route's database work is a plain
 * loop over it inside one transaction -- no branching, nothing to get wrong
 * halfway through.
 */
export interface ProviderSyncPlan {
  updated: ProviderIpSyncUpdated[];
  unchanged: ProviderIpSyncUnchanged[];
  skipped: ProviderIpSyncSkipped[];
}

/**
 * Decide what each provider's URL should become, without touching anything.
 *
 * Separating the decision from the write keeps the bucketing rules testable
 * without a database, and lets the route apply every change in a single
 * transaction rather than one row at a time.
 *
 * @param providers - The entity's self-hosted providers
 * @param ip - The caller's resolved public address
 * @returns Every provider sorted into exactly one bucket
 */
export function planProviderSync(
  providers: readonly SyncableProvider[],
  ip: string
): ProviderSyncPlan {
  const plan: ProviderSyncPlan = { updated: [], unchanged: [], skipped: [] };

  for (const provider of providers) {
    const { uuid, key_name } = provider;
    const current = provider.endpoint_url;

    if (!current) {
      plan.skipped.push({
        uuid,
        key_name,
        url: null,
        reason: "endpoint_url is not set",
      });
      continue;
    }

    const result = rewriteUrlHost(current, ip);

    if (result.status === "skipped") {
      plan.skipped.push({
        uuid,
        key_name,
        url: current,
        reason: result.reason,
      });
    } else if (result.status === "unchanged") {
      plan.unchanged.push({ uuid, key_name, url: current });
    } else {
      plan.updated.push({ uuid, key_name, from: current, to: result.url });
    }
  }

  return plan;
}
