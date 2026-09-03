/**
 * @fileoverview ShapeRouter API entry point
 * @description Hono app setup with CORS, logging, health check, and route mounting.
 * Initializes the database on startup and exports the Bun server configuration.
 */

import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { bodyLimit } from "hono/body-limit";
import { initDatabase, db } from "./db";
import routes from "./routes";
import { successResponse, errorResponse } from "@sudobility/shaperouter_types";
import { getEnv } from "./lib/env-helper";
import { sql } from "drizzle-orm";

const app = new Hono();

// Middleware
app.use("*", logger());
app.use("*", cors());

// Body size limit: 50MB to accommodate base64-encoded media payloads
app.use(
  "*",
  bodyLimit({
    maxSize: 50 * 1024 * 1024, // 50 MB
    onError: c => {
      return c.json(
        errorResponse("Request body too large. Maximum size is 50MB."),
        413
      );
    },
  })
);

// Health check
app.get("/", c => {
  return c.json(
    successResponse({
      name: "ShapeRouter API",
      version: "1.0.0",
      status: "healthy",
    })
  );
});

// Health endpoint (public, no auth) - basic liveness check
app.get("/health", c => {
  return c.json(
    successResponse({
      status: "healthy",
    })
  );
});

// Readiness endpoint (public, no auth) - verifies database connectivity
app.get("/health/ready", async c => {
  try {
    const result = await db.execute(sql`SELECT 1 as ok`);
    if (result.length > 0) {
      return c.json(
        successResponse({
          status: "ready",
          database: "connected",
        })
      );
    }
    return c.json(errorResponse("Database check returned no rows"), 503);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("Health check failed:", message);
    return c.json(errorResponse(`Database not ready: ${message}`), 503);
  }
});

// API routes
app.route("/api/v1", routes);

// Initialize database and start server
const port = parseInt(getEnv("PORT", "3000")!);

initDatabase()
  .then(() => {
    console.log(`ShapeRouter API running on http://localhost:${port}`);
  })
  .catch(err => {
    console.error("Failed to initialize database:", err);
    process.exit(1);
  });

export default {
  port,
  fetch: app.fetch,
};

// Export app for testing
export { app };
