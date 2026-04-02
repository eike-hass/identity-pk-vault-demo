/**
 * Passkey-backed implementation of the IOTA Identity JwkStorage interface.
 *
 * Private key bytes (Ed25519 scalar, 32 bytes) are encrypted with AES-GCM-256
 * using a vault key derived from a WebAuthn PRF assertion. The vault key exists
 * only in memory for the duration of the current session; IndexedDB holds only
 * the ciphertext.
 *
 * Security properties:
 *  - Private key at rest: AES-GCM-256 encrypted, random IV per key
 *  - Encryption key: hardware-bound (WebAuthn PRF), non-extractable CryptoKey
 *  - Private key in memory: only during sign(), immediately eligible for GC
 *  - Auth factor: platform biometric or PIN via WebAuthn (phishing-resistant)
 */

import * as ed from "@noble/ed25519";
import {
  Jwk,
  JwkGenOutput,
  decodeB64,
  encodeB64,
} from "@iota/identity-wasm/web";
import type { JwsAlgorithm } from "@iota/identity-wasm/web";
import {
  deleteJwk,
  getJwk,
  listAllDids,
  listJwks,
  listKeyIds,
  openVaultDb,
  putDid,
  putJwk,
  putKeyId,
  type JwkRecord,
} from "./vault/vaultDb";
import {
  type BackupPayload,
  type VaultBackupFile,
  decryptBackup,
  encryptBackup,
} from "./vault/vaultBackup";
import {
  isPasskeyRegistered,
  isPrfSupported,
  registerPasskey,
  unlockWithPasskey,
} from "./vault/passkeyAuth";

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Copy arbitrary typed-array bytes into a plain ArrayBuffer for WebCrypto. */
function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

// ── Ed25519 key type constant ─────────────────────────────────────────────────

const ED25519_KEY_TYPE = "Ed25519";

// ── Helper: build a public-only JWK from raw bytes ───────────────────────────

function buildPublicJwk(publicBytes: Uint8Array<ArrayBuffer>, alg: JwsAlgorithm): Jwk {
  const jwk = new Jwk({
    kty: "OKP" as never,
    crv: "Ed25519",
    x: encodeB64(publicBytes),
    alg,
  });
  return jwk;
}

// ── PasskeyJwkStorage ─────────────────────────────────────────────────────────

export class PasskeyJwkStorage {
  private constructor(
    private readonly vaultKey: CryptoKey,
    private readonly db: IDBDatabase,
  ) {}

  // ── Lifecycle ───────────────────────────────────────────────────────────────

  /** Returns true if the PRF extension is available in this browser. */
  static isPrfSupported(): boolean {
    return isPrfSupported();
  }

  /** Returns true if a Passkey credential has been registered for this origin. */
  static async isRegistered(): Promise<boolean> {
    return isPasskeyRegistered();
  }

  /**
   * Register a new Passkey, derive the vault key from its PRF output, and
   * return an unlocked `PasskeyJwkStorage` instance.
   */
  static async register(rpName = "IOTA Identity Manager"): Promise<PasskeyJwkStorage> {
    const vaultKey = await registerPasskey(rpName);
    const db = await openVaultDb();
    return new PasskeyJwkStorage(vaultKey, db);
  }

  /**
   * Authenticate with an existing Passkey, re-derive the vault key, and
   * return an unlocked `PasskeyJwkStorage` instance.
   */
  static async unlock(): Promise<PasskeyJwkStorage> {
    const vaultKey = await unlockWithPasskey();
    const db = await openVaultDb();
    return new PasskeyJwkStorage(vaultKey, db);
  }

  /** The key type string to pass to {@link JwkStorage.generate} for Ed25519. */
  static ed25519KeyType(): string {
    return ED25519_KEY_TYPE;
  }

  // ── JwkStorage interface ────────────────────────────────────────────────────

  /**
   * Generate a new Ed25519 key, encrypt the private scalar with the vault key,
   * persist the ciphertext to IndexedDB, and return the public JWK.
   */
  async generate(keyType: string, algorithm: JwsAlgorithm): Promise<JwkGenOutput> {
    if (keyType !== ED25519_KEY_TYPE) {
      throw new Error(`PasskeyJwkStorage only supports key type "${ED25519_KEY_TYPE}"; got "${keyType}".`);
    }

    // Generate Ed25519 keypair (@noble/ed25519 v3 API).
    const { secretKey: privateKey, publicKey } = await ed.keygenAsync();

    // Build the public-only JWK; its SHA-256 thumbprint is used as the key ID.
    const publicJwk = buildPublicJwk(publicKey as Uint8Array<ArrayBuffer>, algorithm);
    const keyId = publicJwk.thumbprintSha256B64();
    publicJwk.setKid(keyId);

    // Encrypt the private scalar with AES-GCM (fresh random IV).
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const encryptedD = await crypto.subtle.encrypt(
      { name: "AES-GCM", iv },
      this.vaultKey,
      toArrayBuffer(privateKey),
    );

    // Persist encrypted record — no plaintext private key bytes on disk.
    const record: JwkRecord = {
      keyId,
      encryptedD,
      iv: iv.buffer as ArrayBuffer,
      alg: algorithm as string,
      x: encodeB64(publicKey as Uint8Array<ArrayBuffer>),
    };
    await putJwk(this.db, record);

    return new JwkGenOutput(keyId, publicJwk);
  }

  /**
   * Import an existing private JWK (e.g. from a backup), encrypting its
   * private scalar before storing.
   */
  async insert(jwk: Jwk): Promise<string> {
    const params = jwk.paramsOkp();
    if (!params?.d) throw new Error("insert() requires a private JWK (missing 'd' component).");

    const privateKey = decodeB64(new TextEncoder().encode(params.d));
    const publicKey = await ed.getPublicKeyAsync(privateKey as Uint8Array<ArrayBuffer>);

    const alg = jwk.alg() ?? ("EdDSA" as JwsAlgorithm);
    const publicJwk = buildPublicJwk(new Uint8Array(toArrayBuffer(publicKey as Uint8Array)), alg);
    const keyId = publicJwk.thumbprintSha256B64();
    publicJwk.setKid(keyId);

    if (await this.exists(keyId)) return keyId; // idempotent

    const iv = crypto.getRandomValues(new Uint8Array(12));
    // Ensure the key bytes live in a plain ArrayBuffer (not SharedArrayBuffer)
    // before passing to WebCrypto's encrypt/decrypt.
    const encryptedD = await crypto.subtle.encrypt(
      { name: "AES-GCM", iv },
      this.vaultKey,
      toArrayBuffer(privateKey),
    );

    await putJwk(this.db, {
      keyId,
      encryptedD,
      iv: iv.buffer as ArrayBuffer,
      alg: alg as string,
      x: encodeB64(publicKey as Uint8Array<ArrayBuffer>),
    });

    return keyId;
  }

  /**
   * Sign `data` with the Ed25519 key identified by `keyId`.
   * Decrypts the private scalar from IndexedDB, signs, then lets it go out of
   * scope (no explicit zeroing — JS GC will collect it).
   */
  async sign(keyId: string, data: Uint8Array, _publicKey: Jwk): Promise<Uint8Array> {
    const record = await getJwk(this.db, keyId);
    if (!record) throw new Error(`Key "${keyId}" not found in vault.`);

    const iv = new Uint8Array(record.iv);
    const privateKeyBuf = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv },
      this.vaultKey,
      record.encryptedD,
    );

    return ed.signAsync(data, new Uint8Array(privateKeyBuf));
  }

  /** Delete the key identified by `keyId` from the vault. */
  async delete(keyId: string): Promise<void> {
    await deleteJwk(this.db, keyId);
  }

  /** Returns true if the key exists in the vault. */
  async exists(keyId: string): Promise<boolean> {
    const record = await getJwk(this.db, keyId);
    return record !== undefined;
  }

  // ── Backup / restore ────────────────────────────────────────────────────────

  /**
   * Export all vault data (keys, key-ID mappings, DIDs) as a password-protected
   * JSON backup file string. Private key bytes are decrypted from the vault and
   * re-encrypted with a PBKDF2-derived key — they are never written to disk in
   * cleartext.
   */
  async exportBackup(password: string): Promise<string> {
    const [jwkRecords, keyIdRecords, didRecords] = await Promise.all([
      listJwks(this.db),
      listKeyIds(this.db),
      listAllDids(this.db),
    ]);

    const keys = await Promise.all(
      jwkRecords.map(async (r) => {
        const iv = new Uint8Array(r.iv);
        const rawD = await crypto.subtle.decrypt(
          { name: "AES-GCM", iv },
          this.vaultKey,
          r.encryptedD,
        );
        return {
          keyId: r.keyId,
          d: encodeB64(new Uint8Array(rawD)),
          x: r.x,
          alg: r.alg,
        };
      }),
    );

    const payload: BackupPayload = {
      keys,
      keyIds: keyIdRecords,
      dids: didRecords,
    };

    const file: VaultBackupFile = await encryptBackup(payload, password);
    return JSON.stringify(file, null, 2);
  }

  /**
   * Import keys, key-ID mappings, and DIDs from a password-protected backup
   * file. Each key is re-encrypted under the current vault key before storage.
   * Already-existing records are skipped (idempotent).
   *
   * Returns the number of new keys written.
   */
  async importBackup(json: string, password: string): Promise<{ keysImported: number }> {
    const file = JSON.parse(json) as VaultBackupFile;
    const payload = await decryptBackup(file, password);

    let keysImported = 0;
    for (const k of payload.keys) {
      const jwk = new Jwk({
        kty: "OKP" as never,
        crv: "Ed25519",
        x: k.x,
        d: k.d,
        alg: k.alg as never,
      });
      const id = await this.insert(jwk); // idempotent — skips if keyId exists
      if (id === k.keyId) keysImported++;
    }

    for (const r of payload.keyIds) {
      await putKeyId(this.db, r);
    }
    for (const r of payload.dids) {
      await putDid(this.db, r.address, r.network, r.did);
    }

    return { keysImported };
  }
}
