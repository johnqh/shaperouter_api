/**
 * Storage utilities for uploading generated media to user-provided cloud storage.
 * Supports Google Cloud Storage (GCS) and AWS S3.
 */

import { Storage } from "@google-cloud/storage";
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  type PutObjectCommandInput,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { decryptApiKey } from "./encryption";
import { db } from "../db";
import { entityStorageConfigs } from "../db/schema";
import { eq } from "drizzle-orm";

// =============================================================================
// Types
// =============================================================================

export type StorageProvider = "gcs" | "s3";

/**
 * Google Cloud Storage service account credentials
 */
export interface GCSCredentials {
  type: "service_account";
  project_id: string;
  private_key_id: string;
  private_key: string;
  client_email: string;
  client_id: string;
  auth_uri?: string;
  token_uri?: string;
  auth_provider_x509_cert_url?: string;
  client_x509_cert_url?: string;
}

/**
 * AWS S3 credentials
 */
export interface S3Credentials {
  access_key_id: string;
  secret_access_key: string;
  region: string;
}

export type StorageCredentials = GCSCredentials | S3Credentials;

/**
 * Storage configuration for an entity
 */
export interface StorageConfig {
  uuid: string;
  entity_id: string;
  provider: StorageProvider;
  bucket: string;
  path_prefix: string | null;
  created_at: Date | null;
  updated_at: Date | null;
}

// =============================================================================
// Configuration Retrieval
// =============================================================================

/**
 * Get storage configuration for an entity.
 * Returns null if no storage is configured.
 */
export async function getEntityStorageConfig(
  entityId: string
): Promise<StorageConfig | null> {
  const config = await db.query.entityStorageConfigs.findFirst({
    where: eq(entityStorageConfigs.entity_id, entityId),
  });

  if (!config) {
    return null;
  }

  return {
    uuid: config.uuid,
    entity_id: config.entity_id,
    provider: config.provider as StorageProvider,
    bucket: config.bucket,
    path_prefix: config.path_prefix,
    created_at: config.created_at,
    updated_at: config.updated_at,
  };
}

/**
 * Decrypt storage credentials for an entity.
 * Throws if no storage is configured.
 */
async function getDecryptedCredentials(
  entityId: string
): Promise<{ config: StorageConfig; credentials: StorageCredentials }> {
  const dbConfig = await db.query.entityStorageConfigs.findFirst({
    where: eq(entityStorageConfigs.entity_id, entityId),
  });

  if (!dbConfig) {
    throw new Error("No storage configuration found for entity");
  }

  if (!dbConfig.encrypted_credentials || !dbConfig.encryption_iv) {
    throw new Error("Storage credentials are not configured");
  }

  const decrypted = decryptApiKey(
    dbConfig.encrypted_credentials,
    dbConfig.encryption_iv
  );
  const credentials = JSON.parse(decrypted) as StorageCredentials;

  return {
    config: {
      uuid: dbConfig.uuid,
      entity_id: dbConfig.entity_id,
      provider: dbConfig.provider as StorageProvider,
      bucket: dbConfig.bucket,
      path_prefix: dbConfig.path_prefix,
      created_at: dbConfig.created_at,
      updated_at: dbConfig.updated_at,
    },
    credentials,
  };
}

// =============================================================================
// Upload Functions
// =============================================================================

/**
 * Upload media to user-provided cloud storage.
 * Returns a signed URL for accessing the uploaded file.
 *
 * @param entityId - Entity ID for storage lookup
 * @param data - Binary data to upload
 * @param mimeType - MIME type of the data
 * @param filename - Filename for the uploaded file
 * @returns Signed URL for the uploaded file
 */
export async function uploadToUserStorage(
  entityId: string,
  data: Buffer,
  mimeType: string,
  filename: string
): Promise<string> {
  const { config, credentials } = await getDecryptedCredentials(entityId);

  if (config.provider === "gcs") {
    return uploadToGCS(
      credentials as GCSCredentials,
      config.bucket,
      config.path_prefix,
      data,
      mimeType,
      filename
    );
  } else if (config.provider === "s3") {
    return uploadToS3(
      credentials as S3Credentials,
      config.bucket,
      config.path_prefix,
      data,
      mimeType,
      filename
    );
  } else {
    throw new Error(`Unsupported storage provider: ${config.provider}`);
  }
}

/**
 * Upload to Google Cloud Storage and return a signed URL.
 */
async function uploadToGCS(
  credentials: GCSCredentials,
  bucket: string,
  prefix: string | null,
  data: Buffer,
  mimeType: string,
  filename: string
): Promise<string> {
  const storage = new Storage({ credentials });
  const path = prefix ? `${prefix}/${filename}` : filename;
  const file = storage.bucket(bucket).file(path);

  await file.save(data, {
    contentType: mimeType,
    metadata: {
      cacheControl: "public, max-age=31536000", // 1 year cache
    },
  });

  // Generate signed URL valid for 7 days
  const [url] = await file.getSignedUrl({
    action: "read",
    expires: Date.now() + 7 * 24 * 60 * 60 * 1000, // 7 days
  });

  return url;
}

/**
 * Upload to AWS S3 and return a signed URL.
 */
async function uploadToS3(
  credentials: S3Credentials,
  bucket: string,
  prefix: string | null,
  data: Buffer,
  mimeType: string,
  filename: string
): Promise<string> {
  const client = new S3Client({
    region: credentials.region,
    credentials: {
      accessKeyId: credentials.access_key_id,
      secretAccessKey: credentials.secret_access_key,
    },
  });

  const key = prefix ? `${prefix}/${filename}` : filename;

  const putParams: PutObjectCommandInput = {
    Bucket: bucket,
    Key: key,
    Body: data,
    ContentType: mimeType,
    CacheControl: "public, max-age=31536000", // 1 year cache
  };

  await client.send(new PutObjectCommand(putParams));

  // Generate signed URL valid for 7 days
  const getCommand = new GetObjectCommand({
    Bucket: bucket,
    Key: key,
  });

  const url = await getSignedUrl(client, getCommand, {
    expiresIn: 7 * 24 * 60 * 60, // 7 days in seconds
  });

  return url;
}

// =============================================================================
// Validation Helpers
// =============================================================================

/**
 * Check if an entity has storage configured.
 */
export async function hasStorageConfig(entityId: string): Promise<boolean> {
  const config = await getEntityStorageConfig(entityId);
  return config !== null;
}

/**
 * Validate that storage is configured when URL output format is requested.
 * Returns an error message if validation fails, null otherwise.
 */
export async function validateStorageForUrlOutput(
  entityId: string,
  outputMediaFormat: string | null | undefined
): Promise<string | null> {
  if (outputMediaFormat !== "url") {
    return null; // No validation needed for base64
  }

  const hasConfig = await hasStorageConfig(entityId);
  if (!hasConfig) {
    return "Storage configuration required for URL output format. Configure cloud storage in entity settings.";
  }

  return null;
}

/**
 * Generate a unique filename for uploaded media.
 */
export function generateMediaFilename(
  mediaType: "image" | "audio" | "video",
  mimeType: string
): string {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 8);
  const extension = getExtensionFromMime(mimeType);
  return `${mediaType}_${timestamp}_${random}.${extension}`;
}

/**
 * Get file extension from MIME type.
 */
function getExtensionFromMime(mimeType: string): string {
  const mimeToExt: Record<string, string> = {
    // Images
    "image/png": "png",
    "image/jpeg": "jpg",
    "image/gif": "gif",
    "image/webp": "webp",
    // Audio
    "audio/mp3": "mp3",
    "audio/mpeg": "mp3",
    "audio/wav": "wav",
    "audio/ogg": "ogg",
    "audio/flac": "flac",
    "audio/m4a": "m4a",
    // Video
    "video/mp4": "mp4",
    "video/webm": "webm",
    "video/quicktime": "mov",
  };

  return mimeToExt[mimeType] ?? mimeType.split("/")[1] ?? "bin";
}
