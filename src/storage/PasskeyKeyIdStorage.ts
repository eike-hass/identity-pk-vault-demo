/**
 * Persistent KeyIdStorage backed by IndexedDB.
 *
 * Key IDs and method digests contain no private cryptographic material, so
 * this store is kept in plaintext — encryption would add overhead with no
 * security benefit.
 *
 * The storage key is `base64url(MethodDigest.pack())`, mirroring the approach
 * used by the built-in `KeyIdMemStore`.
 */

import type { MethodDigest } from "@iota/identity-wasm/web";
import { encodeB64 } from "@iota/identity-wasm/web";
import { deleteKeyId, getKeyId, openVaultDb, putKeyId } from "./vault/vaultDb";

export class PasskeyKeyIdStorage {
  private constructor(private readonly db: IDBDatabase) {}

  static async open(): Promise<PasskeyKeyIdStorage> {
    const db = await openVaultDb();
    return new PasskeyKeyIdStorage(db);
  }

  // ── KeyIdStorage interface ──────────────────────────────────────────────────

  async insertKeyId(methodDigest: MethodDigest, keyId: string): Promise<void> {
    const digest = digestKey(methodDigest);
    const existing = await getKeyId(this.db, digest);
    if (existing) {
      throw new Error(`A key ID is already registered for this method digest.`);
    }
    await putKeyId(this.db, { digest, keyId });
  }

  async getKeyId(methodDigest: MethodDigest): Promise<string> {
    const digest = digestKey(methodDigest);
    const record = await getKeyId(this.db, digest);
    if (!record) {
      throw new Error(`No key ID found for method digest "${digest}".`);
    }
    return record.keyId;
  }

  async deleteKeyId(methodDigest: MethodDigest): Promise<void> {
    const digest = digestKey(methodDigest);
    const existing = await getKeyId(this.db, digest);
    if (!existing) {
      throw new Error(`No key ID found for method digest "${digest}".`);
    }
    await deleteKeyId(this.db, digest);
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function digestKey(methodDigest: MethodDigest): string {
  return encodeB64(methodDigest.pack());
}
