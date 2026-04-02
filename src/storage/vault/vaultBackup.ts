/**
 * Password-protected vault backup / restore.
 *
 * The backup file contains all Ed25519 private scalars, key-ID mappings, and
 * DID records encrypted with AES-GCM-256. The encryption key is derived from a
 * user-supplied password via PBKDF2-SHA-256 (600 000 iterations).
 *
 * The WebAuthn credential record is deliberately excluded — it is device-bound
 * and cannot be transferred. On restore the user registers a fresh passkey,
 * which derives a new vault key used to re-encrypt the imported keys.
 */

import { decodeB64, encodeB64 } from "@iota/identity-wasm/web";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface BackupKey {
  keyId: string;
  d: string;    // base64url raw 32-byte Ed25519 private scalar
  x: string;    // base64url raw 32-byte public key
  alg: string;  // "EdDSA"
}

export interface BackupPayload {
  keys:   BackupKey[];
  keyIds: { digest: string; keyId: string }[];
  dids:   { did: string; address: string; network: string }[];
}

export interface VaultBackupFile {
  version: 1;
  created: string;
  kdf: {
    algorithm: "PBKDF2";
    hash: "SHA-256";
    iterations: number;
    salt: string; // base64url 16 B
  };
  iv:      string; // base64url 12 B
  payload: string; // base64url AES-GCM ciphertext
}

// ── Constants ─────────────────────────────────────────────────────────────────

const PBKDF2_ITERATIONS = 600_000;

// ── Helpers ───────────────────────────────────────────────────────────────────

function b64ToBuffer(b64: string): ArrayBuffer {
  return decodeB64(new TextEncoder().encode(b64)).buffer as ArrayBuffer;
}

function bufToB64(buf: ArrayBuffer): string {
  return encodeB64(new Uint8Array(buf));
}

async function deriveBackupKey(password: string, salt: ArrayBuffer): Promise<CryptoKey> {
  const passwordKey = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveKey"],
  );
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", hash: "SHA-256", salt, iterations: PBKDF2_ITERATIONS },
    passwordKey,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Encrypt a vault payload with a password-derived key.
 * Returns a JSON-serialisable backup file object.
 */
export async function encryptBackup(
  payload: BackupPayload,
  password: string,
): Promise<VaultBackupFile> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv   = crypto.getRandomValues(new Uint8Array(12));
  const key  = await deriveBackupKey(password, salt.buffer as ArrayBuffer);

  const plaintext = new TextEncoder().encode(JSON.stringify(payload));
  const ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, plaintext);

  return {
    version: 1,
    created: new Date().toISOString(),
    kdf: {
      algorithm: "PBKDF2",
      hash: "SHA-256",
      iterations: PBKDF2_ITERATIONS,
      salt: bufToB64(salt.buffer as ArrayBuffer),
    },
    iv:      bufToB64(iv.buffer as ArrayBuffer),
    payload: bufToB64(ciphertext),
  };
}

/**
 * Decrypt a backup file with the user's password.
 * Throws if the password is wrong or the file is corrupt.
 */
export async function decryptBackup(
  file: VaultBackupFile,
  password: string,
): Promise<BackupPayload> {
  if (file.version !== 1) {
    throw new Error(`Unsupported backup version: ${file.version}`);
  }

  const salt       = b64ToBuffer(file.kdf.salt);
  const iv         = b64ToBuffer(file.iv);
  const ciphertext = b64ToBuffer(file.payload);
  const key        = await deriveBackupKey(password, salt);

  let plaintext: ArrayBuffer;
  try {
    plaintext = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, ciphertext);
  } catch {
    throw new Error("Decryption failed — wrong password or corrupt backup file.");
  }

  return JSON.parse(new TextDecoder().decode(plaintext)) as BackupPayload;
}
