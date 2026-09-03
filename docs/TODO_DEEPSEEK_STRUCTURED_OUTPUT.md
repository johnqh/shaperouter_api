# TODO: DeepSeek cannot produce structured output

**Status:** open · **Raised by:** `music_api`, which configured three DeepSeek
endpoints and cannot invoke any of them.

## The symptom

Every call to a DeepSeek-backed endpoint with an `output_schema` fails:

```
HTTP 500: LLM processing failed: 400 Thinking mode does not support this tool_choice
```

Reproduced on both models the provider exposes — `deepseek-v4-pro` and
`deepseek-v4-flash` — with an otherwise ordinary endpoint (a `brief` string in,
a JSON schema out). The endpoint itself is fine: the same schema, instructions
and prompt work against `gpt-5.4` and `gpt-4.1-mini`.

## The cause

`getProvider` routes `deepseek` through `OpenAIProvider` alongside Mistral, xAI
and Perplexity (`src/services/llm/index.ts`), because DeepSeek serves an
OpenAI-compatible API. `OpenAIProvider` implements structured output as
**function calling**, setting `tools` and then `tool_choice` unconditionally
(`src/services/llm/openai.ts`).

DeepSeek V4 is a thinking model, and its API rejects `tool_choice` while
thinking is active. Both exposed models are V4, so there is no model choice that
avoids this — the combination is simply unavailable.

This is the same shape as the OpenAI `gpt-5.6-terra` failure ("Function tools
with reasoning_effort are not supported for gpt-5.6-terra"), which is worth
noting because it is now two providers where the newest, most capable models are
the ones function calling cannot reach. Treating function calling as *the*
structured-output mechanism is aging badly as reasoning models become the
default.

## The fix already exists in this codebase

`custom.ts` (the `lm_studio` path) solves exactly this problem for servers that
support neither `tools` nor `response_format`: it asks for JSON in the prompt and
extracts it from the reply, and it already **strips thinking blocks**
(`<think>...</think>`, added for Qwen3). That is the mechanism DeepSeek needs.

Three ways to apply it, cheapest first:

1. **Per-provider strategy.** Give the provider table a structured-output mode
   — `function-calling` or `prompt-instructed` — and set DeepSeek to the latter.
   Smallest change, and it makes the assumption explicit where today it is
   implied by which class the provider is routed to.
2. **Fall back on rejection.** Catch the 400 naming `tool_choice` and retry the
   same request prompt-instructed. Self-healing for providers not yet
   classified, but it pays a failed round trip each time and turns a
   configuration fact into a runtime surprise.
3. **Per-model capability.** The model table already carries `capabilities`
   (`visionInput`, `webSearch`, …). A `functionCalling: false` there would let
   `list_provider_models` warn *before* an endpoint is created against a model
   that cannot serve one — which is the failure mode that cost time here, since
   the endpoint was created and looked healthy until it was invoked.

(1) and (3) together are the honest answer: (1) makes it work, (3) makes it
visible.

## Why it matters beyond one caller

DeepSeek is roughly an order of magnitude cheaper per token than the GPT-5 tier,
which is most of the reason to reach for it — and structured output is the
product's whole premise, so "this provider works, except for the thing the
product does" is a sharp edge. A caller has no way to discover the limitation
except by creating an endpoint and watching it 500.

## Verification when it lands

`music_api` has three DeepSeek endpoints already configured and a variant switch
that routes to them (`generate-score-ds`, `plan-arrangement-ds`,
`regenerate-region-ds`). A single generation through the `deepseek` variant
exercises all three prompt shapes.
