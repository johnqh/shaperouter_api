/**
 * @fileoverview ShapeRouter's provider credentials: one LlmApiKey per endpoint
 * @description The only code outside routes/keys.ts and routes/provider-sync.ts
 * that reads llm_api_keys. Error messages and statuses are the ones
 * endpoints.ts and ai.ts returned before the service extraction.
 */

import { and, eq } from "drizzle-orm";
import type {
  Encryption,
  ProviderCredentialResolver,
} from "@sudobility/shapeshyft_service";
import { db as appDb, llmApiKeys } from "../db";

export const LLM_KEY_NOT_OWNED =
  "LLM key not found or doesn't belong to this entity";
export const LLM_KEY_INACTIVE = "LLM API key not found or inactive";

export function createLlmKeyCredentialResolver(opts: {
  db: typeof appDb;
  encryption: Encryption;
  /** LM_STUDIO_TIMEOUT_MS; undefined leaves the engine's ten-minute default */
  lmStudioTimeoutMs?: number;
}): ProviderCredentialResolver {
  const { db, encryption } = opts;

  async function ownedKey(entityId: string, keyId: string) {
    const rows = await db
      .select()
      .from(llmApiKeys)
      .where(
        and(eq(llmApiKeys.entity_id, entityId), eq(llmApiKeys.uuid, keyId))
      );
    return rows[0] ?? null;
  }

  return {
    async bindEndpoint({ entityId, body, current }) {
      const requested = body.llm_key_id as string | undefined;

      // An update that leaves the key alone keeps it, as before. The provider
      // is re-read only if this row predates the provider column.
      if (
        current?.llm_key_id &&
        (requested === undefined || requested === current.llm_key_id)
      ) {
        if (current.provider) {
          return {
            ok: true,
            provider: current.provider,
            llmKeyId: current.llm_key_id,
          };
        }
        const key = await ownedKey(entityId, current.llm_key_id);
        if (key)
          return { ok: true, provider: key.provider, llmKeyId: key.uuid };
      }

      // zod requires llm_key_id on create, so `requested` is set on that path
      const key = requested ? await ownedKey(entityId, requested) : null;
      if (!key) {
        return { ok: false, status: 400, message: LLM_KEY_NOT_OWNED };
      }
      return { ok: true, provider: key.provider, llmKeyId: key.uuid };
    },

    async resolve({ endpoint }) {
      // Not scoped by entity, exactly as before: the binding was checked when
      // it was written, and the foreign key holds it.
      const rows = endpoint.llm_key_id
        ? await db
            .select()
            .from(llmApiKeys)
            .where(
              and(
                eq(llmApiKeys.uuid, endpoint.llm_key_id),
                eq(llmApiKeys.is_active, true)
              )
            )
        : [];
      const key = rows[0];
      if (!key) {
        return { ok: false, status: 500, message: LLM_KEY_INACTIVE };
      }

      return {
        ok: true,
        provider: key.provider,
        apiKey:
          key.encrypted_api_key && key.encryption_iv
            ? encryption.decryptApiKey(key.encrypted_api_key, key.encryption_iv)
            : undefined,
        endpointUrl: key.endpoint_url ?? undefined,
        timeoutMs: opts.lmStudioTimeoutMs,
      };
    },
  };
}
