/**
 * @fileoverview Route aggregator
 * @description Registers all API routes under /api/v1.
 * Public routes (ai, providers) are registered before admin routes
 * to avoid wildcard middleware interception.
 */

import { Hono } from "hono";
import { firebaseAuthMiddleware } from "../middleware/firebaseAuth";
import keysRouter from "./keys";
import projectsRouter from "./projects";
import endpointsRouter from "./endpoints";
import analyticsRouter from "./analytics";
import settingsRouter from "./settings";
import aiRouter from "./ai";
import ratelimitsRouter from "./ratelimits";
import entitiesRouter from "./entities";
import invitationsRouter from "./invitations";
import providersRouter from "./providers";
import storageRouter from "./storage";
import usersRouter from "./users";
import userApiKeysRouter from "./user-api-keys";
import entityApiKeysRouter from "./entity-api-keys";
import providerSyncRouter from "./provider-sync";

const routes = new Hono();

// Public routes (no auth required) - MUST be registered before admin routes
// to avoid wildcard middleware interception
routes.route("/ai", aiRouter);
routes.route("/providers", providersRouter);

// Admin routes (Firebase auth required)
const adminRoutes = new Hono();
adminRoutes.use("*", firebaseAuthMiddleware);
// Registered before "/entities" so the literal "self" is matched here rather
// than being taken for an entity slug by entitiesRouter's "/:entitySlug".
adminRoutes.route("/entities/self/providers", providerSyncRouter);
adminRoutes.route("/entities/:entitySlug/keys", keysRouter);
adminRoutes.route("/entities/:entitySlug/api-keys", entityApiKeysRouter);
adminRoutes.route("/entities/:entitySlug/storage", storageRouter);
adminRoutes.route("/entities/:entitySlug/projects", projectsRouter);
adminRoutes.route(
  "/entities/:entitySlug/projects/:projectId/endpoints",
  endpointsRouter
);
adminRoutes.route("/entities/:entitySlug/analytics", analyticsRouter);
adminRoutes.route("/ratelimits/:rateLimitUserId", ratelimitsRouter);
adminRoutes.route("/users/:userId/settings", settingsRouter);
adminRoutes.route("/users/:userId/api-keys", userApiKeysRouter);
adminRoutes.route("/entities", entitiesRouter);
adminRoutes.route("/invitations", invitationsRouter);
adminRoutes.route("/users", usersRouter);
routes.route("/", adminRoutes);

export default routes;

// Also export individual routers for testing
export {
  keysRouter,
  projectsRouter,
  endpointsRouter,
  analyticsRouter,
  settingsRouter,
  aiRouter,
  ratelimitsRouter,
  entitiesRouter,
  invitationsRouter,
  providersRouter,
  storageRouter,
  usersRouter,
  userApiKeysRouter,
  entityApiKeysRouter,
  providerSyncRouter,
};
