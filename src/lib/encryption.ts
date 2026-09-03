/**
 * @fileoverview AES-256-CBC encryption utilities
 * @description Encrypts and decrypts API keys and storage credentials at rest.
 * Uses a 32-byte encryption key from the ENCRYPTION_KEY environment variable.
 */

import { createCipheriv, createDecipheriv, randomBytes } from "crypto";
import { getRequiredEnv } from "./env-helper";

// AES-256-CBC encryption
const ALGORITHM = "aes-256-cbc";
const IV_LENGTH = 16; // AES block size

/**
 * Get the encryption key from environment.
 * Must be exactly 32 bytes (256 bits) for AES-256.
 * Store as hex string in env: ENCRYPTION_KEY=<64 hex chars>
 */
function getEncryptionKey(): Buffer {
  const keyHex = getRequiredEnv("ENCRYPTION_KEY");
  if (keyHex.length !== 64) {
    throw new Error("ENCRYPTION_KEY must be 64 hex characters (32 bytes)");
  }
  return Buffer.from(keyHex, "hex");
}

/**
 * Encrypt an API key using AES-256-CBC
 * @param plainText The plain text API key
 * @returns Object with encrypted value and IV (both as hex strings)
 */
export function encryptApiKey(plainText: string): {
  encrypted: string;
  iv: string;
} {
  const key = getEncryptionKey();
  const iv = randomBytes(IV_LENGTH);

  const cipher = createCipheriv(ALGORITHM, key, iv);
  let encrypted = cipher.update(plainText, "utf8", "hex");
  encrypted += cipher.final("hex");

  return {
    encrypted,
    iv: iv.toString("hex"),
  };
}

/**
 * Decrypt an API key using AES-256-CBC
 * @param encrypted The encrypted API key (hex string)
 * @param ivHex The initialization vector (hex string)
 * @returns The decrypted plain text API key
 */
export function decryptApiKey(encrypted: string, ivHex: string): string {
  const key = getEncryptionKey();
  const iv = Buffer.from(ivHex, "hex");

  const decipher = createDecipheriv(ALGORITHM, key, iv);
  let decrypted = decipher.update(encrypted, "hex", "utf8");
  decrypted += decipher.final("utf8");

  return decrypted;
}

/**
 * Generate a new encryption key (for initial setup)
 * @returns A 64-character hex string suitable for ENCRYPTION_KEY env var
 */
export function generateEncryptionKey(): string {
  return randomBytes(32).toString("hex");
}
