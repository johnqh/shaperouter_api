/**
 * @fileoverview ShapeRouter API entry point
 * @description The server itself -- middleware, health checks, Bun options --
 * comes from @sudobility/shapeshyft_service; this names the product and hands
 * it ShapeRouter's routes and database.
 */

import { createApiServer } from "@sudobility/shapeshyft_service";
import { db, initDatabase } from "./db";
import { routes } from "./service";
import { env } from "./lib/env-helper";

const server = createApiServer({
  name: "ShapeRouter API",
  routes,
  db,
  initDatabase,
  port: env.getNumber("PORT") ?? 3000,
});

void server.start();

export default server.bunServer;

// Export app for testing
export const app = server.app;
