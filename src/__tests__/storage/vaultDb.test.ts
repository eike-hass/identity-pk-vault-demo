import { describe, it, expect, beforeAll } from "vitest";
import {
  openVaultDb,
  putDid, listDids, deleteDid,
  putJwk, getJwk, deleteJwk, listJwks,
  putKeyId, getKeyId, deleteKeyId, listKeyIds,
} from "../../storage/vault/vaultDb";

// fake-indexeddb is loaded globally via the test setup file.

let db: IDBDatabase;

beforeAll(async () => {
  db = await openVaultDb();
});

// ── DID store ─────────────────────────────────────────────────────────────────

describe("vaultDb — DID store", () => {
  const ALICE   = "0xaddress-alice";
  const BOB     = "0xaddress-bob";
  const TESTNET = "testnet";
  const DEVNET  = "devnet";

  it("putDid / listDids — stores and retrieves a DID for the right account", async () => {
    await putDid(db, ALICE, TESTNET, "did:iota:testnet:0x0001");
    const list = await listDids(db, ALICE, TESTNET);
    expect(list).toContain("did:iota:testnet:0x0001");
  });

  it("listDids — returns multiple DIDs for the same account+network", async () => {
    await putDid(db, ALICE, TESTNET, "did:iota:testnet:0x0002");
    await putDid(db, ALICE, TESTNET, "did:iota:testnet:0x0003");
    const list = await listDids(db, ALICE, TESTNET);
    expect(list).toContain("did:iota:testnet:0x0002");
    expect(list).toContain("did:iota:testnet:0x0003");
  });

  it("listDids — does not cross network boundaries", async () => {
    await putDid(db, ALICE, TESTNET, "did:iota:testnet:0x0004");
    await putDid(db, ALICE, DEVNET,  "did:iota:devnet:0x0005");
    const testnetList = await listDids(db, ALICE, TESTNET);
    const devnetList  = await listDids(db, ALICE, DEVNET);
    expect(testnetList).not.toContain("did:iota:devnet:0x0005");
    expect(devnetList).not.toContain("did:iota:testnet:0x0004");
  });

  it("listDids — does not cross account boundaries", async () => {
    await putDid(db, ALICE, TESTNET, "did:iota:testnet:0x0006");
    await putDid(db, BOB,   TESTNET, "did:iota:testnet:0x0007");
    const aliceList = await listDids(db, ALICE, TESTNET);
    const bobList   = await listDids(db, BOB,   TESTNET);
    expect(aliceList).not.toContain("did:iota:testnet:0x0007");
    expect(bobList).not.toContain("did:iota:testnet:0x0006");
  });

  it("putDid is idempotent — upserting the same DID twice yields a single entry", async () => {
    const DID = "did:iota:testnet:0xdup";
    await putDid(db, ALICE, TESTNET, DID);
    await putDid(db, ALICE, TESTNET, DID);
    const list = await listDids(db, ALICE, TESTNET);
    expect(list.filter((d) => d === DID)).toHaveLength(1);
  });

  it("deleteDid — removes only the specified DID", async () => {
    const KEEP   = "did:iota:testnet:0xkeep";
    const REMOVE = "did:iota:testnet:0xremove";
    await putDid(db, ALICE, TESTNET, KEEP);
    await putDid(db, ALICE, TESTNET, REMOVE);
    await deleteDid(db, REMOVE);
    const list = await listDids(db, ALICE, TESTNET);
    expect(list).toContain(KEEP);
    expect(list).not.toContain(REMOVE);
  });

  it("listDids — returns empty array for an unknown account+network", async () => {
    const list = await listDids(db, "0xnobody", "unknownnet");
    expect(list).toEqual([]);
  });
});

// ── JWK store ─────────────────────────────────────────────────────────────────

describe("vaultDb — JWK store", () => {
  function makeJwkRecord(keyId: string) {
    return {
      keyId,
      encryptedD: new Uint8Array([1, 2, 3, 4]).buffer as ArrayBuffer,
      iv:         new Uint8Array([5, 6, 7, 8, 9, 10, 11, 12]).buffer as ArrayBuffer,
      alg:        "EdDSA",
      x:          "AAECBA",
    };
  }

  it("putJwk / getJwk — round-trips a record", async () => {
    await putJwk(db, makeJwkRecord("jwk-rt-001"));
    const rec = await getJwk(db, "jwk-rt-001");
    expect(rec).toBeDefined();
    expect(rec!.keyId).toBe("jwk-rt-001");
    expect(rec!.alg).toBe("EdDSA");
    expect(rec!.x).toBe("AAECBA");
  });

  it("getJwk — returns undefined for an unknown keyId", async () => {
    expect(await getJwk(db, "jwk-nonexistent")).toBeUndefined();
  });

  it("putJwk is idempotent — upserting the same keyId overwrites", async () => {
    await putJwk(db, { ...makeJwkRecord("jwk-idem-001"), alg: "first" });
    await putJwk(db, { ...makeJwkRecord("jwk-idem-001"), alg: "second" });
    const rec = await getJwk(db, "jwk-idem-001");
    expect(rec!.alg).toBe("second");
  });

  it("deleteJwk — removes the record; getJwk returns undefined afterwards", async () => {
    await putJwk(db, makeJwkRecord("jwk-del-001"));
    expect(await getJwk(db, "jwk-del-001")).toBeDefined();
    await deleteJwk(db, "jwk-del-001");
    expect(await getJwk(db, "jwk-del-001")).toBeUndefined();
  });

  it("listJwks — includes all stored records", async () => {
    await putJwk(db, makeJwkRecord("jwk-list-001"));
    await putJwk(db, makeJwkRecord("jwk-list-002"));
    const all = await listJwks(db);
    const ids = all.map((r) => r.keyId);
    expect(ids).toContain("jwk-list-001");
    expect(ids).toContain("jwk-list-002");
  });
});

// ── KeyId store ───────────────────────────────────────────────────────────────

describe("vaultDb — KeyId store", () => {
  it("putKeyId / getKeyId — round-trips a record", async () => {
    await putKeyId(db, { digest: "digest-rt-001", keyId: "key-rt-001" });
    const rec = await getKeyId(db, "digest-rt-001");
    expect(rec).toBeDefined();
    expect(rec!.keyId).toBe("key-rt-001");
  });

  it("getKeyId — returns undefined for an unknown digest", async () => {
    expect(await getKeyId(db, "digest-nonexistent")).toBeUndefined();
  });

  it("deleteKeyId — removes the record", async () => {
    await putKeyId(db, { digest: "digest-del-001", keyId: "key-del-001" });
    await deleteKeyId(db, "digest-del-001");
    expect(await getKeyId(db, "digest-del-001")).toBeUndefined();
  });

  it("listKeyIds — includes all stored records", async () => {
    await putKeyId(db, { digest: "digest-list-001", keyId: "key-list-001" });
    await putKeyId(db, { digest: "digest-list-002", keyId: "key-list-002" });
    const all = await listKeyIds(db);
    const digests = all.map((r) => r.digest);
    expect(digests).toContain("digest-list-001");
    expect(digests).toContain("digest-list-002");
  });
});
