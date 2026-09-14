/**
 * @fileoverview ShapeRouter's encryption instance
 * @description AES-256-CBC from @sudobility/shapeshyft_service, keyed by
 * ENCRYPTION_KEY. The key is read on each call, so a missing key fails on first
 * use, as it always has.
 */

import {
  createEncryption,
  generateEncryptionKey,
} from "@sudobility/shapeshyft_service";
import { getRequiredEnv } from "./env-helper";

export const encryption = createEncryption(() =>
  getRequiredEnv("ENCRYPTION_KEY")
);
export const { encryptApiKey, decryptApiKey } = encryption;
export { generateEncryptionKey };
