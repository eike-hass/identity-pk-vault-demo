/** Typed IndexedDB wrapper for the IOTA Identity key vault. */

const DB_NAME = "iota-identity-vault";
const DB_VERSION = 3;

// ── Record shapes ─────────────────────────────────────────────────────────────

export interface CredentialRecord {
  id: "passkey";
  credentialId: ArrayBuffer;
  rpId: string;
  prfSalt: ArrayBuffer;
}

export interface JwkRecord {
  keyId: string;
  encryptedD: ArrayBuffer; // AES-GCM ciphertext of the 32-byte Ed25519 private scalar
  iv: ArrayBuffer;         // 12-byte GCM initialisation vector
  alg: string;             // "EdDSA"
  x: string;               // base64url-encoded public key (not secret)
}

export interface KeyIdRecord {
  digest: string; // base64url(MethodDigest.pack())
  keyId: string;
}

export interface DidRecord {
  did: string;     // primary key — the DID string itself (globally unique)
  address: string; // wallet address that owns it
  network: string; // network it was created on
}

// ── Store names ───────────────────────────────────────────────────────────────

const STORE_CREDENTIAL = "credential";
const STORE_JWKS = "jwks";
const STORE_KEY_IDS = "keyIds";
const STORE_DIDS = "dids";

// ── Open / upgrade ────────────────────────────────────────────────────────────

let _db: IDBDatabase | null = null;

export async function openVaultDb(): Promise<IDBDatabase> {
  if (_db) return _db;

  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);

    req.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_CREDENTIAL)) {
        db.createObjectStore(STORE_CREDENTIAL, { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains(STORE_JWKS)) {
        db.createObjectStore(STORE_JWKS, { keyPath: "keyId" });
      }
      if (!db.objectStoreNames.contains(STORE_KEY_IDS)) {
        db.createObjectStore(STORE_KEY_IDS, { keyPath: "digest" });
      }
      // v3: recreate dids store with DID as primary key + compound account index.
      // Drop the v2 store (keyPath:"id") if it exists before recreating.
      if (db.objectStoreNames.contains(STORE_DIDS)) {
        db.deleteObjectStore(STORE_DIDS);
      }
      const didStore = db.createObjectStore(STORE_DIDS, { keyPath: "did" });
      didStore.createIndex("by_account", ["address", "network"], { unique: false });
    };

    req.onsuccess = () => {
      _db = req.result;
      resolve(_db);
    };

    req.onerror = () => reject(new Error(`Failed to open vault database: ${req.error?.message}`));
  });
}

// ── Generic helpers ───────────────────────────────────────────────────────────

function idbGet<T>(db: IDBDatabase, store: string, key: IDBValidKey): Promise<T | undefined> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, "readonly");
    const req = tx.objectStore(store).get(key);
    req.onsuccess = () => resolve(req.result as T | undefined);
    req.onerror = () => reject(req.error);
  });
}

function idbPut(db: IDBDatabase, store: string, value: unknown): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, "readwrite");
    const req = tx.objectStore(store).put(value);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

function idbDelete(db: IDBDatabase, store: string, key: IDBValidKey): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, "readwrite");
    const req = tx.objectStore(store).delete(key);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

// ── Typed store accessors ─────────────────────────────────────────────────────

export async function getCredential(db: IDBDatabase): Promise<CredentialRecord | undefined> {
  return idbGet<CredentialRecord>(db, STORE_CREDENTIAL, "passkey");
}

export async function putCredential(db: IDBDatabase, record: CredentialRecord): Promise<void> {
  return idbPut(db, STORE_CREDENTIAL, record);
}

export async function getJwk(db: IDBDatabase, keyId: string): Promise<JwkRecord | undefined> {
  return idbGet<JwkRecord>(db, STORE_JWKS, keyId);
}

export async function putJwk(db: IDBDatabase, record: JwkRecord): Promise<void> {
  return idbPut(db, STORE_JWKS, record);
}

export async function deleteJwk(db: IDBDatabase, keyId: string): Promise<void> {
  return idbDelete(db, STORE_JWKS, keyId);
}

export async function getKeyId(db: IDBDatabase, digest: string): Promise<KeyIdRecord | undefined> {
  return idbGet<KeyIdRecord>(db, STORE_KEY_IDS, digest);
}

export async function putKeyId(db: IDBDatabase, record: KeyIdRecord): Promise<void> {
  return idbPut(db, STORE_KEY_IDS, record);
}

export async function deleteKeyId(db: IDBDatabase, digest: string): Promise<void> {
  return idbDelete(db, STORE_KEY_IDS, digest);
}

function idbGetAll<T>(db: IDBDatabase, store: string): Promise<T[]> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, "readonly");
    const req = tx.objectStore(store).getAll();
    req.onsuccess = () => resolve(req.result as T[]);
    req.onerror = () => reject(req.error);
  });
}

export async function listJwks(db: IDBDatabase): Promise<JwkRecord[]> {
  return idbGetAll<JwkRecord>(db, STORE_JWKS);
}

export async function listKeyIds(db: IDBDatabase): Promise<KeyIdRecord[]> {
  return idbGetAll<KeyIdRecord>(db, STORE_KEY_IDS);
}

export async function listAllDids(db: IDBDatabase): Promise<DidRecord[]> {
  return idbGetAll<DidRecord>(db, STORE_DIDS);
}

/** Returns all DID strings owned by the given wallet address on the given network. */
export async function listDids(db: IDBDatabase, address: string, network: string): Promise<string[]> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_DIDS, "readonly");
    const req = tx.objectStore(STORE_DIDS).index("by_account").getAll(IDBKeyRange.only([address, network]));
    req.onsuccess = () => resolve((req.result as DidRecord[]).map((r) => r.did));
    req.onerror = () => reject(req.error);
  });
}

export async function putDid(db: IDBDatabase, address: string, network: string, did: string): Promise<void> {
  return idbPut(db, STORE_DIDS, { did, address, network });
}

export async function deleteDid(db: IDBDatabase, did: string): Promise<void> {
  return idbDelete(db, STORE_DIDS, did);
}
