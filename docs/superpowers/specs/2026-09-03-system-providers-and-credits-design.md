# System-Owned Providers and Prepaid Credits

**Date:** 2026-09-03
**Status:** Approved for planning
**Scope:** `shaperouter_types`, `shaperouter_client`, `shaperouter_lib`, `shaperouter_api`, `shaperouter_app`, `shaperouter_api_mcp`

## Summary

ShapeRouter stops asking users for LLM provider API keys. The site holds one key
per provider, a site admin manages them, and users pick a provider from whatever
the admin has enabled. Because ShapeRouter now pays every provider bill, entities
prepay into a credit balance and are charged provider cost plus a 25% markup on
each successful invocation.

Two changes ship together because neither is safe alone: system keys without
billing hand every user an uncapped spend on our account, and billing without
system keys meters money we never pay.

## Goals

- A site admin configures and rotates provider keys; no user ever supplies one.
- `GET /api/v1/providers` returns exactly the providers a user may choose.
- An endpoint names a provider and a model, not a key.
- Every successful invocation debits `provider cost x 1.25` from the owning
  entity's balance, recorded in an auditable ledger.
- An entity with no balance gets a `402` naming the shortfall, not a generic error.

## Non-goals

- Per-entity spend caps, budgets, or alerting thresholds. Balance is the only limit.
- Automatic top-up on a low balance.
- Refunds or credit expiry.
- Per-provider or per-model markup rates. One rate, site-wide.
- Migration tooling. ShapeRouter's database has never been provisioned, so the
  schema below is authored directly rather than migrated onto.

## Money representation

All money is a `bigint` count of **micro-cents** (`µ¢`, 10⁻⁶ of a cent).

This is not incidental. `MODEL_PRICING` is denominated in cents per 1M tokens, so
a 1,000-token call against a $1/1M model costs 0.1¢. Today `ai.ts:763` stores
`Math.round(costCents)`, which turns that into `0`. Harmless for decorative
analytics; a revenue hole the moment it is the number we bill against. Integer
micro-cents makes every charge exact and every ledger sum reproducible, with no
floating-point drift across the millions of rows a busy entity accumulates.

Formatting to dollars happens only at display edges — never in storage,
arithmetic, or API payloads.

## Architecture

### Data model (`shaperouter_api/src/db/schema.ts`)

**Removed**

| Thing | Reason |
|---|---|
| `llm_api_keys` table | Per-entity keys are the thing being eliminated |
| `endpoints.llm_key_id` | Endpoints name a provider, not a key row |
| `lm_studio` from `llmProviderEnum` | A user-hosted URL cannot be a site-owned key |

**Added**

`system_providers` — the site's own credentials, one row per provider.

| Column | Type | Notes |
|---|---|---|
| `provider` | `llmProviderEnum` | Primary key. One key per provider. |
| `encrypted_api_key` | `text` | Via existing `encryptApiKey()` in `lib/encryption.ts` |
| `encryption_iv` | `varchar(32)` | |
| `is_enabled` | `boolean` default `true` | Admin can disable without discarding the key |
| `updated_by` | `varchar(128)` | Firebase UID of the admin who last wrote it |
| `created_at`, `updated_at` | `timestamp` | |

`entity_credits` — current balance, one row per entity.

| Column | Type | Notes |
|---|---|---|
| `entity_id` | `uuid` | Unique, FK to `entities`, cascade delete |
| `balance_micro_cents` | `bigint` notNull default `0` | May go negative; see Debit model |
| `updated_at` | `timestamp` | |

`credit_transactions` — append-only signed ledger.

| Column | Type | Notes |
|---|---|---|
| `uuid` | `uuid` | PK |
| `entity_id` | `uuid` | FK, indexed with `created_at` for statement queries |
| `amount_micro_cents` | `bigint` | Positive credit, negative debit |
| `kind` | enum | `topup` \| `usage` \| `adjustment` \| `refund` |
| `balance_after_micro_cents` | `bigint` | Snapshot for auditing without replay |
| `usage_analytics_id` | `uuid` nullable | FK, set on `usage` rows |
| `stripe_event_id` | `varchar(255)` nullable **unique** | Set on `topup` rows |
| `created_by` | `varchar(128)` nullable | Firebase UID for `adjustment` |
| `created_at` | `timestamp` | |

The uniqueness of `stripe_event_id` *is* the webhook idempotency mechanism.
Stripe redelivers; a duplicate insert violates the constraint, the handler
catches that specific violation and returns `200`. No separate dedupe table, no
advisory locks, no window where a retry double-credits.

**Changed**

`endpoints` gains `provider` (`llmProviderEnum`, notNull), replacing `llm_key_id`.
`usage_analytics.estimated_cost_cents` becomes two columns:
`provider_cost_micro_cents` and `charged_micro_cents`. Keeping both is what lets a
site admin see margin and lets a user see what they actually paid — one number
cannot answer both questions.

### Markup

`MARKUP_BPS = 12500` (125%, i.e. cost + 25%) and `applyMarkup(providerMicroCents)`
live in `shaperouter_types` beside the existing `estimateCost`. Putting the
constant in the shared package is deliberate: `shaperouter_api` charges with it
and `shaperouter_app` quotes prices with it, and a divergence between those two
is a support ticket that reads "you charged me more than the estimate."

`applyMarkup` rounds half-up to the nearest micro-cent. At micro-cent resolution
the rounding error is ~10⁻⁸ dollars per call and cannot accumulate into anything
visible.

### API surface (`shaperouter_api/src/routes/`)

**Deleted:** `keys.ts` (`/entities/:slug/keys/*`), `provider-sync.ts`
(`/entities/self/providers`), and `lib/provider-url.ts`. The last two exist only
to keep a self-hosted LM Studio URL current and go with `lm_studio`.

**New — admin.** A `requireSiteAdmin` middleware reads the `siteAdmin` flag
`firebaseAuth.ts:98` already sets from `isSiteAdmin(email)`. No new auth concept,
no new role table; the flag is already computed on every authenticated request
and already surfaced by `GET /users/me`.

| Route | Behaviour |
|---|---|
| `GET /api/v1/admin/providers` | Every provider in the enum with `configured` and `is_enabled` flags. Never returns key material, not even masked. |
| `PUT /api/v1/admin/providers/:provider` | Set or rotate the key, toggle `is_enabled`. Upsert. |
| `DELETE /api/v1/admin/providers/:provider` | Discard the key. Rejects with `409` if any active endpoint still names this provider, listing the blocking endpoints. |

**Changed — public.** `GET /api/v1/providers` filters to providers that are both
configured and `is_enabled`. This one filter is the whole user-facing shape of the
feature: the catalog a user chooses from becomes exactly what the admin has turned
on. Model listings under it are unchanged.

**New — credits.**

| Route | Behaviour |
|---|---|
| `GET /api/v1/entities/:slug/credits` | Balance plus a paginated ledger |
| `POST /api/v1/entities/:slug/credits/checkout` | Creates a Stripe Checkout session for a named credit pack, returns its URL |
| `POST /api/v1/stripe/webhook` | Signature-verified, unauthenticated. Mounted beside `/ai` and `/providers` **before** the auth wildcard in `routes/index.ts`. |

The webhook credits on `checkout.session.completed`, resolving the entity from
session metadata written at creation time. Any other event type is acknowledged
and ignored.

**Changed — endpoints.** Create and update take `provider` and `model` in place of
`llm_key_id` (`schemas/index.ts:218,247`). Validation rejects a provider that is
not currently configured-and-enabled, and a model the provider does not list.

### Invoke path (`shaperouter_api/src/routes/ai.ts`)

```
validate  ->  rate limit  ->  balance gate  ->  resolve system key  ->  call  ->  settle
```

**Balance gate.** Immediately after the existing `checkRateLimit` call
(`ai.ts:544,585`). Passes when `balance_micro_cents > 0`. Otherwise `402`:

```json
{ "error": "insufficient_credit",
  "balance_micro_cents": "0",
  "top_up_url": "https://shaperouter.com/dashboard/credits" }
```

A distinct machine-readable code matters because the caller is usually another
program: "top up" and "your schema is wrong" need different handling, and a bare
500 conflates them.

Rate limiting stays exactly as it is, demoted in purpose to abuse protection —
spend is governed by balance now. `isEntityOwnedBySiteAdmin` (`ai.ts:258`) already
exempts admin-owned entities from rate limits; the gate honours the same
exemption so the operator's own entities are never blocked by their own billing.

**Key resolution.** `createLLMProvider` is constructed from the `system_providers`
row for `endpoint.provider` instead of the endpoint's key row. A provider that has
been disabled or deleted since the endpoint was configured yields `503` naming the
provider — a site misconfiguration, distinct from the user's `402`.

**Settlement.** After a successful `provider.generate`, in **one database
transaction**:

1. insert `usage_analytics` with `provider_cost_micro_cents` and `charged_micro_cents`
2. insert `credit_transactions` (`kind: usage`, negative amount, FK to that row)
3. `UPDATE entity_credits SET balance_micro_cents = balance_micro_cents - :charged`

The update is a read-modify-write **in SQL**, not read-then-write in TypeScript —
concurrent invocations must serialise on the row rather than clobbering each
other's balance. `incrementCallCount` joins this transaction.

Failed provider calls are not charged. This matches where `estimateCost` is called
today and is the defensible position: we bill for output the user received.

### Debit model: post-paid with tolerated overshoot

Cost is unknowable until the provider responds, so the gate cannot deduct what it
does not yet know. The gate therefore checks only that the balance is positive,
and settlement may drive it negative. The next call is refused.

Chosen over reserve-and-settle (holds table, release-on-failure, expiry sweeps for
calls that die mid-flight, plus false rejections of affordable calls whose
theoretical ceiling is unaffordable) because `endpoints.max_output_tokens`
(`schema.ts:263`) already bounds a single call's cost. The machinery buys
protection against an exposure that is already capped.

**Known limitation, accepted:** N concurrent invocations on a near-zero balance
each pass the gate independently, so worst-case exposure is `N x single-call
ceiling` rather than one call's worth. At current scale this is bad debt measured
in cents. If it ever bites, the fix is a per-entity in-flight counter, and nothing
in this design forecloses it.

## Package changes

Ordered by dependency. Each package is published before the one that consumes it.

**`shaperouter_types`** — the blocking change; everything else waits on it.
Remove `LlmApiKey`, `LlmApiKeySafe`, `LlmApiKeyCreateRequest`,
`LlmApiKeyUpdateRequest`, `LlmApiKeyListResponse`, `LlmApiKeyResponse`, the four
`ProviderIpSync*` types, `ClientIpDiagnostics`, and `lm_studio` from the
`LLMProvider` union, `PROVIDERS`, `PROVIDER_MODELS`, and `isValidModel`. Add
`SystemProvider`, `SystemProviderUpdateRequest`, `EntityCredits`,
`CreditTransaction`, `CreditPack`, `CheckoutSessionResponse`, `MARKUP_BPS`, and
`applyMarkup`. Change `Endpoint`, `EndpointCreateRequest`, `EndpointUpdateRequest`
to carry `provider` instead of `llm_key_id`.

**`shaperouter_client`** — delete `useKeys.ts` and its tests. Add
`useAdminProviders.ts` and `useCredits.ts`. Update `useProviders.ts` and
`useEndpoints.ts` for the new shapes.

**`shaperouter_lib`** — delete `keysStore.ts` and `useKeysManager.ts`. Add
`creditsStore.ts` with `useCreditsManager.ts`, and `useAdminProvidersManager.ts`.
`useProviderModelsManager.ts` stays, now reading a shorter catalog.

**`shaperouter_app`** — delete `ProviderForm.tsx`. `ProvidersPage.tsx` becomes a
read-only catalog of what is available. `EndpointForm.tsx` selects provider and
model from the enabled list instead of choosing a key. New
`/dashboard/admin/providers`, rendered only when `GET /users/me` reports
`siteAdmin` and returning 404-equivalent otherwise — the server-side
`requireSiteAdmin` is the real boundary; the client check is only there to avoid
showing a door that will not open. New `/dashboard/credits` with balance, ledger,
and top-up. The pricing page sells credit packs rather than subscription tiers.

**`shaperouter_api_mcp`** — delete `src/tools/keys.ts` and its five tools
(`create_llm_key`, `list_llm_keys`, `get_llm_key`, `update_llm_key`,
`delete_llm_key`). `src/tools/providers.ts` stays read-only. Endpoint tools take
`provider` and `model`. Both bundled skills — `shaperouter-endpoint` and
`shaperouter-providers` — teach BYOK end-to-end today, including a dedicated
`references/authentication.md`; they need rewriting, not patching. Provider-key
management does not return to MCP in any form.

## Error handling

| Condition | Status | Code |
|---|---|---|
| Balance at or below zero | `402` | `insufficient_credit` |
| Endpoint names a disabled or unconfigured provider | `503` | `provider_unavailable` |
| Non-admin hits `/admin/*` | `403` | `forbidden` |
| Delete a provider with active endpoints | `409` | `provider_in_use` |
| Stripe webhook signature invalid | `400` | — |
| Stripe event already processed | `200` | — (idempotent no-op) |

Provider call failures keep their current handling and remain uncharged.

## Testing

New unit coverage, all in `tests/unit/`:

- **Markup arithmetic** — sub-cent inputs, rounding at the micro-cent boundary,
  and that a 1,000-token call is charged something rather than zero. This is the
  regression test for the bug that motivated micro-cents.
- **Balance gate** — exactly `0` refuses, `1` micro-cent passes, negative refuses.
- **Ledger invariant** — after an arbitrary sequence of topups and usages,
  `balance_micro_cents` equals the sum of `amount_micro_cents`, and every row's
  `balance_after_micro_cents` matches the running total at that point.
- **Webhook idempotency** — the same `stripe_event_id` delivered twice credits
  once and returns `200` both times.
- **Admin gate** — `requireSiteAdmin` rejects an authenticated non-admin.
- **Provider resolution** — a disabled provider yields `503`, not a crash.
- **Settlement atomicity** — a failure between the analytics insert and the
  balance update leaves neither applied.

`tests/unit/provider-url.test.ts` is deleted with `lm_studio`. Existing key-route
tests are replaced by admin-provider tests.

All six repositories currently pass `bun run verify`; that is the regression gate
for each, and each must be green before the next in the dependency order is
touched.

## Implementation order

1. `shaperouter_types` — types, markup helpers, `lm_studio` removal. Publish.
2. `shaperouter_api` — schema, `system_providers`, admin routes, invoke path.
3. `shaperouter_api` — `entity_credits`, ledger, Stripe checkout and webhook.
4. `shaperouter_client` — hooks. Publish.
5. `shaperouter_lib` — stores and managers. Publish.
6. `shaperouter_app` — admin page, credits page, endpoint form, pricing.
7. `shaperouter_api_mcp` — tool removal, endpoint tools, skill rewrites.

## Operational prerequisites

Not code, and blocking on step 3:

- `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET` in the API environment.
- Stripe price IDs for each credit pack.
- At least one provider key loaded into `system_providers`, or every invocation
  returns `503`.
- `SITEADMIN_EMAILS` (consumed by `isSiteAdmin`) populated, or no one can reach
  `/admin/*` to load that first key.
