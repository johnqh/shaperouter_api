# ShapeRouter API - Improvement Plans

Prioritized improvement suggestions for the ShapeRouter API codebase.

## Priority 1: Code Quality and DRY

### 1.1 Extract Shared `getEntityWithPermission()` Helper ✅

**Files affected**: `src/routes/keys.ts`, `src/routes/endpoints.ts`, `src/routes/projects.ts`, `src/routes/storage.ts`

The `getEntityWithPermission()` function was duplicated across 4 route files. Extracted to `src/lib/entity-helpers.ts` with a shared `EntityPermissionResult` type and `getPermissionErrorStatus()` helper.

### 1.2 Extract Shared Entity Helper Configuration ✅

**Files affected**: `src/routes/keys.ts`, `src/routes/endpoints.ts`, `src/routes/projects.ts`, `src/routes/storage.ts`, `src/routes/entities.ts`, `src/routes/invitations.ts`

The `InvitationHelperConfig` and `createEntityHelpers()` setup was duplicated in 6 route files. Extracted to `src/lib/entity-helpers.ts` as a singleton `entityHelpers` export.

### 1.3 Consolidate Error Response Patterns ✅

**Files affected**: All route files

Standardized all routes to use `errorResponse()` / `successResponse()` from `@sudobility/shaperouter_types`. The `entities.ts` and `invitations.ts` routes previously used raw `{ success: false, error: ... }` objects.

## Priority 2: Security Improvements

### 2.1 Add Rate Limiting to Public Provider Routes

**Files affected**: `src/routes/providers.ts`, `src/routes/index.ts`

The `/providers` routes are public with no rate limiting. While they only serve static data, they could be abused for DoS. Add basic IP-based rate limiting.

### 2.2 Validate Entity Membership in Analytics ✅

**Files affected**: `src/routes/analytics.ts`, `src/routes/ratelimits.ts`

The `getEntityIdForAnalytics` and `getEntityIdForRateLimits` functions now filter by `is_active` when checking entity membership. Inactive members can no longer access analytics or rate limit data.

### 2.3 Add Request Body Size Limits ✅

**Files affected**: `src/index.ts`

Added Hono `bodyLimit` middleware with a 50MB limit to accommodate base64-encoded media payloads while preventing abuse from excessively large requests. Returns HTTP 413 with a descriptive error message.

## Priority 3: Architecture Improvements

### 3.1 Implement Vertex AI SDK for Imagen/Veo

**Files affected**: `src/services/llm/gemini.ts`

Imagen and Veo model support is currently stubbed out. Implementing the Vertex AI SDK would enable image and video generation.

### 3.2 Add URL Media Output with Cloud Storage Upload

**Files affected**: `src/services/llm/openai.ts`, `src/lib/storage-utils.ts`

The OpenAI provider logs a warning for URL output format but falls back to base64. Implement actual upload to user storage (GCS/S3) when `outputMediaFormat === "url"`.

### 3.3 Add Streaming Support

**Files affected**: `src/routes/ai.ts`, `src/services/llm/*.ts`

All LLM calls are currently non-streaming (`stream: false`). Adding SSE streaming would improve perceived latency for large responses.

### 3.4 Add Webhook Support for Async Processing

**Files affected**: New file needed

For long-running requests (especially with Whisper + extraction), add webhook callback support so clients do not need to maintain long HTTP connections.

## Priority 4: Testing

### 4.1 Add Unit Tests for Media Utilities ✅

**Files affected**: `tests/unit/` (new files)

Added comprehensive unit tests for all media utility modules:
- `tests/unit/media-constants.test.ts` -- MIME type allowlists, size limits, regex patterns, validation helpers, provider audio formats
- `tests/unit/media-utils.test.ts` -- Data URL parsing, provider URL parsing, SSRF prevention, media extraction from input
- `tests/unit/media-conversion.test.ts` -- Format detection, conversion triggers, passthrough for supported formats
- `tests/unit/capability-validator.test.ts` -- Whisper validation, generative model detection, capability checks, provider-specific validation

### 4.2 Add Unit Tests for Prompt Builder Provider Configs ✅

**Files affected**: `tests/unit/prompt-builder.test.ts`

The existing test file already covers `getProviderPromptConfig`, `buildSystemPromptForProvider`, and `buildPromptsForProvider` with tests for all providers, provider-specific configurations, and additional instructions.

### 4.3 Add Integration Tests for Entity Routes

**Files affected**: `tests/` (new files)

No integration tests exist for entity, invitation, storage, ratelimit, settings, or user routes.

## Priority 5: Performance

### 5.1 Add Database Connection Pooling Configuration

**Files affected**: `src/db/index.ts`

The PostgreSQL connection is created with default settings. Configure connection pool size, idle timeout, and max lifetime for production workloads.

### 5.2 Cache Provider/Model Catalog ✅

**Files affected**: `src/routes/providers.ts`

Added `Cache-Control: public, max-age=3600, s-maxage=3600` headers to all three provider routes (`GET /providers`, `GET /providers/:provider`, `GET /providers/:provider/models`). The 1-hour TTL reduces redundant requests from the frontend while ensuring model catalog updates propagate within a reasonable time.

### 5.3 Optimize Analytics Queries

**Files affected**: `src/routes/analytics.ts`

Analytics queries join multiple tables and aggregate large result sets. Consider:
- Adding a materialized view or summary table for common queries
- Adding database indexes on `usage_analytics.timestamp`
- Paginating results for large date ranges

## Priority 6: Developer Experience

### 6.1 Add OpenAPI/Swagger Documentation

**Files affected**: New file or Hono integration

Generate OpenAPI spec from Zod schemas and route definitions. Hono has `@hono/zod-openapi` for this. Would enable auto-generated API documentation and client SDKs.

### 6.2 Add Structured Logging

**Files affected**: All files using `console.log`/`console.error`

Replace `console.error` calls with a structured logger (e.g., pino) that includes request IDs, timestamps, and context for production debugging.

### 6.3 Add Health Check with Database Connectivity ✅

**Files affected**: `src/index.ts`

Added `/health/ready` endpoint that executes a `SELECT 1` query against the database. Returns HTTP 200 with `{ status: "ready", database: "connected" }` on success, or HTTP 503 with error details on failure. The existing `/health` endpoint remains as a lightweight liveness probe.

### 6.4 Add Verify Script ✅

**Files affected**: `package.json`

Added `bun run verify` script that runs `typecheck + lint + unit tests` in sequence. Documented in CLAUDE.md under Pre-Commit Checklist.

## Priority 7: Observability

### 7.1 Add Request Tracing

**Files affected**: `src/index.ts`, `src/middleware/`

Add request ID middleware that generates and propagates trace IDs through the request lifecycle. Include in all log messages and error responses.

### 7.2 Add Metrics Collection

**Files affected**: New middleware

Track key metrics: request count by route, latency percentiles, LLM provider response times, error rates by provider, rate limit hit rates. Export via Prometheus or OpenTelemetry.

### 7.3 Add Cost Tracking Dashboard Data

**Files affected**: `src/routes/analytics.ts`

The analytics endpoint returns aggregate cost data, but there is no breakdown by provider, model, or time period. Add richer cost analytics endpoints for dashboard visualization.
