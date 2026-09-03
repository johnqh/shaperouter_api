# TODO: runaway protection for endpoint invocation

**Status:** IMPLEMENTED (shaperouter_api 1.0.122, types 1.0.59, client 0.0.89,
lib 0.0.98, app 0.0.259) · **Raised by:** `music_api`, which lost an existing
protection by migrating onto ShapeRouter.

> ## What shipped
>
> Both pieces, as proposed.
>
> **1. `max_output_tokens`** on `endpoints`, settable per endpoint and lowerable
> per call. `null` means no protection, and every endpoint that predates the
> column keeps that null -- the migration adds no default and backfills nothing.
> New endpoints default to `DEFAULT_MAX_OUTPUT_TOKENS` (8000), applied in
> `endpointCreateSchema` so every creation path gets it; pass an explicit `null`
> on create to opt out. The per-call value is clamped as `min(per-call,
> endpoint)`, so it can only ever ask for less. A malformed value is a 400, not
> a silent fallback. See `src/lib/output-limit.ts`.
>
> **2. Stop reason reported.** Responses carry `usage.finish_reason` and
> `truncated: true` when the ceiling was hit, normalized across all providers by
> `src/services/llm/finish-reason.ts`. Surfaced in the dashboard's endpoint
> tester as an explicit "output was cut off" banner.
>
> `max_output_tokens` is now the third reserved input field alongside `context`
> and `web_search`. All three are stripped in one pass *before* the prompt is
> built (`src/lib/reserved-fields.ts`); previously `web_search` leaked into the
> prompt, which this fixed.
>
> Not addressed: streaming, and a wall-clock ceiling. A cap on tokens bounds a
> runaway but does not bound a slow one.

## The gap

An endpoint invocation has no ceiling on how much the model may generate. Neither
`create_endpoint` nor `POST /api/v1/ai/:orgPath/:projectName/:endpointName`
accepts a max-output-tokens value, and the response reports token counts only
after the fact. A model that loops therefore runs until the *provider* severs the
connection, and the caller pays for everything it produced on the way.

This is not hypothetical. `music_api` generates multi-track scores as structured
JSON, and measured across sixteen four-bar generations, **two of them looped** —
streaming 96KB and 343KB over roughly thirteen minutes each — for requests whose
honest answer was about 2,000 tokens.

## Why the existing guards do not cover it

- **A stall timeout does not fire.** A looping model streams *continuously*; it
  is producing tokens the whole time. Silence detection sees a healthy stream.
- **The provider timeout is far too coarse.** By the time OpenAI severs a
  connection, ~15 minutes and the full token cost are already spent.
- **Rate limiting is the wrong instrument.** It is per entity and counts
  requests, so one runaway request is invisible to it — and if it did fire, it
  would punish the whole workspace for one bad generation.

## What the caller had before, and lost

`music_api` sized `max_completion_tokens` **per request**, from the amount of
music being asked for (track-measures × a measured tokens-per-track-measure ×
headroom). Three things followed from that, and all three are gone on the
ShapeRouter path:

1. A runaway became a **fast, cheap failure** instead of a thirteen-minute one.
2. `finish_reason: 'length'` was surfaced as a distinct error, so the caller
   could tell *"the model ran away"* apart from *"the model returned something
   unparseable"* — different faults with different correct responses.
3. Because a capped failure was cheap to discover, it was **safe to retry once**.
   Both runaways then succeeded on the retry. That retry is only affordable
   *because* of the ceiling; retrying an unbounded generation risks burning
   another thirteen minutes.

Losing (1) costs money and latency. Losing (2) means a caller cannot
discriminate the failure. Losing (3) removes a recovery that measurably worked.

## Proposed surface

Two pieces, and the second matters as much as the first.

**1. A max-output-tokens ceiling, settable per endpoint and overridable per call.**

Per endpoint as a default (`max_output_tokens` on `create_endpoint` /
`update_endpoint`), because most endpoints have a stable answer size — and
**overridable per invocation**, because some do not. `music_api`'s ceiling is
computed from the size of the piece being commissioned: two bars and sixteen bars
are the same endpoint and a factor of eight apart in honest output length. A
fixed endpoint-level cap must be set for the largest case, which leaves the small
ones unprotected — exactly where a runaway is most wasteful relative to the work.

Per-call is the sensitive one, so it should be a **ceiling, not a raise**:
`min(per-call value, endpoint default)`, so a caller can only ever ask for less.
That keeps it from becoming a way to escape an operator's limit.

**2. Report *why* generation stopped.**

Add the provider's stop reason to the response — `usage.finish_reason`, or a
top-level `truncated: true`. Without it, a capped response arrives as JSON that
fails schema validation, and the caller diagnoses a truncation as a malformed
model, which leads to the wrong fix. This is useful independently of (1): it
already happens today whenever a model hits the provider's own limit.

## Suggested shape

```jsonc
// create_endpoint / update_endpoint
{ "max_output_tokens": 8000 }

// POST /api/v1/ai/:orgPath/:projectName/:endpointName
{ "max_output_tokens": 2000, "brief": "..." }   // clamped to the endpoint default

// response
{ "output": { }, "usage": { "tokens_input": 3143, "tokens_output": 948,
                            "finish_reason": "length" } }
```

`max_output_tokens` would join `context` and `web_search` as a reserved input
field name — worth noting in the docs beside them, since reserved names are a
small breaking-change surface for existing callers who happen to use one.

## Why this is worth doing beyond one caller

Any endpoint whose output length varies with its input has this exposure, and
structured-output endpoints are the most vulnerable: a model that loses its way
inside a repeated JSON structure will happily emit the same array element
forever, and it looks like healthy streaming the entire time. The cost lands on
whoever owns the provider key.

## Workarounds until then

None that are good. A client-side wall-clock abort bounds the damage but still
pays for the abandoned tokens, and cannot distinguish a runaway from a slow but
valid generation. `music_api` currently keeps its direct-to-OpenAI transport
reachable behind `AI_TRANSPORT=openai` purely so this protection is not lost with
no way back.
