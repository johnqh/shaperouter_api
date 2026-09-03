/**
 * Pull the JSON out of a model reply that is not obliged to return only JSON.
 *
 * Function calling guarantees a clean payload; prompt-instructed output does
 * not. A model asked in words for JSON may wrap it in a markdown fence, preface
 * it with a sentence, or — on a reasoning model — put a whole `<think>` block in
 * front of it. This is the tolerant reader for that case.
 *
 * It lived as a private method on the `lm_studio` provider, where it was written
 * for local servers that support neither `tools` nor `response_format`. It moved
 * here when DeepSeek needed exactly the same treatment for the opposite reason:
 * not a server too simple for function calling, but a model too *new* for it —
 * DeepSeek V4 is a thinking model and its API rejects `tool_choice` outright.
 * One reader, so a fix to either provider's parsing is a fix to both.
 */
export function extractJson(text: string): string {
  // Thinking blocks first: a reasoning model emits them before the answer, and
  // they routinely contain braces that would otherwise be mistaken for it.
  let cleaned = text.replace(/<think>[\s\S]*?<\/think>/g, "").trim();

  // A fenced block is the strongest signal, so try it before anything looser —
  // but only accept it if it actually parses, since a model will occasionally
  // fence its reasoning and leave the real answer outside.
  const codeBlockMatch = cleaned.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (codeBlockMatch) {
    try {
      JSON.parse(codeBlockMatch[1]!.trim());
      return codeBlockMatch[1]!.trim();
    } catch {
      // Not the payload. Fall through to the looser strategies.
    }
  }

  cleaned = cleaned
    .replace(/```(?:json)?\s*/g, "")
    .replace(/```/g, "")
    .trim();

  try {
    JSON.parse(cleaned);
    return cleaned;
  } catch {
    // Still wrapped in prose.
  }

  // The first balanced-looking object or array. Greedy on purpose: the payload
  // is usually the largest structure present, and a lazy match would stop at
  // the first nested closing brace.
  const jsonMatch = cleaned.match(/(\{[\s\S]*\}|\[[\s\S]*\])/);
  if (jsonMatch) {
    try {
      JSON.parse(jsonMatch[1]!);
      return jsonMatch[1]!;
    } catch {
      // Nothing parseable. The caller reports the raw reply, which is more
      // useful than a guess.
    }
  }

  return cleaned;
}
