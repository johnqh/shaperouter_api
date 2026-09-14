/**
 * @fileoverview The TCP peer address of a request
 */

import type { Context } from "hono";
import { getConnInfo } from "hono/bun";

/**
 * Read the peer address off the connection.
 *
 * Returns null when the server is not reachable from the context -- which is
 * the case under the test harness, where no Bun server exists.
 */
export function readPeerAddress(c: Context): string | null {
  try {
    return getConnInfo(c).remote.address ?? null;
  } catch {
    return null;
  }
}
