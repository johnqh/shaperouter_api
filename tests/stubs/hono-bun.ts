/**
 * Test-time stand-in for `hono/bun`.
 *
 * `src/routes/provider-sync.ts` reads the peer address via `getConnInfo` from
 * `hono/bun`, which only resolves under the Bun runtime. Vitest runs under
 * Node, so the real module cannot be imported and the suite fails at collection.
 *
 * This mirrors the real adapter rather than returning a fixed address: Bun's
 * `getConnInfo` reads the peer from the server object Hono receives as `env`,
 * and the suite supplies that object itself (`serverReporting(peerIp)`), so
 * each test controls the address it expects. Returning a constant here would
 * silently override the suite's own fixture.
 *
 * Production code is untouched; this alias applies only to the vitest configs.
 */
import type { Context } from "hono";

interface BunSocketAddress {
  address: string;
  family: string;
  port: number;
}

interface BunServerLike {
  requestIP?: (req: Request) => BunSocketAddress | null;
}

export function getConnInfo(c: Context): {
  remote: { address?: string; port?: number; addressType?: string };
} {
  const server = c.env as BunServerLike | undefined;
  const info = server?.requestIP?.(c.req.raw);
  if (!info) {
    // Matches the real adapter: callers wrap this in try/catch and degrade.
    throw new TypeError("connection info is not available");
  }
  return {
    remote: {
      address: info.address,
      port: info.port,
      addressType: info.family,
    },
  };
}
