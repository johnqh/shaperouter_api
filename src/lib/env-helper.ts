/**
 * @fileoverview This process's environment
 * @description `.env.local` takes priority over the environment, via the
 * shared reader in @sudobility/shapeshyft_service.
 */

import { createEnvReader } from "@sudobility/shapeshyft_service";

export const env = createEnvReader({ processEnv: process.env });
export const getEnv = env.get;
export const getRequiredEnv = env.getRequired;
