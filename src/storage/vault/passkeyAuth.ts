/**
 * WebAuthn PRF-based key derivation for the IOTA Identity key vault.
 *
 * The WebAuthn PRF extension (FIDO2 pseudo-random function) allows deriving a
 * deterministic symmetric secret from a Passkey without ever exposing the
 * authenticator's private key. We use this secret as the root of an HKDF
 * derivation to produce a per-session AES-GCM-256 vault key.
 *
 * Browser support (2025):
 *   Chrome / Edge 116+  ✓
 *   Safari 17.4+        ✓  (partial — conditional mediation may differ)
 *   Firefox 139+        ✓  (desktop platforms; released May 2025)
 *
 * Chrome behaviour note: during *registration* Chrome returns prf.enabled=true
 * but no results.first. A separate get() call is required to obtain the PRF
 * output. Firefox returns results.first during registration directly.
 */

import {
  getCredential,
  openVaultDb,
  putCredential,
} from "./vaultDb";

// HKDF domain separation values.
const HKDF_SALT = new TextEncoder().encode("iota-identity-vault");
const HKDF_INFO = new TextEncoder().encode("vault-key-v1");

// ── Capability detection ──────────────────────────────────────────────────────

/**
 * Returns true if the browser supports WebAuthn and the PRF extension.
 * We probe support by checking the PublicKeyCredential API; actual PRF
 * availability is only confirmed during a credential operation.
 */
export function isPrfSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.PublicKeyCredential !== "undefined" &&
    typeof navigator.credentials?.create === "function"
  );
}

// ── Key derivation ────────────────────────────────────────────────────────────

async function deriveVaultKey(prfOutput: ArrayBuffer): Promise<CryptoKey> {
  const keyMaterial = await crypto.subtle.importKey("raw", prfOutput, "HKDF", false, [
    "deriveKey",
  ]);
  return crypto.subtle.deriveKey(
    { name: "HKDF", hash: "SHA-256", salt: HKDF_SALT, info: HKDF_INFO },
    keyMaterial,
    { name: "AES-GCM", length: 256 },
    false, // non-extractable — the key cannot be read back from memory
    ["encrypt", "decrypt"],
  );
}

// ── PRF result helpers ────────────────────────────────────────────────────────

// The types for the PRF extension are not yet in the standard lib.d.ts.
interface PrfResults {
  prf?: { enabled?: boolean; results?: { first?: ArrayBuffer } };
}

function getPrfOutput(credential: PublicKeyCredential): ArrayBuffer | undefined {
  return (credential.getClientExtensionResults() as PrfResults).prf?.results?.first;
}

function isPrfEnabled(credential: PublicKeyCredential): boolean {
  const ext = credential.getClientExtensionResults() as PrfResults;
  return !!(ext.prf?.enabled || ext.prf?.results?.first);
}

// ── Registration ──────────────────────────────────────────────────────────────

/**
 * Create a new Passkey for this origin and derive the AES-GCM vault key from
 * its PRF output. Persists the credential metadata to IndexedDB so subsequent
 * sessions can re-derive the same vault key without storing it.
 *
 * Throws if PRF is not supported by the authenticator.
 */
export async function registerPasskey(rpName: string): Promise<CryptoKey> {
  const prfSalt = crypto.getRandomValues(new Uint8Array(32));
  const rpId = window.location.hostname;

  const credential = (await navigator.credentials.create({
    publicKey: {
      challenge: crypto.getRandomValues(new Uint8Array(32)),
      rp: { name: rpName, id: rpId },
      user: {
        // A fixed user handle — we treat the vault as a single unnamed user.
        id: new Uint8Array([0x49, 0x4f, 0x54, 0x41]), // "IOTA" in bytes
        name: "key-vault",
        displayName: "IOTA Identity Key Vault",
      },
      pubKeyCredParams: [
        { type: "public-key", alg: -7 },  // ES256  (Chrome / Windows Hello preferred)
        { type: "public-key", alg: -8 },  // EdDSA
      ],
      authenticatorSelection: {
        // Do not restrict to platform authenticators — cross-device authenticators
        // (e.g. Google Password Manager via QR, iCloud Keychain on another device)
        // also support the PRF extension in Chrome/Edge and must not be excluded.
        residentKey: "required",
        userVerification: "required",
      },
      extensions: {
        prf: { eval: { first: prfSalt } },
      } as AuthenticationExtensionsClientInputs,
    },
  })) as PublicKeyCredential | null;

  if (!credential) throw new Error("Passkey registration was cancelled.");

  if (!isPrfEnabled(credential)) {
    throw new Error(
      "The selected authenticator does not support the PRF extension. " +
        "Please use a platform authenticator (Touch ID, Windows Hello, or Google Password Manager) " +
        "or a cross-device passkey in Chrome/Edge. " +
        "Firefox does not support PRF on cross-device (phone) passkeys.",
    );
  }

  // Persist credential record so unlock() can re-derive the same vault key.
  const db = await openVaultDb();
  await putCredential(db, {
    id: "passkey",
    credentialId: credential.rawId.slice(0), // copy as plain ArrayBuffer
    rpId,
    prfSalt: prfSalt.buffer.slice(0),        // copy as plain ArrayBuffer
  });

  // Firefox returns PRF output during registration; Chrome only sets
  // prf.enabled=true and requires a separate get() to obtain the output.
  const prfOutput = getPrfOutput(credential);
  if (prfOutput) {
    return deriveVaultKey(prfOutput);
  }
  return unlockWithPasskey();
}

// ── Unlock ────────────────────────────────────────────────────────────────────

/**
 * Authenticate with the stored Passkey and re-derive the vault key.
 * Throws if no credential has been registered or authentication fails.
 */
export async function unlockWithPasskey(): Promise<CryptoKey> {
  const db = await openVaultDb();
  const stored = await getCredential(db);
  if (!stored) throw new Error("No Passkey registered for this vault. Please create one first.");

  const credential = (await navigator.credentials.get({
    publicKey: {
      challenge: crypto.getRandomValues(new Uint8Array(32)),
      rpId: stored.rpId,
      allowCredentials: [{ type: "public-key", id: new Uint8Array(stored.credentialId) }],
      userVerification: "required",
      extensions: {
        prf: { eval: { first: new Uint8Array(stored.prfSalt) } },
      } as AuthenticationExtensionsClientInputs,
    },
  })) as PublicKeyCredential | null;

  if (!credential) throw new Error("Passkey authentication was cancelled.");

  const prfOutput = getPrfOutput(credential);
  if (!prfOutput) {
    throw new Error(
      "The Passkey authenticator does not support the PRF extension. " +
        "Try a different authenticator or browser.",
    );
  }
  return deriveVaultKey(prfOutput);
}

// ── Registration check ────────────────────────────────────────────────────────

/** Returns true if a Passkey credential has been registered for this origin. */
export async function isPasskeyRegistered(): Promise<boolean> {
  const db = await openVaultDb();
  const record = await getCredential(db);
  return record !== undefined;
}
