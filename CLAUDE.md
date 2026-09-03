# ShapeRouter API

> **Git policy — never auto-commit or auto-push.** Leave your work in the working tree.
> Run `git commit`, `git push`, `gh pr create`, or `scripts/push_all.sh` **only when the user
> explicitly asks in that turn**. Approval for an earlier change does not carry forward, and
> finishing a task is not permission to commit it.

Backend API server for ShapeRouter - an LLM structured output platform (v1.0.123).

## Tech Stack

- **Language**: TypeScript (strict mode)
- **Runtime**: Bun
- **Package Manager**: Bun (do not use npm/yarn/pnpm for installing dependencies)
- **Framework**: Hono v4.10
- **Database**: PostgreSQL with Drizzle ORM v0.45
- **Auth**: Firebase Admin SDK (via `@sudobility/auth_service`)
- **LLM Providers**: OpenAI, Anthropic, Google Gemini, Groq, Mistral, Cohere, xAI, DeepSeek, Perplexity, LM Studio
- **Validation**: Zod
- **Encryption**: AES-256-CBC for API keys and storage credentials
- **Image Processing**: Sharp (SVG/TIFF/HEIC/BMP/AVIF to PNG)
- **Email**: Resend (transactional invitation emails)
- **Cloud Storage**: Google Cloud Storage + AWS S3 (user-provided)
- **Testing**: Vitest v4.0

## Project Structure

```
src/
├── index.ts                # Entry point, Hono app setup, health + readiness checks
├── config/
│   └── providers.ts        # LLM provider/model catalog (100 models), capabilities, pricing
├── db/
│   ├── index.ts            # Lazy Proxy-based db connection, initDatabase(), schema migration
│   ├── init.ts             # `bun run db:init` -- runs initDatabase() standalone, then exits
│   ├── schema.ts           # Drizzle schema definitions (13 tables)
│   └── migrate.ts          # One-off data migration script (user_id -> entity_id)
├── routes/
│   ├── index.ts            # Route aggregator (public vs admin split)
│   ├── ai.ts               # Public AI invoke + prompt endpoints (~875 lines)
│   ├── providers.ts        # Public provider/model catalog (1h cache headers)
│   ├── analytics.ts        # Usage analytics with date/project/endpoint filters
│   ├── endpoints.ts        # Endpoint CRUD with ownership verification
│   ├── entities.ts         # Entity CRUD + members + invitations management
│   ├── entity-api-keys.ts  # Entity API key CRUD ("shrouteent_..."), hash-only storage
│   ├── invitations.ts      # User-facing invitation accept/decline (by token)
│   ├── keys.ts             # LLM provider API key CRUD (encrypted)
│   ├── projects.ts         # Project CRUD with auto API key generation
│   ├── provider-sync.ts    # Point self-hosted providers at the caller's IP
│   ├── ratelimits.ts       # Rate limit config + usage history
│   ├── settings.ts         # User settings with org path (upsert)
│   ├── storage.ts          # Entity cloud storage config CRUD (GCS/S3)
│   ├── user-api-keys.ts    # Personal API key CRUD ("shroute_..."), create/reveal
│   └── users.ts            # /users/me, user info, subscription status
├── middleware/
│   ├── firebaseAuth.ts     # Three-credential auth (personal key, entity key, token)
│   ├── rateLimit.ts        # Rate limit config (free/dev/pro/ultra tiers), lazy init
│   └── subscription.ts     # Lazy SubscriptionHelper singleton + testMode reader
├── services/
│   ├── email.ts            # Resend invitation email with HTML template
│   ├── firebase.ts         # Firebase Admin init with cached verifier (5min TTL)
│   └── llm/
│       ├── index.ts        # Provider factory createLLMProvider(), PROVIDER_ENDPOINTS map
│       ├── types.ts        # LLMRequest (discriminated union), LLMResponse, ILLMProvider
│       ├── openai.ts       # OpenAI provider (function calling, Responses API web search)
│       ├── anthropic.ts    # Anthropic provider (tool_use, image base64/URL)
│       ├── gemini.ts       # Gemini provider (responseSchema, Imagen/Veo stubs)
│       ├── groq.ts         # Groq provider (Whisper transcription + extraction pipeline)
│       └── custom.ts       # CustomLLMProvider for LM Studio (multi-format response parsing)
├── schemas/
│   └── index.ts            # All Zod validation schemas
└── lib/
    ├── api-helper.ts       # ApiHelper with prompt(), request(), buildLegacyPrompts()
    ├── api-key.ts           # Project API key generation, encryption, timing-safe validation
    ├── encryption.ts        # AES-256-CBC encrypt/decrypt for API keys
    ├── entity-api-key.ts    # "shrouteent_" prefix + header extraction for entity keys
    ├── entity-helpers.ts    # entityHelpers singleton, EntityActor, getEntityWithPermission()
    ├── env-helper.ts        # .env.local priority env var helper with caching
    ├── prompt-builder.ts    # Schema-to-prompt conversion, provider-specific prompt configs
    ├── provider-url.ts      # Client IP normalization + provider URL host rewriting
    ├── public-project.ts    # Strips key ciphertext + IV from project rows before responding
    ├── storage-utils.ts     # GCS/S3 upload with signed URLs, credential decryption
    ├── user-api-key.ts      # "shroute_" key generation, hashing, header extraction
    ├── user-api-key-cache.ts # 60s hash->owner cache with explicit invalidation
    ├── media-constants.ts   # MIME type allowlists, size limits, provider-specific audio formats
    ├── media-conversion.ts  # SVG/TIFF/HEIC/BMP/AVIF to PNG conversion via sharp
    ├── media-utils.ts       # Media extraction from input data (data URLs, gs:// URLs), SSRF prevention
    └── capability-validator.ts # Model capability validation for multimodal, Whisper validation
tests/
├── ai.test.ts              # Integration: AI inference routes
├── analytics.test.ts       # Integration: Analytics queries
├── endpoints.test.ts       # Integration: Endpoint CRUD
├── keys.test.ts            # Integration: API key management
├── projects.test.ts        # Integration: Project CRUD
├── setup.ts                # Test database setup
├── unit/
│   ├── api-key.test.ts     # Unit: Project API key generation/validation
│   ├── capability-validator.test.ts # Unit: Model capability validation
│   ├── encryption.test.ts  # Unit: AES-256-CBC encryption
│   ├── entity-api-key.test.ts # Unit: Entity API key prefix/extraction
│   ├── media-constants.test.ts # Unit: MIME types, size limits, regex
│   ├── media-conversion.test.ts # Unit: Image format conversion
│   ├── media-utils.test.ts # Unit: Media extraction from input data
│   ├── prompt-builder.test.ts # Unit: Schema-to-prompt conversion
│   ├── public-project.test.ts # Unit: Project row redaction
│   └── user-api-key.test.ts # Unit: Personal API key generation/hashing
└── utils/
    ├── index.ts            # Test utility exports
    ├── mock-auth.ts        # Mock Firebase auth for testing
    ├── test-app.ts         # Test Hono app setup
    └── test-db.ts          # Test database connection
scripts/
├── fix-personal-entity-roles.ts # One-off migration script
└── setup-test-db.sh        # Test database setup script
```

## Commands

```bash
bun run dev          # Start dev server with hot reload (--watch)
bun run start        # Start production server
bun run build        # Build for production (bun build)
bun run start:prod   # Run production build
bun run test         # Run unit tests, Vitest (tests/unit/)
bun run test:watch   # Watch mode for unit tests
bun run test:integration  # Run integration tests (requires test database)
bun run test:setup   # Set up test database
bun run lint         # Run ESLint
bun run typecheck    # TypeScript type check
bun run format       # Format with Prettier
bun run db:init      # Create/migrate schema, tables, indexes, then exit (idempotent)
bun run verify       # Pre-commit: typecheck + lint + unit tests
```

## Database

Uses PostgreSQL with a `shaperouter` schema (not the default `public` schema).

### Tables

| Table | Purpose | Key |
|-------|---------|-----|
| `users` | Firebase UID mapping | `firebase_uid` (PK) |
| `user_settings` | Organization settings | `firebase_uid` (FK, unique) |
| `user_api_keys` | Personal API keys (`shroute_...`) | `firebase_uid` (FK), unique `key_hash` |
| `entities` | Organizations/teams | `id` (UUID PK) |
| `entity_members` | Entity membership roles | `entity_id` + `user_id` |
| `entity_invitations` | Pending team invitations | `entity_id` + `email` |
| `entity_api_keys` | Entity API keys (`shrouteent_...`), hash-only | `entity_id` (FK) |
| `entity_storage_configs` | User cloud storage (GCS/S3) | `entity_id` (unique) |
| `llm_api_keys` | Encrypted LLM provider keys | `entity_id` (FK) |
| `projects` | User projects with API keys | `entity_id` (FK), unique `(entity_id, project_name)` |
| `endpoints` | AI endpoint configurations | `project_id` (FK), unique `(project_id, endpoint_name)` |
| `usage_analytics` | Request tracking per endpoint | `endpoint_id` (FK) |
| `rate_limit_counters` | Rate limit tracking | Per-entity counters |

### Connection Pattern

Database uses a **lazy Proxy-based initialization** (`src/db/index.ts`). The connection is not created at module load time -- it is initialized on first access via a Proxy getter. This avoids requiring `DATABASE_URL` at import time (important for tests and scripts).

## Environment Variables

Required in `.env.local`:

```bash
# Database
DATABASE_URL=postgresql://user:pass@localhost:5432/shaperouter

# Firebase Admin
FIREBASE_PROJECT_ID=your-project-id
FIREBASE_CLIENT_EMAIL=firebase-adminsdk@...
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n..."
SITEADMIN_EMAILS=admin@example.com  # Optional: comma-separated

# Encryption
ENCRYPTION_KEY=64-character-hex-string  # Must be exactly 64 hex chars (32 bytes)

# RevenueCat (rate limiting)
REVENUECAT_API_KEY=sk_...

# Email (optional)
RESEND_API_KEY=re_...
RESEND_SENDER_EMAIL=noreply@shaperouter.com
RESEND_SENDER_NAME=ShapeRouter
APP_URL=https://shaperouter.com

# Server
PORT=3000  # Default: 3000
```

## API Routes

Health routes sit at the root, outside `/api/v1` and outside auth:

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/` | Name/version banner |
| GET | `/health` | Liveness |
| GET | `/health/ready` | Readiness -- runs `SELECT 1` against Postgres, 503 on failure |

Everything else is under `/api/v1/`.

### Public Routes (no Firebase auth)

| Method | Path | Purpose |
|--------|------|---------|
| GET/POST | `/ai/:entitySlug/:projectName/:endpointName` | Execute AI endpoint (project API key auth) |
| GET/POST | `/ai/:entitySlug/:projectName/:endpointName/prompt` | Render the prompt without calling the LLM |
| GET | `/providers` | List all LLM providers |
| GET | `/providers/:provider` | One provider's config |
| GET | `/providers/:provider/models` | Models for a provider, with capabilities and pricing |

There is **no** `/invoke` suffix -- the endpoint name is the last path segment. The
`/prompt` routes are registered *before* the bare ones, so `prompt` is not captured
as an endpoint name. On `GET` the input is the query string; on `POST` it is the JSON
body. The request method must match the endpoint's stored `http_method` or the call
is rejected with 405. Provider routes set `Cache-Control: public, max-age=3600`.

### Admin Routes (Firebase token, personal API key, or entity API key)

| Method | Path | Purpose |
|--------|------|---------|
| GET/POST | `/entities` | List user's entities / create entity |
| GET/PUT/DELETE | `/entities/:entitySlug` | Entity CRUD |
| GET | `/entities/:entitySlug/members` | List members |
| PUT/DELETE | `/entities/:entitySlug/members/:memberId` | Change role / remove member |
| GET/POST | `/entities/:entitySlug/invitations` | List / send invitation |
| PUT/DELETE | `/entities/:entitySlug/invitations/:invitationId` | Renew / cancel invitation |
| GET/POST | `/entities/:entitySlug/keys` | LLM provider keys |
| GET/PUT/DELETE | `/entities/:entitySlug/keys/:keyId` | Provider key CRUD |
| GET/POST | `/entities/:entitySlug/api-keys` | Entity API keys (`shrouteent_...`) |
| PUT/DELETE | `/entities/:entitySlug/api-keys/:keyId` | Entity API key CRUD |
| GET/POST/PUT/DELETE | `/entities/:entitySlug/storage` | Storage config (single row per entity) |
| GET/POST | `/entities/:entitySlug/projects` | Projects |
| GET/PUT/DELETE | `/entities/:entitySlug/projects/:projectId` | Project CRUD |
| GET | `/entities/:entitySlug/projects/:projectId/api-key` | Reveal the project key |
| POST | `/entities/:entitySlug/projects/:projectId/api-key/refresh` | Rotate the project key |
| GET/POST | `/entities/:entitySlug/projects/:projectId/endpoints` | Endpoints |
| GET/PUT/DELETE | `/entities/:entitySlug/projects/:projectId/endpoints/:endpointId` | Endpoint CRUD |
| GET | `/entities/:entitySlug/analytics` | Usage analytics |
| GET | `/entities/self/providers/client-ip` | What the API sees about the caller's address (**entity API key only**, read-only) |
| POST | `/entities/self/providers/sync-ip` | Point the entity's `lm_studio` providers at the caller's IP (**entity API key only**) |
| GET | `/ratelimits/:entitySlug` | Tier config + current usage |
| GET | `/ratelimits/:entitySlug/history/:periodType` | Usage history (`hour` \| `day` \| `month`) |
| GET/PUT | `/users/:userId/settings` | User settings |
| GET/POST | `/users/:userId/api-keys` | List / create personal API keys |
| GET/PUT/DELETE | `/users/:userId/api-keys/:keyId` | Personal API key CRUD |
| GET | `/users/:userId/api-keys/:keyId/reveal` | Reveal the full key (Firebase token only) |
| GET | `/users/me` | Authenticated caller (Firebase token or personal key; entity keys are barred from `/users/*`) |
| GET | `/users/:userId` | User info with siteAdmin status |
| GET | `/users/:userId/subscriptions` | RevenueCat subscription status |
| GET | `/invitations` | List the caller's pending invitations (matched by email) |
| POST | `/invitations/:token/accept` | Accept invitation |
| POST | `/invitations/:token/decline` | Decline invitation |

The rate limit router is mounted at `/ratelimits/:rateLimitUserId`, but in ShapeRouter
that path segment is the **entity slug**. There is no `PUT` -- limits come from the
entity's RevenueCat entitlements, not from a stored config.

## Architecture

### Route Registration Order

In `src/routes/index.ts`, public routes are registered **before** admin routes. Admin routes apply `firebaseAuthMiddleware` on a wildcard (`*`). Registration order matters -- public routes must come first to avoid auth interception.

### Auth Split

- **Public routes** (`/ai/*`, `/providers/*`): no middleware. The AI routes do their
  own auth against a *project* API key (`sk_live_...`), read from
  `Authorization: Bearer` or the `?api_key=` query parameter, plus an optional
  per-endpoint IPv4 allowlist.
- **Admin routes** (everything else): `firebaseAuthMiddleware` accepts **three**
  credentials, checked in this order:

  1. **Personal API key** (`shroute_...`) from `X-API-Key` or `Authorization: Bearer`.
     Resolved by SHA-256 hash to its owner, then `userId` / `userEmail` / `siteAdmin`
     are set exactly as a token would set them -- every downstream handler is identical.
  2. **Entity API key** (`shrouteent_...`) from the same headers. Authenticates as the
     *entity itself*, not as a person: `userEmail` is null, `siteAdmin` is false, and
     `userId` carries only the key's author so audit columns keep a value. Restricted
     to paths containing `/entities/` (403 otherwise), so it can never reach `/users/*`
     and read or mint credentials belonging to whoever created it.
  3. **Firebase ID token** from `Authorization: Bearer`. Anonymous users are rejected
     with 403, and the `users` row is upserted fire-and-forget.

  `authMethod` (`"firebase"` | `"api_key"` | `"entity_api_key"`) records which was used.
  `firebaseUser` is **only** set on the token path, so handlers must read
  `userId` / `userEmail`, never `firebaseUser`.

### Actors and Permissions

`getEntityWithPermission()` in `src/lib/entity-helpers.ts` takes an `EntityActor`,
not a bare user id. Route handlers should pass `getActor(c)`:

- A **user** actor (Firebase token or personal key) is authorised by their membership
  role, via `entityHelpers.permissions`.
- An **entity_api_key** actor has no membership row, so it is authorised by matching
  the entity it was issued for, with `MANAGER_PERMISSIONS`. It may manage projects,
  endpoints, provider keys, and storage -- never members, roles, or API keys.

### LLM Provider Architecture

Uses a factory pattern (`createLLMProvider`) over 5 provider classes:
- `OpenAIProvider` -- OpenAI itself, plus Mistral, xAI, DeepSeek, and Perplexity, each
  given its own base URL from `OPENAI_COMPATIBLE_BASE_URLS` so requests do not fall
  through to `api.openai.com`. Cohere is also routed here but **does not work** (see below).
- `AnthropicProvider` -- uses tool_use for structured output
- `GeminiProvider` -- uses native `responseSchema` for structured JSON
- `GroqProvider` -- dedicated Whisper transcription + extraction pipeline
- `CustomLLMProvider` -- for LM Studio / custom OpenAI-compatible endpoints with multi-format response parsing

### Structured Output Strategies

Each provider uses its native structured output mechanism:
- OpenAI/Groq/compatible: Function calling -- `tools` plus a forced
  `tool_choice` on a function named `structured_response`
- Anthropic: Tool use (`tools` + `tool_choice`)
- Gemini: Response schema (`responseMimeType: "application/json"` + `responseSchema`)
- Custom/LM Studio: System prompt instructions with JSON extraction

When `web_search` is on, the OpenAI provider switches to the Responses API: a first
call decides whether live data is actually needed, then the answer is produced with
`web_search_preview` available and the same forced `structured_response` call.

### Rate Limiting

- 4 tiers, hourly / daily / monthly (`src/middleware/rateLimit.ts`):

  | Entitlement | Display | Hourly | Daily | Monthly |
  |-------------|---------|--------|-------|---------|
  | `none` | Free | 10 | 120 | 1,800 |
  | `bandwidth_dev` | Developer | 100 | 1,200 | 18,000 |
  | `bandwidth_pro` | Pro | 800 | 10,000 | 150,000 |
  | `bandwidth_ultra` | Ultra | unlimited | unlimited | unlimited |

- Tied to RevenueCat entitlements, keyed by **entity id** as the subscriber id
- Per-entity (not per-user), via `@sudobility/ratelimit_service`
- Lazily initialized to avoid requiring `REVENUECAT_API_KEY` at module load
- Entities whose active **owner** is a site admin skip rate limiting entirely
- The check **fails open**: if RevenueCat is unconfigured or the lookup throws, the
  error is logged and the request proceeds

### Multimodal Pipeline

1. Input data scanned for media (data URLs, `gs://` URLs)
2. Media extracted and replaced with placeholders in text
3. Unsupported image formats converted to PNG via Sharp
4. Model capabilities validated against requested media types
5. Provider-specific content blocks built (base64, URL, inlineData, etc.)
6. Generated media returned as base64 or uploaded to user storage (GCS/S3)

### Reserved Input Fields

Three input keys are consumed by ShapeRouter rather than passed to the model. They
are stripped in one pass by `extractReservedFields` (`src/lib/reserved-fields.ts`)
**before** any prompt is built, so none of them can leak into the prompt text:

| Field | Effect |
|-------|--------|
| `context` | Overrides the endpoint's stored context for this call. Only a non-empty string counts. |
| `web_search` | Can only *disable* search on an endpoint that already has it enabled -- never enable it. |
| `max_output_tokens` | Lowers the endpoint's output ceiling for this call. Clamped to the endpoint's own value, so it can never raise it. |

Adding a fourth is a small breaking-change surface for callers already using that
key as real input, so weigh it before doing so.

### Runaway Protection

`endpoints.max_output_tokens` caps how many tokens one invocation may generate.
Without it a looping model streams until the *provider* severs the connection --
measured at ~13 minutes and 343KB for a request whose honest answer was ~2,000
tokens. A stall timeout cannot catch this (a looping model streams
continuously), and rate limiting counts requests per entity, so one runaway is
invisible to it.

- **`null` means no protection**, and every endpoint predating the column stays
  null: the migration adds no default and backfills nothing.
- **New endpoints get `DEFAULT_MAX_OUTPUT_TOKENS` (8000)** from
  `endpointCreateSchema`, not from the database, so every creation path is
  protected while existing rows are untouched. An explicit `null` on create opts
  out; an omitted field on update leaves the current value alone.
- The resolved ceiling reaches every provider as `LLMRequest.maxTokens`.
  Anthropic keeps its `?? 4096` fallback, so unprotected Anthropic endpoints
  behave exactly as before.

`resolveMaxOutputTokens` (`src/lib/output-limit.ts`) owns the clamping --
`min(per-call, endpoint)`, so a caller can only ask for less -- and rejects a
malformed value with 400 rather than silently leaving them unprotected. It
accepts a numeric *string*, since a GET invocation's input comes from the query
string.

### Provider IP Sync

`POST /entities/self/providers/sync-ip` rewrites the host of every `lm_studio`
provider the entity owns to the address the request arrived from -- dynamic DNS
without the DNS, for a model server on a home connection. `GET
/entities/self/providers/client-ip` reports what the API sees, changing nothing.

- **Entity API key only.** The entity comes from the key; the caller sends no
  body and needs to know neither its slug nor its own address.
- **Only the host is replaced.** Scheme, credentials, port, path, query, and
  fragment survive byte for byte -- `rewriteUrlHost` splices the string rather
  than round-tripping `URL.toString()`, which would drop a default port and
  append a slash to an empty path. A hostname host is skipped: DNS already
  follows a moving IP.
- `planProviderSync` decides everything before anything is written; the route
  applies the plan in **one transaction**, so a mid-loop failure cannot leave
  some providers moved and some not.
- Providers land in `updated` / `unchanged` / `skipped`. The operation is
  idempotent.

Routes are mounted at `/entities/self/providers`, registered **before**
`/entities` so `self` is not taken for a slug. The `/entities/` prefix is what
lets an entity key reach them.

#### Resolving the caller's address

`resolveCallerIp` decides how far to trust the request from the TCP peer
(`getConnInfo()`, `hono/bun`; an IPv4 peer arrives IPv6-mapped and is unwrapped):

- **Public peer** -- the client reached us directly. Use it, ignore all headers.
- **Private/loopback peer** -- the request came through our own proxy, so read
  headers in this order: **`CF-Connecting-IP` / `True-Client-IP`**, then
  `X-Forwarded-For` right-to-left taking the first public entry, then `X-Real-Ip`.

Only a public address is ever returned, so the route needs no routability check
of its own.

**Measure the chain before trusting a header in a new deployment** -- use
`client-ip`. Production is Cloudflare -> Traefik -> API, and because Traefik has
no `forwardedHeaders.trustedIPs` it discards Cloudflare's `X-Forwarded-For` and
substitutes the edge address:

| source | value |
|---|---|
| peer | `172.18.0.2` (Traefik) |
| `x-forwarded-for` / `x-real-ip` | `104.22.14.180` (Cloudflare edge, rotates) |
| `cf-connecting-ip` | `142.254.88.197` (the actual client) |

The edge address is *public*, so it passes every routability check and looks
like a valid client. It was written into a live provider URL once before
`CF-Connecting-IP` was preferred. Only headers on `FORWARDING_HEADERS` are ever
echoed back -- never widen that to all headers, since the request carries the
caller's `X-API-Key`.

### Finish Reason

Responses carry `usage.finish_reason` and, when the ceiling was hit,
`truncated: true`. Providers disagree on both the name (`finish_reason`,
`stop_reason`, `finishReason`) and the vocabulary, so
`normalizeFinishReason` (`src/services/llm/finish-reason.ts`) maps them onto one
union. This is what lets a caller tell *"the model ran away"* from *"the model
returned something unparseable"* -- a truncated answer usually fails schema
validation, and without the reason it gets diagnosed as the wrong fault.

## Code Patterns

### Route Handler Pattern

All route files export a Hono instance. Handlers use `zValidator` for input validation and context variables set by `firebaseAuthMiddleware`:

```typescript
import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { entitySlugParamSchema, myCreateSchema } from "../schemas";
import { getActor, getEntityWithPermission } from "../lib/entity-helpers";

const app = new Hono();

app.get("/:entitySlug/things",
  zValidator("param", entitySlugParamSchema),
  async (c) => {
    const { entitySlug } = c.req.valid("param");

    // getActor(c), not c.get("userId") -- an entity API key has no membership
    const result = await getEntityWithPermission(entitySlug, getActor(c));
    if (result.error) return c.json(errorResponse(result.error), 403);

    const rows = await db.select().from(things).where(eq(things.entity_id, result.entity.id));
    return c.json(successResponse(rows));
  }
);

app.post("/:entitySlug/things",
  zValidator("param", entitySlugParamSchema),
  zValidator("json", myCreateSchema),
  async (c) => {
    const { entitySlug } = c.req.valid("param");
    const body = c.req.valid("json");

    const result = await getEntityWithPermission(entitySlug, getActor(c), true); // true = requireEdit
    if (result.error) return c.json(errorResponse(result.error), 403);

    try {
      const [row] = await db.insert(things).values({ ...body, entity_id: result.entity.id }).returning();
      return c.json(successResponse(row), 201);
    } catch (error: any) {
      console.error("Error creating thing:", error);
      return c.json(errorResponse(error.message || "Internal server error"), 500);
    }
  }
);

export default app;
```

### Response Format

Always use helpers from `@sudobility/shaperouter_types`:

```typescript
import { successResponse, errorResponse } from "@sudobility/shaperouter_types";

return c.json(successResponse(data));           // { success: true, data, timestamp }
return c.json(errorResponse("Not found"), 404); // { success: false, error, timestamp }
```

### Permission Check Pattern

```typescript
import { getActor, getEntityWithPermission } from "../lib/entity-helpers";

// Read-only access
const result = await getEntityWithPermission(entitySlug, getActor(c));

// Write access (shorthand for the "canCreateProjects" permission)
const result = await getEntityWithPermission(entitySlug, getActor(c), true);

// A specific permission
const result = await getEntityWithPermission(entitySlug, getActor(c), "canManageApiKeys");

if (result.error) {
  return c.json(errorResponse(result.error), getPermissionErrorStatus(result.errorCode));
}
const entity = result.entity;
```

### Encryption Pattern

```typescript
import { encryptApiKey, decryptApiKey } from "../lib/encryption";

// Encrypt (returns { encrypted, iv })
const { encrypted, iv } = encryptApiKey(plaintext);

// Decrypt
const plaintext = decryptApiKey(encrypted, iv);
```

## Task Recipes

### Adding a New Admin Route

1. Create Zod schemas in `src/schemas/index.ts`
2. Create route file in `src/routes/myroute.ts` following the route handler pattern above
3. Register in `src/routes/index.ts` under `adminRoutes.route("/mypath", myRoute)`, keeping
   more specific mounts (`/users/:userId/api-keys`) ahead of broader ones (`/users`)
4. Authorise with `getEntityWithPermission(slug, getActor(c), ...)` so entity-key callers work
5. Add unit/integration tests in `tests/`

### Adding a New LLM Provider

1. Check if OpenAI-compatible -- if yes, add to `PROVIDER_ENDPOINTS` *and* `OPENAI_COMPATIBLE_BASE_URLS` in `src/services/llm/index.ts` and reuse `OpenAIProvider`. Without the base URL the provider silently calls `api.openai.com`
2. If not compatible, create `src/services/llm/myprovider.ts` implementing `ILLMProvider`
3. Add provider config to `src/config/providers.ts` (models, capabilities, pricing)
4. Register in `createLLMProvider()` factory in `src/services/llm/index.ts`
5. Add capability validation if provider has unique constraints

### Adding a New Database Table

1. Define table in `src/db/schema.ts` using `shaperouterSchema.table()` (NOT `pgTable`)
2. Add the matching `CREATE TABLE IF NOT EXISTS` to `initDatabase()` in `src/db/index.ts` --
   there is no migration tool, `initDatabase()` *is* the migration
3. Run `bun run db:init` to apply it (or just restart the server -- it runs on boot too)
4. Add CRUD routes and Zod schemas
5. The `shaperouter` schema prefix is automatic via `shaperouterSchema`

## Testing

**Two runners, deliberately.** Unit tests (`tests/unit/`) use **Vitest**.
Integration tests (`tests/*.test.ts`) use **`bun:test`**, because they exercise
routes that import `hono/bun`, which needs the `Bun` global that Vitest's Node
environment does not provide. Do not "fix" an integration test by converting it
to Vitest imports -- it will fail with `ReferenceError: Bun is not defined`.

```bash
bun run test                       # Unit tests, Vitest (tests/unit/)
bun run test:integration           # Integration tests, bun:test (requires database)
bunx vitest run tests/unit/encryption.test.ts  # Single unit test file
bun test tests/keys.test.ts            # Single integration test file
```

### Unit Test Pattern

```typescript
import { describe, it, expect, beforeAll } from "vitest";

describe("MyModule", () => {
  beforeAll(() => {
    process.env.ENCRYPTION_KEY = "a".repeat(64);
  });

  it("should do something", () => {
    const result = myFunction("input");
    expect(result).toBe("expected");
  });
});
```

### Integration Test Pattern

Integration tests require a running PostgreSQL instance:

```typescript
import { describe, it, expect, beforeAll } from "vitest";
import { testApp } from "./utils/test-app";
import { mockAuth } from "./utils/mock-auth";

describe("Things API", () => {
  beforeAll(async () => {
    // test-app.ts sets up a Hono app with mock auth
  });

  it("should create a thing", async () => {
    const res = await testApp.request("/api/v1/entities/my-org/things", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...mockAuth.headers },
      body: JSON.stringify({ name: "test" }),
    });
    expect(res.status).toBe(201);
  });
});
```

## Key Dependencies

| Package | Version | Purpose |
|---------|---------|---------|
| `hono` | ^4.10.7 | HTTP framework |
| `drizzle-orm` | ^0.45.0 | Type-safe ORM |
| `postgres` | ^3.4.7 | PostgreSQL driver |
| `zod` | ^3.24.0 | Schema validation |
| `firebase-admin` | ^13.6.0 | Firebase auth verification |
| `openai` | ^4.77.0 | OpenAI API client |
| `@anthropic-ai/sdk` | ^0.39.0 | Anthropic API client |
| `@google/generative-ai` | ^0.21.0 | Gemini API client |
| `groq-sdk` | ^0.37.0 | Groq API client (Whisper) |
| `sharp` | ^0.34.5 | Image conversion |
| `resend` | ^6.9.2 | Email delivery |
| `@google-cloud/storage` | ^7.18.0 | GCS uploads |
| `@aws-sdk/client-s3` | ^3.969.0 | S3 uploads |
| `@sudobility/shaperouter_types` | ^1.0.58 | Shared TypeScript types |
| `@sudobility/entity_service` | ^1.0.41 | Entity/organization management |
| `@sudobility/ratelimit_service` | ^1.0.39 | Rate limiting |
| `@sudobility/auth_service` | ^1.1.21 | Firebase auth helpers |
| `@sudobility/subscription_service` | ^1.0.23 | Subscription management |
| `@sudobility/types` | ^1.9.67 | Common Sudobility types (entitlements, user info) |

## Workspace Context

This project is part of the **ShapeRouter** multi-project workspace at the parent directory. See `../CLAUDE.md` for the full architecture, dependency graph, and build order.

## Downstream Impact

This is a **leaf application** -- no other project depends on it.

When upstream libraries change, update here:

| Upstream Library | Update command |
|-----------------|----------------|
| `@sudobility/auth_service` | `bun update @sudobility/auth_service && bun run typecheck` |
| `@sudobility/entity_service` | `bun update @sudobility/entity_service && bun run typecheck` |
| `@sudobility/ratelimit_service` | `bun update @sudobility/ratelimit_service && bun run typecheck` |
| `@sudobility/subscription_service` | `bun update @sudobility/subscription_service && bun run typecheck` |
| `@sudobility/shaperouter_types` | `bun update @sudobility/shaperouter_types && bun run typecheck` |
| `@sudobility/types` | `bun update @sudobility/types && bun run typecheck` |

## Local Dev Workflow

To test with local library versions:

```bash
# In the library (e.g., auth_service):
cd ../auth_service && bun link

# In this project:
bun link @sudobility/auth_service

# Run dev server:
bun run dev

# When done, unlink:
bun unlink @sudobility/auth_service && bun install
```

## Pre-Commit Checklist

```bash
bun run verify  # Runs: typecheck + lint + unit tests
```

For integration tests (requires test database):
```bash
bun run test:setup && bun run test:integration
```

## Gotchas

- **No build step needed for dev** -- `bun run dev` runs TypeScript directly. `bun run build` is only for production Docker images.
- **Database must be running** -- requires PostgreSQL. Check `DATABASE_URL` in `.env.local`.
- **`initDatabase()` is the migration system** -- there is no migration tool. It creates the schema, enums, tables, and indexes, then applies additive `ALTER TABLE ... IF NOT EXISTS` column migrations, and it runs on **every** server boot as well as via `bun run db:init`. Every statement is idempotent, so it is safe to re-run; it is also why a new column must be added there by hand, not just to `schema.ts`.
- **`ENCRYPTION_KEY` must be 64-character hex** -- LLM API keys and storage credentials are encrypted at rest. Missing this causes runtime errors.
- **Tables live in `shaperouter` PostgreSQL schema** -- not the default `public` schema. All table creation uses `shaperouterSchema.table()`.
- **Two test runners** -- `bun run test` runs `tests/unit/` under **Vitest**; `bun run test:integration` runs `tests/*.test.ts` under **`bun:test`** and needs a real database. Integration tests must use `bun:test` imports: they load routes that import `hono/bun`, and the `Bun` global does not exist under Vitest.
- **`@sudobility/*` packages do not load under Vitest** -- several ship ESM with extensionless relative imports (`export ... from "./init"`), which Node's resolver rejects for an externalized dependency. This is another reason integration tests run under `bun test`.
- **Six `@sudobility/*` dependencies** -- version mismatches between them are the most common cause of type errors.
- **Lazy Proxy-based db connection** -- the database is not connected at module load. First access triggers initialization. This is intentional for test isolation.
- **Three key types, different jobs** -- `sk_live_...` is a *project* key that authenticates callers of a published AI endpoint; `shroute_...` is a *personal* key that authenticates its owner against the admin routes; `shrouteent_...` is an *entity* key that authenticates as the workspace itself for CI, scripts, and MCP clients. The prefix is what routes an incoming credential, so never reuse one.
- **Entity keys are hash-only** -- the plaintext appears once, in the create response, and is unrecoverable afterwards. A lost entity key is rotated, not revealed. Personal keys also store an AES-256-CBC copy, which is what makes `/reveal` possible.
- **Entity keys are path-restricted** -- the middleware rejects any request whose path does not contain `/entities/`, and `entity-api-keys.ts` additionally refuses entity-key auth outright, so a key can never mint or revoke keys.
- **Handlers must not read `firebaseUser`** -- it is undefined on API-key requests. Use `c.get("userId")` and `c.get("userEmail")`.
- **API keys cannot mint API keys** -- create and reveal require a Firebase token (`authMethod === "api_key"` is rejected with 403), so a leaked key cannot bootstrap more credentials.
- **User API key lookups are cached for 60s** -- a revoked key can keep working that long unless the revocation went through this API, which invalidates the entry immediately.
- **Public AI routes use project API key auth** -- NOT Firebase auth, and NOT `X-API-Key`. The key comes from `Authorization: Bearer` or the `?api_key=` query parameter, and is validated by decrypting the stored key and comparing with `timingSafeEqual`.
- **The invoke path has no `/invoke` suffix** -- it is `POST /api/v1/ai/:entitySlug/:projectName/:endpointName`. The endpoint name is the last segment. `/prompt` is the one reserved suffix, and its routes are registered first so `prompt` is never captured as an endpoint name.
- **`organizationPath` is the entity slug** -- the first path segment of a public AI URL is looked up against `entities.entity_slug`, despite the parameter name.
- **Every invocation is counted, success or failure** -- `incrementCallCount()` bumps `endpoints.call_count` and a `usage_analytics` row is written on both paths, since the caller consumed the endpoint either way.
- **Rate limiting fails open** -- an unconfigured or throwing RevenueCat lookup logs and lets the request through. Site-admin-owned entities skip the check entirely.
- **IP allowlist on endpoints** -- optional IPv4 allowlist. When set, requests from IPs not in the list are rejected.
- **Provider factory reuses OpenAIProvider** -- Mistral, xAI, DeepSeek, and Perplexity use `OpenAIProvider` with their own base URLs, since their APIs are OpenAI-compatible.
- **Cohere is listed but does not work** -- it is routed through `OpenAIProvider` with no base URL override, and Cohere's API is not OpenAI-compatible in either request or response shape. `services/llm/index.ts` carries a comment saying so. It needs a dedicated provider before the catalog entry is truthful.
- **Groq Whisper has two-stage pipeline** -- transcription via Whisper, then optional structured extraction via a configurable second model/provider.
- **Imagen/Veo are stubs** -- Gemini generative models (Imagen, Veo) require Vertex AI SDK which is not yet integrated.
- **Media conversion only for images** -- SVG, TIFF, HEIC, BMP, AVIF are converted to PNG via Sharp. Audio/video conversion is not supported.
- **SSRF prevention** -- only `gs://` URLs are allowed for media input. HTTP/HTTPS URLs are rejected to prevent server-side request forgery.
- **Rate limits are per-entity** -- tied to RevenueCat subscription via entity slug mapping, not per individual user.
- **`getEntityWithPermission()` is centralized** -- lives in `src/lib/entity-helpers.ts` along with the singleton `entityHelpers` instance. All route files import from there.
- **Signed URLs expire in 7 days** -- GCS and S3 uploads generate signed URLs with 7-day expiry. Clients must handle expired URLs.
- **Firebase token verifier uses 5-minute cache** -- reduces Firebase Admin calls but means revoked tokens remain valid for up to 5 minutes.
- **Route registration order matters** -- public routes must be registered before admin routes in `src/routes/index.ts` to avoid wildcard auth middleware interception.
- **50MB body limit** -- set in `src/index.ts` via Hono bodyLimit middleware for base64-encoded media uploads.
- **Entity slug max 12 chars** -- enforced by Zod schema. Important for URL parsing.
- **Invitations are addressed by token, not id** -- `POST /invitations/:token/accept|decline`. `GET /invitations` matches pending invitations against the caller's `userEmail`. Entity keys cannot reach these routes at all -- `/api/v1/invitations` does not contain `/entities/`, so the middleware returns 403.
- **Project responses are redacted** -- `publicProject()` in `src/lib/public-project.ts` strips `encrypted_api_key` and `api_key_iv` from any project row before it is returned. `db.select()` returns every column, so new project-returning routes must pass rows through it.
- **`/users/me` is the only way a personal-key caller learns its own UID** -- and the `/users/:userId/*` routes need that UID. It is registered before `/:userId` so the literal `me` is not captured as a user id. It tolerates a Firebase outage: identity comes from the middleware, and only the display name is fetched from Firebase.

## Git Workflow

- Do not use feature branches for code changes. Always stay on the current branch.
