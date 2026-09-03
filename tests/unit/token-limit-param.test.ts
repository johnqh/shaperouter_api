import { describe, expect, it } from "vitest";
import { tokenLimitParamFor } from "../../src/services/llm/openai";

/**
 * What a provider calls its cap on generated tokens.
 *
 * `OpenAIProvider` serves OpenAI itself *and* every OpenAI-compatible third
 * party (DeepSeek, Mistral, xAI, Perplexity, Cohere), and the two do not share
 * a vocabulary here. OpenAI's reasoning-era models reject `max_tokens` with
 * "Unsupported parameter: 'max_tokens' is not supported with this model. Use
 * 'max_completion_tokens' instead", while the compatible providers know only
 * `max_tokens` — so sending the new name to them would break every one.
 *
 * Both halves of the decision matter, which is why this takes a model as well
 * as a provider: the model is chosen per endpoint, so it cannot be settled when
 * the client is constructed.
 */
describe("tokenLimitParamFor", () => {
  it("uses the newer name for OpenAI's reasoning-era families", () => {
    for (const model of ["gpt-5.4", "gpt-5.6-terra", "gpt-5", "o1", "o3-mini"]) {
      expect(tokenLimitParamFor(true, model)).toBe("max_completion_tokens");
    }
  });

  it("leaves OpenAI's earlier models on the name they accept", () => {
    for (const model of ["gpt-4o", "gpt-4o-mini", "gpt-4.1", "gpt-4.1-nano"]) {
      expect(tokenLimitParamFor(true, model)).toBe("max_tokens");
    }
  });

  /*
   * The dangerous direction. A compatible provider named like an OpenAI model
   * must still get `max_tokens` — the rule is about whose API is being called,
   * not what the model is called.
   */
  it("always uses max_tokens for OpenAI-compatible providers", () => {
    for (const model of [
      "deepseek-v4-flash",
      "deepseek-v4-pro",
      "grok-4",
      "mistral-large",
      "gpt-5-lookalike",
    ]) {
      expect(tokenLimitParamFor(false, model)).toBe("max_tokens");
    }
  });

  /*
   * Matched on the family prefix rather than an exhaustive list: the point of a
   * family is that its next member behaves like the last, and a list of exact
   * ids would be wrong the day one ships.
   */
  it("covers a family member that does not exist yet", () => {
    expect(tokenLimitParamFor(true, "gpt-5.9-ultra")).toBe(
      "max_completion_tokens",
    );
    expect(tokenLimitParamFor(true, "o7-preview")).toBe(
      "max_completion_tokens",
    );
  });

  it("is not confused by case", () => {
    expect(tokenLimitParamFor(true, "GPT-5.4")).toBe("max_completion_tokens");
  });
});
