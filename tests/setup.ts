/**
 * Test setup file
 * Sets up environment variables and other test configuration
 */

// Set test mode - MUST be set before any imports
process.env.NODE_ENV = "test";

// Use test database - only set if not already configured (allows CI to override)
if (!process.env.DATABASE_URL) {
  process.env.DATABASE_URL = "postgres://localhost:5432/shaperouter_test";
}

if (!process.env.ENCRYPTION_KEY) {
  // Test encryption key (32 bytes = 64 hex chars)
  process.env.ENCRYPTION_KEY =
    "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
}

if (!process.env.FIREBASE_PROJECT_ID) {
  process.env.FIREBASE_PROJECT_ID = "test-project";
}

if (!process.env.FIREBASE_CLIENT_EMAIL) {
  process.env.FIREBASE_CLIENT_EMAIL = "test@test-project.iam.gserviceaccount.com";
}

if (!process.env.FIREBASE_PRIVATE_KEY) {
  // Dummy private key for testing (won't actually work with Firebase)
  process.env.FIREBASE_PRIVATE_KEY = "test-private-key";
}

console.log("Test environment configured (NODE_ENV=test)");
