import { describe, it, expect, vi, beforeAll } from "vitest";
import * as ed from "@noble/ed25519";

// ── Mocks ─────────────────────────────────────────────────────────────────────

// Provide real base64url helpers plus minimal Jwk / JwkGenOutput stubs so the
// storage class never touches the uninitialised WASM binary.
vi.mock("@iota/identity-wasm/web", () => {
  function encodeB64(bytes: Uint8Array): string {
    let binary = "";
    bytes.forEach((b) => { binary += String.fromCharCode(b); });
    return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
  }

  function decodeB64(encoded: Uint8Array): Uint8Array {
    const str   = new TextDecoder().decode(encoded);
    const b64   = str.replace(/-/g, "+").replace(/_/g, "/");
    const pad   = b64 + "=".repeat((4 - (b64.length % 4)) % 4);
    const bin   = atob(pad);
    return new Uint8Array(Array.from(bin, (c) => c.charCodeAt(0)));
  }

  class Jwk {
    private _kid = "";
    private _data: Record<string, unknown>;
    constructor(data: Record<string, unknown>) { this._data = data; }
    // Use the x (public key) as a deterministic stand-in for a real thumbprint.
    thumbprintSha256B64(): string { return `thumb:${String(this._data.x ?? Math.random())}`; }
    setKid(kid: string): void { this._kid = kid; }
    paramsOkp(): { d: string } | null {
      return this._data.d ? { d: String(this._data.d) } : null;
    }
    alg(): string | null { return this._data.alg ? String(this._data.alg) : null; }
  }

  class JwkGenOutput {
    constructor(
      public readonly keyId: string,
      public readonly jwk: Jwk,
    ) {}
  }

  return { Jwk, JwkGenOutput, encodeB64, decodeB64 };
});

// Stub WebAuthn — register/unlock return a real AES-GCM-256 vault key so that
// the encrypt/decrypt cycle inside PasskeyJwkStorage uses genuine WebCrypto.
vi.mock("../../storage/vault/passkeyAuth", () => ({
  isPrfSupported:      vi.fn(() => true),
  isPasskeyRegistered: vi.fn().mockResolvedValue(false),
  registerPasskey:     vi.fn(),
  unlockWithPasskey:   vi.fn(),
}));

import { registerPasskey, unlockWithPasskey } from "../../storage/vault/passkeyAuth";
import { PasskeyJwkStorage } from "../../storage/PasskeyJwkStorage";
import { openVaultDb, getJwk } from "../../storage/vault/vaultDb";
import { encodeB64, decodeB64 } from "@iota/identity-wasm/web";

// ── Shared vault key ──────────────────────────────────────────────────────────

let vaultKey: CryptoKey;

beforeAll(async () => {
  vaultKey = await crypto.subtle.generateKey(
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
  vi.mocked(registerPasskey).mockResolvedValue(vaultKey);
  vi.mocked(unlockWithPasskey).mockResolvedValue(vaultKey);
});

// ── generate ──────────────────────────────────────────────────────────────────

describe("PasskeyJwkStorage — generate", () => {
  it("returns a JwkGenOutput with a non-empty keyId", async () => {
    const storage = await PasskeyJwkStorage.register();
    const result  = await storage.generate("Ed25519", "EdDSA" as never);
    expect(typeof result.keyId).toBe("string");
    expect(result.keyId.length).toBeGreaterThan(0);
  });

  it("stores an encrypted JWK record in IndexedDB", async () => {
    const storage = await PasskeyJwkStorage.register();
    const result  = await storage.generate("Ed25519", "EdDSA" as never);
    const keyId   = result.keyId as unknown as string;
    const db      = await openVaultDb();
    const record  = await getJwk(db, keyId);
    expect(record).toBeDefined();
    expect(record!.alg).toBe("EdDSA");
    // encryptedD and iv should be non-empty ArrayBuffers (not the plaintext key).
    expect(record!.encryptedD.byteLength).toBeGreaterThan(0);
    expect(record!.iv.byteLength).toBe(12);
  });

  it("uses a fresh IV each time so two generates produce different ciphertexts", async () => {
    const storage  = await PasskeyJwkStorage.register();
    const result1  = await storage.generate("Ed25519", "EdDSA" as never);
    const result2  = await storage.generate("Ed25519", "EdDSA" as never);
    const keyId1   = result1.keyId as unknown as string;
    const keyId2   = result2.keyId as unknown as string;
    const db       = await openVaultDb();
    const [r1, r2] = await Promise.all([
      getJwk(db, keyId1),
      getJwk(db, keyId2),
    ]);
    // IVs should differ (12 bytes, randomly chosen).
    const iv1 = new Uint8Array(r1!.iv);
    const iv2 = new Uint8Array(r2!.iv);
    expect(iv1).not.toEqual(iv2);
  });

  it("throws for unsupported key types", async () => {
    const storage = await PasskeyJwkStorage.register();
    await expect(storage.generate("Secp256k1", "ES256K" as never))
      .rejects.toThrow(/only supports key type/i);
  });
});

// ── exists / delete ───────────────────────────────────────────────────────────

describe("PasskeyJwkStorage — exists / delete", () => {
  it("exists() returns true after generate()", async () => {
    const storage = await PasskeyJwkStorage.register();
    const result  = await storage.generate("Ed25519", "EdDSA" as never);
    const keyId   = result.keyId as unknown as string;
    expect(await storage.exists(keyId)).toBe(true);
  });

  it("exists() returns false for an unknown keyId", async () => {
    const storage = await PasskeyJwkStorage.register();
    expect(await storage.exists("no-such-key")).toBe(false);
  });

  it("delete() removes the key; exists() returns false afterwards", async () => {
    const storage = await PasskeyJwkStorage.register();
    const result  = await storage.generate("Ed25519", "EdDSA" as never);
    const keyId   = result.keyId as unknown as string;
    await storage.delete(keyId);
    expect(await storage.exists(keyId)).toBe(false);
  });
});

// ── sign ──────────────────────────────────────────────────────────────────────

describe("PasskeyJwkStorage — sign", () => {
  it("produces a 64-byte Ed25519 signature", async () => {
    const storage = await PasskeyJwkStorage.register();
    const result  = await storage.generate("Ed25519", "EdDSA" as never);
    const keyId   = result.keyId as unknown as string;
    const data    = new Uint8Array([10, 20, 30, 40, 50]);
    const sig     = await storage.sign(keyId, data, {} as never);
    expect(sig).toBeInstanceOf(Uint8Array);
    expect(sig.length).toBe(64);
  });

  it("signature verifies against the stored public key", async () => {
    const storage = await PasskeyJwkStorage.register();
    const result  = await storage.generate("Ed25519", "EdDSA" as never);
    const keyId   = result.keyId as unknown as string;
    const data    = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]);

    const sig = await storage.sign(keyId, data, {} as never);

    // Recover the public key from the JWK record stored in IDB.
    const db     = await openVaultDb();
    const record = await getJwk(db, keyId);
    // decodeB64 expects the base64url string as a Uint8Array of its ASCII bytes.
    const pubKey = decodeB64(new TextEncoder().encode(record!.x));

    const valid = await ed.verifyAsync(sig, data, pubKey);
    expect(valid).toBe(true);
  });

  it("throws when the keyId does not exist in the vault", async () => {
    const storage = await PasskeyJwkStorage.register();
    await expect(
      storage.sign("ghost-key", new Uint8Array([1]), {} as never),
    ).rejects.toThrow(/not found in vault/i);
  });
});

// ── insert ────────────────────────────────────────────────────────────────────

describe("PasskeyJwkStorage — insert", () => {
  it("stores a private JWK and returns a keyId", async () => {
    const storage = await PasskeyJwkStorage.register();

    // Create a real Ed25519 key pair, encode the private scalar as base64url.
    const { secretKey } = await ed.keygenAsync();
    const d = encodeB64(secretKey);

    // Build a Jwk with both public placeholder and private scalar.
    // The mock Jwk's paramsOkp() reads from _data.d; x is overwritten internally.
    const { Jwk } = await import("@iota/identity-wasm/web");
    const jwk = new Jwk({ kty: "OKP" as never, crv: "Ed25519", d, x: "", alg: "EdDSA" as never });

    const keyId = await storage.insert(jwk as never);
    expect(typeof keyId).toBe("string");
    expect(keyId.length).toBeGreaterThan(0);
    expect(await storage.exists(keyId)).toBe(true);
  });

  it("insert() is idempotent — calling twice with the same key returns the same keyId", async () => {
    const storage = await PasskeyJwkStorage.register();

    const { secretKey } = await ed.keygenAsync();
    const d = encodeB64(secretKey);
    const { Jwk } = await import("@iota/identity-wasm/web");
    const jwk = new Jwk({ kty: "OKP" as never, crv: "Ed25519", d, x: "", alg: "EdDSA" as never });

    const id1 = await storage.insert(jwk as never);
    const id2 = await storage.insert(jwk as never);
    expect(id1).toBe(id2);
  });

  it("throws when the JWK has no private component", async () => {
    const storage = await PasskeyJwkStorage.register();
    const { Jwk } = await import("@iota/identity-wasm/web");
    const publicOnlyJwk = new Jwk({ kty: "OKP" as never, crv: "Ed25519", x: "AAEC", alg: "EdDSA" as never });
    await expect(storage.insert(publicOnlyJwk as never)).rejects.toThrow(/missing 'd'/i);
  });
});
