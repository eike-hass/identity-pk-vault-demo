# CLAUDE.md — Identity PK Vault Demo

Browser SPA for creating and managing `did:iota` identities anchored to the IOTA ledger. DID signing keys live in a hardware-bound passkey vault (WebAuthn PRF + AES-GCM). Users connect an IOTA wallet to create, manage, and resolve DIDs.

**Stack:** React 18 + TypeScript · Tailwind CSS 3 · Vite 6 · `@iota/identity-wasm` ^1.9.2-beta.1 · `@iota/iota-sdk` · `@iota/dapp-kit` · `@noble/ed25519` ^3.0.0

---

## Commands

```bash
npm install
npm run dev           # → http://localhost:5173
npx tsc --noEmit      # type-check only
npm run build         # dist/
npm test              # Vitest unit tests
npm run test:e2e      # Playwright vault + backup (no localnet needed)
npm run test:e2e:did  # DID lifecycle — requires localnet + IOTA_IDENTITY_PKG_ID
```

---

## Environment Variables

| Variable | Effect |
|---|---|
| `VITE_USE_MOCK=true` | Stable burner wallet — no browser extension needed (`cp .env.local.example .env.local`) |
| `VITE_DEFAULT_NETWORK` | Starting network (`localnet` / `testnet` / `devnet`) |
| `VITE_IOTA_IDENTITY_PKG_ID` | Required on localnet — auto-discovery fails on a fresh chain |

`VITE_DEFAULT_NETWORK` and `VITE_IOTA_IDENTITY_PKG_ID` are injected by `playwright.config.ts` for DID E2E runs; don't set them manually unless overriding.

---

## Components

| Component | Responsibility |
|---|---|
| `Header` | Custom `NetworkSelect` dropdown, `ConnectButton`, vault status pill |
| `VaultGate` | Blocks app until vault unlocked; register / unlock / restore panels |
| `VaultBackup` | Export + import encrypted backup |
| `CreateIdentity` | Publish new `did:iota`; extract object ID from tx result |
| `IdentityDashboard` | Display DID doc; inline add/remove keys + services; Danger Zone (deactivate / reactivate / delete) |
| `ResolveIdentity` | Look up any DID string; raw JSON + Explorer link |
| `DevModeBanner` | Burner wallet status, balance, faucet (mock mode only) |

## Directory Layout

```
src/
  components/  ← see table above
  hooks/       useIdentityClient · usePasskeyVault
  lib/         walletSigner · explorerUrl · retryAsync
  storage/     PasskeyJwkStorage · PasskeyKeyIdStorage
    vault/     vaultDb · passkeyAuth · vaultBackup
  mocks/       mockMode · stableBurnerWallet · DevModeBanner
  __tests__/   components/ · lib/ · storage/
e2e/           vault-lifecycle · backup-restore · did-lifecycle
```

---

## Storage — IndexedDB `iota-identity-vault` v3

| Store | keyPath | Contents |
|---|---|---|
| `credential` | `id` | Passkey metadata (`credentialId`, `rpId`, `prfSalt`) |
| `jwks` | `keyId` | AES-GCM ciphertext of Ed25519 private scalar + public key `x` |
| `keyIds` | `digest` | MethodDigest → keyId mapping (plaintext) |
| `dids` | `did` | `{ did, address, network }` — indexed by `[address, network]` |

→ Vault architecture, state machine, backup format, browser compat: [docs/vault.md](docs/vault.md)

---

## Critical Gotchas

1. **WASM pointer consumed** — `IdentityClient.create(readOnlyClient, ...)` calls `__destroy_into_raw()` on its argument. Never pass the cached `IdentityClientReadOnly` singleton; always construct a fresh one inside `createIdentityClient()`.

2. **Burner wallet key format** — `toIotaBytes()` returns 33 bytes with flag `0x00` (IOTA-prefixed Ed25519). Strip the flag byte. Never assume 33 bytes = Secp256k1.

3. **Localnet regenesis** — `iota start --force-regenesis` wipes the identity package. Re-publish, update `IOTA_IDENTITY_PKG_ID`, clear the `dids` IDB store (DevTools → Application → IndexedDB, or delete `iota-identity-vault` entirely).

4. **WASM in tests** — Always mock `@iota/identity-wasm/web`; never let tests touch the uninitialised WASM binary.

5. **Transient resolve after creation** — `IdentityDashboard` retries `resolveDid` 5× at 1.5 s. `ResolveIdentity` makes a single call and may return "not found" immediately after creation.

---

## Testing

**Regression rule:** `npm test` and `npm run test:e2e` must stay green before and after every change to components, hooks, storage, or crypto.

**Localnet DID tests:**
```bash
RUST_LOG="off,iota_node=info" iota start --force-regenesis --with-faucet
# from iota-identity repo root:
./identity_iota_core/scripts/publish_identity_package.sh
export IOTA_IDENTITY_PKG_ID=0x<id>
npm run test:e2e:did
```

→ Test coverage table, E2E authoring notes: [docs/testing.md](docs/testing.md)

---

## Architecture Reference

→ WASM init, WalletSigner bridge, read-only client caching, DID persistence: [docs/architecture.md](docs/architecture.md)

---

## Browser Automation

`agent-browser open <url>` → `snapshot -i` (get `@refs`) → `click @e1` / `fill @e2 "text"` → re-snapshot after state changes.
