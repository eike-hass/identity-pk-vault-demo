import { describe, it, expect, vi, beforeAll } from "vitest";

// Mock @iota/identity-wasm/web before importing vaultBackup.
// encodeB64 / decodeB64 are pure base64url helpers that don't require WASM init.
vi.mock("@iota/identity-wasm/web", () => {
  function encodeB64(bytes: Uint8Array): string {
    let binary = "";
    bytes.forEach((b) => { binary += String.fromCharCode(b); });
    return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
  }

  function decodeB64(encoded: Uint8Array): Uint8Array {
    const str = new TextDecoder().decode(encoded);
    const b64 = str.replace(/-/g, "+").replace(/_/g, "/");
    const padded = b64 + "=".repeat((4 - (b64.length % 4)) % 4);
    const binary = atob(padded);
    return new Uint8Array(binary.split("").map((c) => c.charCodeAt(0)));
  }

  return { encodeB64, decodeB64 };
});

import { encryptBackup, decryptBackup } from "../../storage/vault/vaultBackup";
import type { BackupPayload } from "../../storage/vault/vaultBackup";

const SAMPLE_PAYLOAD: BackupPayload = {
  keys: [
    { keyId: "key-abc123", d: "AAECBAUGB", x: "BAECBAUGB", alg: "EdDSA" },
    { keyId: "key-def456", d: "CgsMDQ4P",  x: "EBESExQV",  alg: "EdDSA" },
  ],
  keyIds: [
    { digest: "digest-1", keyId: "key-abc123" },
    { digest: "digest-2", keyId: "key-def456" },
  ],
  dids: [
    { did: "did:iota:devnet:0xabcdef", address: "0x1234", network: "devnet" },
  ],
};

const PASSWORD = "correct-horse-battery-staple";

describe("encryptBackup / decryptBackup", () => {
  it("round-trips payload correctly with the right password", async () => {
    const file = await encryptBackup(SAMPLE_PAYLOAD, PASSWORD);
    const restored = await decryptBackup(file, PASSWORD);
    expect(restored).toEqual(SAMPLE_PAYLOAD);
  });

  it("produces version=1 with required fields", async () => {
    const file = await encryptBackup(SAMPLE_PAYLOAD, PASSWORD);
    expect(file.version).toBe(1);
    expect(typeof file.created).toBe("string");
    expect(file.kdf.algorithm).toBe("PBKDF2");
    expect(file.kdf.hash).toBe("SHA-256");
    expect(file.kdf.iterations).toBe(600_000);
    expect(typeof file.kdf.salt).toBe("string");
    expect(typeof file.iv).toBe("string");
    expect(typeof file.payload).toBe("string");
  });

  it("uses a random salt and IV each time (non-deterministic)", async () => {
    const file1 = await encryptBackup(SAMPLE_PAYLOAD, PASSWORD);
    const file2 = await encryptBackup(SAMPLE_PAYLOAD, PASSWORD);
    expect(file1.kdf.salt).not.toBe(file2.kdf.salt);
    expect(file1.iv).not.toBe(file2.iv);
    expect(file1.payload).not.toBe(file2.payload);
  });

  it("rejects decryption with the wrong password", async () => {
    const file = await encryptBackup(SAMPLE_PAYLOAD, PASSWORD);
    await expect(decryptBackup(file, "wrong-password")).rejects.toThrow(
      "Decryption failed",
    );
  });

  it("rejects decryption with a tampered payload", async () => {
    const file = await encryptBackup(SAMPLE_PAYLOAD, PASSWORD);
    // Flip the last character of the base64url ciphertext.
    const tampered = {
      ...file,
      payload: file.payload.slice(0, -4) + "AAAA",
    };
    await expect(decryptBackup(tampered, PASSWORD)).rejects.toThrow("Decryption failed");
  });

  it("rejects decryption with a tampered IV", async () => {
    const file = await encryptBackup(SAMPLE_PAYLOAD, PASSWORD);
    const tampered = { ...file, iv: "AAAAAAAAAAAAAAAA" }; // 12 zero bytes in base64url
    await expect(decryptBackup(tampered, PASSWORD)).rejects.toThrow("Decryption failed");
  });

  it("rejects unsupported backup versions", async () => {
    const file = await encryptBackup(SAMPLE_PAYLOAD, PASSWORD);
    const wrongVersion = { ...file, version: 2 as unknown as 1 };
    await expect(decryptBackup(wrongVersion, PASSWORD)).rejects.toThrow(
      "Unsupported backup version: 2",
    );
  });

  it("preserves empty arrays in the payload", async () => {
    const empty: BackupPayload = { keys: [], keyIds: [], dids: [] };
    const file = await encryptBackup(empty, "pw12345678");
    const restored = await decryptBackup(file, "pw12345678");
    expect(restored).toEqual(empty);
  });

  it("created timestamp is a valid ISO-8601 string", async () => {
    const before = Date.now();
    const file = await encryptBackup(SAMPLE_PAYLOAD, PASSWORD);
    const after = Date.now();
    const ts = new Date(file.created).getTime();
    expect(ts).toBeGreaterThanOrEqual(before);
    expect(ts).toBeLessThanOrEqual(after);
  });
});
