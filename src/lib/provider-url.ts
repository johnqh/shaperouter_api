/**
 * @fileoverview Client IP resolution and provider URL host rewriting
 * @description Supports the provider IP sync route, which points an entity's
 * self-hosted LM Studio providers at whatever address the caller is currently
 * reaching the API from -- dynamic DNS, without the DNS.
 *
 * Kept free of Hono and the database so the address parsing, URL surgery, and
 * sync planning -- which is where the sharp edges are -- can be tested directly.
 */

import type {
  ProviderIpSyncSkipped,
  ProviderIpSyncUnchanged,
  ProviderIpSyncUpdated,
} from "@sudobility/shaperouter_types";

/** IPv4 dotted quad, each octet 0-255. */
const IPV4_RE =
  /^(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}$/;

/** A single IPv6 group: one to four hex digits. */
const IPV6_GROUP_RE = /^[0-9a-f]{1,4}$/i;

/** Is this an IPv4 literal? */
export function isIpv4(value: string): boolean {
  return IPV4_RE.test(value);
}

/**
 * Count the groups on one side of a `::`, or null if the side is malformed.
 *
 * An embedded IPv4 tail (`::ffff:1.2.3.4`) is only legal as the final group and
 * occupies two of the eight, which is why this returns a count rather than a
 * boolean.
 */
function countIpv6Groups(side: string): number | null {
  if (side === "") return 0;

  const groups = side.split(":");
  let count = 0;

  for (let i = 0; i < groups.length; i++) {
    const group = groups[i]!;
    if (group === "") return null; // a stray colon, e.g. "a:" or ":a"

    if (group.includes(".")) {
      // A dotted quad is only an address here in the final position.
      if (i !== groups.length - 1 || !isIpv4(group)) return null;
      count += 2;
      continue;
    }

    if (!IPV6_GROUP_RE.test(group)) return null;
    count += 1;
  }

  return count;
}

/**
 * Is this an IPv6 literal?
 *
 * Parsed rather than pattern-matched. The regex this replaced accepted `":"`,
 * `"a:"`, and `"1:2"` as valid, which meant a malformed forwarded header could
 * be treated as a routable client address and written into a provider URL.
 *
 * A zone index (`fe80::1%eth0`) is rejected: it is a valid address but cannot be
 * used as a URL host, which is the only thing this library does with one.
 */
export function isIpv6(value: string): boolean {
  if (!value.includes(":") || value.includes("%")) return false;

  const sides = value.split("::");
  if (sides.length > 2) return false; // "::" may appear at most once

  const head = countIpv6Groups(sides[0]!);
  if (head === null) return false;

  // Uncompressed: all eight groups must be spelled out.
  if (sides.length === 1) return head === 8;

  const tail = countIpv6Groups(sides[1]!);
  if (tail === null) return false;

  // "::" must stand in for at least one omitted group.
  return head + tail <= 7;
}

/** Is this any IP literal, as opposed to a DNS hostname? */
export function isIpLiteral(value: string): boolean {
  return isIpv4(value) || isIpv6(value);
}

/**
 * Normalize a peer address reported by the server.
 *
 * Bun reports an IPv4 peer as an IPv4-mapped IPv6 address
 * (`::ffff:142.254.88.21`), which is the same address wearing a hat. Unwrap it
 * so what gets written into a provider URL is the address a person would type.
 *
 * @param raw - The address from `getConnInfo(c).remote.address`
 * @returns A bare IP literal, or null when there is nothing usable
 */
export function normalizeClientIp(
  raw: string | undefined | null
): string | null {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  if (trimmed.length === 0) return null;

  const mapped = /^::ffff:(.+)$/i.exec(trimmed);
  const candidate = mapped?.[1] ?? trimmed;

  return isIpLiteral(candidate) ? candidate : null;
}

/**
 * Is this an address worth writing into a provider URL?
 *
 * A loopback, private, or link-local peer means the request did not come from
 * the internet -- a local test, a sidecar, or a proxy on the same host. Writing
 * one of those would quietly break every endpoint using the provider, so the
 * sync refuses rather than "succeeding" with an address that resolves nowhere
 * useful from the API's perspective.
 */
export function isRoutableClientIp(ip: string): boolean {
  if (isIpv4(ip)) {
    const [a, b] = ip.split(".").map(Number) as [number, number];
    if (a === 0 || a === 127) return false; // unspecified, loopback
    if (a === 10) return false; // 10/8
    if (a === 172 && b >= 16 && b <= 31) return false; // 172.16/12
    if (a === 192 && b === 168) return false; // 192.168/16
    if (a === 169 && b === 254) return false; // 169.254/16 link-local
    return true;
  }

  const lower = ip.toLowerCase();
  if (lower === "::" || lower === "::1") return false; // unspecified, loopback
  if (/^f[cd][0-9a-f]{2}:/.test(lower)) return false; // fc00::/7 unique-local
  if (/^fe[89ab][0-9a-f]:/.test(lower)) return false; // fe80::/10 link-local
  return true;
}

/**
 * Headers that may carry a client address, and are safe to echo back.
 *
 * An explicit allowlist, never "every header": the request also carries the
 * caller's `X-API-Key`, and a diagnostic that reflected the whole header set
 * back would hand a credential to anything reading the response or the logs.
 */
export const FORWARDING_HEADERS = [
  "x-forwarded-for",
  "x-real-ip",
  "cf-connecting-ip",
  "true-client-ip",
  "x-client-ip",
  "x-cluster-client-ip",
  "fastly-client-ip",
  "x-original-forwarded-for",
  "forwarded",
  "x-forwarded-host",
  "x-forwarded-proto",
  "cf-ray",
  "cf-ipcountry",
  "via",
] as const;

/**
 * Gather the forwarding-related headers actually present on a request.
 *
 * For diagnosing what a deployment's proxies really send, which is the only
 * reliable way to know which header holds the client address -- guessing it
 * from an infrastructure repo is how a Cloudflare edge IP ends up written into
 * a provider URL.
 *
 * @param getHeader - Case-insensitive header lookup
 * @returns Only the allowlisted headers that are present
 */
export function collectForwardingHeaders(
  getHeader: (name: string) => string | undefined
): Record<string, string> {
  const found: Record<string, string> = {};
  for (const name of FORWARDING_HEADERS) {
    const value = getHeader(name);
    if (value !== undefined && value !== "") {
      found[name] = value;
    }
  }
  return found;
}

/**
 * Resolve who is really calling, given the connection's peer and its headers.
 *
 * A forwarded header is written by whoever is upstream, so it is only worth
 * anything once we know the hop that sent it is our own infrastructure. The
 * peer address settles that: an attacker on the internet cannot make their TCP
 * connection appear to originate from a private address.
 *
 * - **Public peer** -- the client reached us directly. Use the peer and ignore
 *   every header, forged or not.
 * - **Private or loopback peer** -- we are behind our own reverse proxy
 *   (Traefik on the Docker network, in this deployment). Read the client from
 *   the forwarded headers it set.
 *
 * On the trusted branch the headers are consulted in a deliberate order:
 *
 * 1. `CF-Connecting-IP` / `True-Client-IP` -- a CDN's own client header, which
 *    it overwrites on every request and a client therefore cannot forge.
 * 2. `X-Forwarded-For`, read **right to left**, taking the first public entry.
 *    Each proxy appends the address that connected to it, so the right-hand
 *    entries were written by trusted infrastructure while the leftmost may have
 *    come from the client.
 * 3. `X-Real-Ip`.
 *
 * The CDN header must come first, and this is not theoretical. On
 * api.shaperouter.com the chain is Cloudflare -> Traefik -> API, and Traefik has
 * no `forwardedHeaders.trustedIPs`, so it *discards* Cloudflare's
 * `X-Forwarded-For` and rewrites it with the Cloudflare edge address. That edge
 * address is public, so every "is this routable" check passes and it looks like
 * a perfectly good client IP -- it just is not one, and it changes from request
 * to request. `CF-Connecting-IP` is the only header in that chain carrying the
 * real client.
 *
 * @param peerAddress - The connection's peer, from `getConnInfo(c).remote.address`
 * @param getHeader - Case-insensitive header lookup
 * @returns The caller's IP, or null when it cannot be established
 */
export function resolveCallerIp(
  peerAddress: string | null | undefined,
  getHeader: (name: string) => string | undefined
): string | null {
  const peer = normalizeClientIp(peerAddress);
  if (!peer) return null;

  // A public peer is the client itself. Headers add nothing and can only lie.
  if (isRoutableClientIp(peer)) {
    return peer;
  }

  // Private peer: a hop inside our own network, so its headers are worth reading.

  // A CDN's client header first: it is overwritten upstream on every request,
  // whereas X-Forwarded-For may have been rewritten by an intermediate proxy
  // that does not trust the CDN.
  for (const name of ["cf-connecting-ip", "true-client-ip"]) {
    const cdnClient = normalizeClientIp(getHeader(name));
    if (cdnClient && isRoutableClientIp(cdnClient)) {
      return cdnClient;
    }
  }

  const forwardedFor = getHeader("x-forwarded-for");
  if (forwardedFor) {
    const hops = forwardedFor.split(",");
    for (let i = hops.length - 1; i >= 0; i--) {
      const candidate = normalizeClientIp(hops[i]!.trim());
      if (candidate && isRoutableClientIp(candidate)) {
        return candidate;
      }
    }
  }

  const realIp = normalizeClientIp(getHeader("x-real-ip"));
  if (realIp && isRoutableClientIp(realIp)) {
    return realIp;
  }

  return null;
}

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
