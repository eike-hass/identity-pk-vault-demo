# CLAUDE.md — Identity PK Vault Demo

## Purpose

Browser SPA for creating and managing W3C Decentralized Identifiers (DIDs) anchored to the IOTA
ledger. DID signing keys are persisted in a hardware-bound passkey vault (WebAuthn PRF + AES-GCM).
Users connect an IOTA browser wallet, then create / view / update / deactivate `did:iota`
identities and resolve arbitrary DIDs.

---

## Tech Stack

| Layer         | Package                              | Notes                                    |
| ------------- | ------------------------------------ | ---------------------------------------- |
| UI framework  | React 18 + TypeScript                | Strict mode, ES2020 target               |
| Styling       | Tailwind CSS 3 + PostCSS             | Custom `iota` color palette (sky blue)   |
| Bundler       | Vite 6                               | Handles WASM `?url` imports              |
| IOTA Identity | `@iota/identity-wasm` ^1.9.2-beta.1  | WASM build of Rust identity library      |
| IOTA client   | `@iota/iota-sdk` ^1.10.1             | RPC, crypto, transaction signing         |
| IOTA TS       | `@iota/iota-interaction-ts` ^0.12.0  | TypeScript interaction helpers           |
| Wallet UI     | `@iota/dapp-kit` ^0.7.0              | React hooks + ConnectButton + dark theme |
| Async state   | `@tanstack/react-query` ^5           | Peer dep of dApp Kit                     |
| Crypto        | `@noble/ed25519` ^3.0.0              | Ed25519 key generation and signing       |

---

## Directory Layout

```
.
├── src/
│   ├── components/
│   │   ├── Header.tsx            # Nav bar, network selector, ConnectButton, vault status
│   │   ├── VaultGate.tsx         # UI guard: blocks app until vault is unlocked
│   │   ├── VaultBackup.tsx       # Export / import encrypted vault backups
│   │   ├── CreateIdentity.tsx    # DID creation wizard
│   │   ├── IdentityDashboard.tsx # View / manage a created DID
│   │   ├── UpdateIdentity.tsx    # Add service endpoint or deactivate
│   │   └── ResolveIdentity.tsx   # Look up any did:iota
│   ├── hooks/
│   │   ├── useIdentityClient.ts  # Read-only client cache, storage, client factory
│   │   └── usePasskeyVault.ts    # VaultStatus state machine, register/unlock/backup
│   ├── lib/
│   │   ├── walletSigner.ts       # dApp Kit → TransactionSigner bridge
│   │   ├── explorerUrl.ts        # IOTA Explorer URL builder
│   │   └── retryAsync.ts         # Generic async retry with configurable policy
│   ├── mocks/
│   │   ├── mockMode.ts           # MOCK_MODE feature flag (VITE_USE_MOCK)
│   │   ├── stableBurnerWallet.ts # Registers burner wallet with localStorage-persisted keypair
│   │   └── DevModeBanner.tsx     # Dev banner: register stable burner wallet, balance, faucet
│   ├── storage/
│   │   ├── index.ts              # Re-exports PasskeyJwkStorage + PasskeyKeyIdStorage
│   │   ├── PasskeyJwkStorage.ts  # JwkStorage impl — generate, encrypt, sign, backup/restore
│   │   ├── PasskeyKeyIdStorage.ts# KeyIdStorage impl — plaintext IDB
│   │   └── vault/
│   │       ├── vaultDb.ts        # Typed IndexedDB wrapper (iota-identity-vault, v3)
│   │       ├── passkeyAuth.ts    # WebAuthn create/get + HKDF key derivation
│   │       └── vaultBackup.ts    # PBKDF2 + AES-GCM backup encrypt/decrypt
│   ├── __tests__/
│   │   ├── setup.ts              # Vitest setup: fake-indexeddb, happy-dom
│   │   ├── components/           # Component unit tests (Header, VaultGate, VaultBackup)
│   │   ├── lib/                  # Unit tests (explorerUrl, retryAsync)
│   │   └── storage/              # Unit tests (vaultBackup)
│   ├── App.tsx                   # Layout, tab routing, IDB-backed DID list
│   ├── main.tsx                  # WASM init, provider stack, theme
│   ├── networkConfig.ts          # testnet / devnet / localnet URLs
│   └── index.css                 # Tailwind base + custom component classes
├── e2e/
│   ├── helpers/webauthn.ts       # installVirtualAuthenticator, clearVaultDbScript
│   ├── vault-lifecycle.spec.ts   # Passkey vault E2E tests
│   ├── backup-restore.spec.ts    # Backup/restore E2E tests
│   └── did-lifecycle.spec.ts     # DID create/update/resolve/forget (requires localnet)
├── .env.local.example            # Template: VITE_USE_MOCK=true
├── package.json
├── playwright.config.ts          # Playwright: 3 projects (vault, backup, did)
├── vitest.config.ts              # Vitest: happy-dom, fake-indexeddb setup
├── tailwind.config.js            # iota color palette
├── tsconfig.json
└── vite.config.ts
```

---

## Development Commands

```bash
# Install dependencies
npm install

# Start dev server (HMR, exposed on all interfaces)
npm run dev           # → http://localhost:5173

# Type-check only (no emit)
npx tsc --noEmit

# Production build (type-check + vite build)
npm run build         # Output: dist/

# Preview production build locally
npm run preview
```

The dev server URL may vary; check the terminal output for the exact port.

---

## Environment Variables

| Variable                  | Values        | Effect                                              |
| ------------------------- | ------------- | --------------------------------------------------- |
| `VITE_USE_MOCK`           | `true` / omit | Enable mock/dev mode (stable burner wallet + banner)|
| `VITE_DEFAULT_NETWORK`    | `localnet` etc| Override default network (used by E2E DID tests)    |
| `VITE_IOTA_IDENTITY_PKG_ID` | `0x…`       | Explicit identity package ID (required for localnet)|

Copy `.env.local.example` to `.env.local` to activate mock mode.

`VITE_DEFAULT_NETWORK` and `VITE_IOTA_IDENTITY_PKG_ID` are injected automatically by
`playwright.config.ts` when running E2E DID tests — do not set them manually for the dev server
unless you want to hard-pin the starting network.

---

## Mock / Dev Mode (`VITE_USE_MOCK=true`)

Bypasses the IOTA Browser Wallet extension for local development and E2E tests.

**What it does:**

- `DevModeBanner` registers a `"Unsafe Burner Wallet"` via `registerStableBurnerWallet()` —
  a custom wallet backed by an Ed25519 keypair **persisted in `localStorage`**. The keypair is
  generated once and reused on every page reload, so the wallet address is stable across
  reloads within the same browser context.
- `DevModeBanner` auto-connects to that wallet and shows:
  - Abbreviated wallet address
  - Live IOTA balance (refetched every 10 s)
  - Inline **Fund wallet** button (calls `requestIotaFromFaucetV0` directly)
  - Active network name

**Why a stable keypair matters:** DIDs are indexed in IDB by `(walletAddress, network)`. If the
address changed on every reload (as the old random `enableUnsafeBurner` did), DID records
created before a reload would be unreachable after it.

**Prerequisites for mock mode to actually transact on a localnet:**

```bash
# 1. Start a local IOTA node with faucet
RUST_LOG="off,iota_node=info" iota start --force-regenesis --with-faucet

# 2. Publish the identity Move package (from the iota-identity repo root)
#    and capture the package ID printed on the last line
./identity_iota_core/scripts/publish_identity_package.sh
export IOTA_IDENTITY_PKG_ID=0x<your-package-id>

# 3. Start the dApp with the package ID
VITE_USE_MOCK=true VITE_DEFAULT_NETWORK=localnet VITE_IOTA_IDENTITY_PKG_ID=$IOTA_IDENTITY_PKG_ID npm run dev

# 4. Click "Fund wallet" in the dev banner (or use CLI faucet):
#    iota client faucet --address <burner-address>
```

**Faucet endpoints used by `getFaucetHost(network)`:**

- `localnet` → `http://localhost:9123`
- `testnet` → faucet.testnet.iota.cafe
- `devnet` → faucet.devnet.iota.cafe

---

## Key Architecture Patterns

### 1. WASM Initialisation (main.tsx)

```typescript
import wasmUrl from "@iota/identity-wasm/web/identity_wasm_bg.wasm?url";
import { init } from "@iota/identity-wasm/web";

init(wasmUrl).then(() => ReactDOM.createRoot(...).render(...));
```

- Vite resolves `?url` to the hashed asset path at build time
- React does **not** mount until WASM is ready
- Always import from `@iota/identity-wasm/web` (not `/node`) in browser code

### 2. WalletSigner Bridge (src/lib/walletSigner.ts)

Implements the identity library's `TransactionSigner` interface using dApp Kit hooks:

```
IdentityClient.createIdentity()
  → calls TransactionSigner.sign(bcsBytes)
    → WalletSigner.sign() encodes bytes as base64
      → signFn({ transaction: base64 })  // dApp Kit useSignTransaction
        → wallet popup / burner auto-sign
```

**Public key byte formats** handled by `WalletSigner.publicKey()`:

| Length | Flag byte     | Interpretation                                         |
| ------ | ------------- | ------------------------------------------------------ |
| 32     | —             | Raw Ed25519                                            |
| 33     | `0x00`        | IOTA-prefixed Ed25519 → strip flag, use 32 raw bytes   |
| 33     | `0x02`/`0x03` | Raw Secp256k1 compressed                               |
| 34     | `0x01`        | IOTA-prefixed Secp256k1 → strip flag, use 33 raw bytes |

The dApp Kit burner wallet exposes its key via `toIotaBytes()` = 33 bytes with flag `0x00`.
**Always check the flag byte; never assume 33 bytes = Secp256k1.**

### 3. Read-Only Client Caching (src/hooks/useIdentityClient.ts)

```typescript
const readOnlyCache = new Map<string, IdentityClientReadOnly>();
```

- `IdentityClientReadOnly` is expensive to construct (auto-discovers package ID on-chain)
- Cached per **network name** (e.g. `"localnet"`); shared across all components via
  module-level Map — the same JS object is returned to every hook instance on the same network
- On localnet, pass `VITE_IOTA_IDENTITY_PKG_ID` explicitly; without it, auto-discovery fails
- **Critical:** `IdentityClient.create(readOnlyClient, ...)` calls `__destroy_into_raw()` on
  its `readOnlyClient` argument, consuming the WASM pointer. Never pass the cached singleton
  to `IdentityClient.create()` — always create a **fresh** `IdentityClientReadOnly` inside
  `createIdentityClient()`.

### 4. DID Persistence (App.tsx + storage/vault/vaultDb.ts)

DIDs are stored in the `dids` IndexedDB object store (part of `iota-identity-vault`, v3):

```
Store: "dids"  keyPath: "did"  index: "by_account" → [address, network]
```

- `listDids(db, address, network)` → array of DID strings for the connected wallet+network
- `putDid(db, address, network, did)` → idempotent upsert
- `deleteDid(db, did)` → triggered by the "Forget" button in `IdentityDashboard`
- Supports multiple DIDs per wallet+network combination (displayed as a list)
- Reloaded whenever the connected account or network changes

### 5. IOTA Explorer Links (src/lib/explorerUrl.ts)

```typescript
explorerObjectUrl(objectId, network);
// testnet/devnet → https://explorer.iota.org/object/<id>?network=<net>
// mainnet alias "6364aad5" → ?network=mainnet
// localnet → http://localhost:3000/object/<id>
```

---

## Component Responsibilities

| Component           | Responsibility                                                          |
| ------------------- | ----------------------------------------------------------------------- |
| `Header`            | Network `<select>`, `ConnectButton`, vault status pill                  |
| `VaultGate`         | Blocks app until vault is unlocked; shows register/unlock/restore UI    |
| `VaultBackup`       | Export encrypted backup file; import backup to restore keys and DIDs    |
| `CreateIdentity`    | Build & publish new DID; extract object ID from tx result               |
| `IdentityDashboard` | Resolve and display DID document; trigger update/forget                 |
| `UpdateIdentity`    | Add service endpoint or deactivate via `propose_update` flow            |
| `ResolveIdentity`   | Look up any DID string; show doc + raw JSON + explorer link             |
| `DevModeBanner`     | Register stable burner wallet; display balance and active network; faucet|

---

## Custom CSS Classes (src/index.css)

| Class            | Purpose                                       |
| ---------------- | --------------------------------------------- |
| `.card`          | Semi-transparent dark card with backdrop blur |
| `.btn-primary`   | IOTA-600 button (with disabled state)         |
| `.btn-secondary` | Gray-800 button                               |
| `.btn-danger`    | Red button for destructive actions            |
| `.input`         | Dark form input with iota-500 focus ring      |
| `.label`         | Small uppercase form label                    |
| `.did-badge`     | Monospace DID display pill                    |
| `.status-badge`  | Color-coded active/deactivated pill           |

---

## Passkey Key Vault

DID signing keys are persisted via a hardware-bound encrypted vault instead of the session-scoped
`JwkMemStore`. This makes the **Update Identity** flow possible across page reloads.

### Architecture

```
Passkey (platform authenticator — Touch ID, Windows Hello, PIN)
  └─ WebAuthn PRF extension → 32-byte deterministic output
       └─ HKDF-SHA-256 → AES-GCM-256 vault key (in memory, non-extractable)
            └─ encrypt/decrypt Ed25519 private scalars in IndexedDB
```

### Files

| File | Purpose |
|---|---|
| `src/storage/vault/vaultDb.ts` | Typed IndexedDB wrapper (`iota-identity-vault` database, v3) |
| `src/storage/vault/passkeyAuth.ts` | WebAuthn `create`/`get` + HKDF key derivation |
| `src/storage/vault/vaultBackup.ts` | PBKDF2 + AES-GCM backup encrypt/decrypt (pure crypto, no IDB) |
| `src/storage/PasskeyJwkStorage.ts` | `JwkStorage` impl — generate, encrypt, sign; `exportBackup`/`importBackup` |
| `src/storage/PasskeyKeyIdStorage.ts` | `KeyIdStorage` impl — plaintext IDB |
| `src/hooks/usePasskeyVault.ts` | React hook: `VaultStatus` state machine, all vault operations |
| `src/components/VaultGate.tsx` | UI guard shown between wallet connect and app tabs |
| `src/components/VaultBackup.tsx` | Export + import backup panels (rendered in "Key Vault" tab) |

### IndexedDB schema (`iota-identity-vault`, version 3)

| Store | keyPath | Index | Contents |
|---|---|---|---|
| `credential` | `id` | — | `{ credentialId, rpId, prfSalt }` — Passkey metadata |
| `jwks` | `keyId` | — | `{ encryptedD, iv, alg, x }` — AES-GCM ciphertext of private scalar |
| `keyIds` | `digest` | — | `{ digest, keyId }` — MethodDigest → keyId mappings (plaintext) |
| `dids` | `did` | `by_account` → `[address, network]` | `{ did, address, network }` — DID records |

### VaultStatus state machine

```
"checking"     → isPrfSupported? No → "unsupported" (falls back to JwkMemStore)
               → isRegistered?  No → "unregistered" (VaultGate shows Create panel)
               → isRegistered? Yes → "locked" (VaultGate shows Unlock panel)
"unregistered" → register()            → "unlocked"
               → registerAndRestore()  → "unlocked" (keys + DIDs imported from backup)
"locked"       → unlock()             → "unlocked"
               → unlock() PRF error   → "unregistered" (allow re-registration)
"unlocked"     → VaultGate renders children (normal app tabs)
any            → unexpected error     → "error" (error string available)
```

### Vault backup file format

```json
{
  "version": 1,
  "created": "<ISO-8601>",
  "kdf": { "algorithm": "PBKDF2", "hash": "SHA-256", "iterations": 600000, "salt": "<b64url>" },
  "iv": "<b64url 12 B>",
  "payload": "<b64url — AES-GCM ciphertext of BackupPayload JSON>"
}
```

`BackupPayload` contains `keys` (raw Ed25519 scalars), `keyIds` (MethodDigest mappings), and
`dids` (DID records). The `credential` store is excluded — it is device-bound.

### Browser compatibility

| Feature | Chrome/Edge | Safari | Firefox |
|---|---|---|---|
| WebAuthn PRF | 116+ ✓ | 17.4+ ✓ | ✗ (no PRF) |
| Fallback behaviour | — | — | `JwkMemStore` + amber notice |

### @noble/ed25519 v3 API notes

The dApp uses `@noble/ed25519` v3, which has a different API from v1 used internally by the WASM bindings:
- Key generation: `ed.keygenAsync()` returns `{ secretKey, publicKey }` (not `utils.randomPrivateKey`)
- Signing: `ed.signAsync(message, secretKey)`
- No `ed.etc.sha512Sync` in v3 (not needed)

---

## Common Gotchas

1. **WASM pointer consumed by `IdentityClient.create()`** — See pattern #3 above. Symptom:
   null pointer exception on the second use of `readOnlyClient` after a signing operation.

2. **Burner wallet key format** — dApp Kit burner exposes its key as 33-byte IOTA-prefixed
   Ed25519. Treating it as Secp256k1 produces an invalid key error from the WASM layer.

3. **Network mismatch** — DIDs are stored per `(address, network)`. Switching network without a
   funded address on the new network will cause creation to fail with "insufficient funds."

4. **Localnet regenesis** — `iota start --force-regenesis` wipes all chain state including
   the identity package. Re-publish the package and update `IOTA_IDENTITY_PKG_ID`. DID records
   in IDB that reference the old localnet will no longer resolve — clear the `dids` store in
   DevTools (or delete the `iota-identity-vault` IDB entirely).

5. **`IdentityClientReadOnly` on localnet** — Without `VITE_IOTA_IDENTITY_PKG_ID`, the client
   tries to auto-discover the package ID from well-known addresses, which fails on a fresh
   localnet. Always set this env var when targeting localnet.

6. **WASM not initialised** — If React renders before `init()` resolves (e.g., in tests or SSR),
   any call into `@iota/identity-wasm` throws. Always gate WASM calls behind `isReady`.

7. **`@iota/identity-wasm` version must match WASM binary** — The npm package and the `.wasm`
   binary are a matched pair. After upgrading the package, always rebuild the app to pick up
   the new binary.

8. **Localnet node transient inconsistency** — Right after DID creation, `resolveDid` may
   transiently return "could not find DID document". `IdentityDashboard` handles this via
   `retryAsync` (5 attempts, 1.5 s delay). Other callers (e.g. `ResolveIdentity`) make a
   single call — add retry or wait if you see sporadic "not found" errors immediately after
   creation.

---

## Keeping This File Updated

This file is the primary reference for working on the dApp. Keep it accurate as the codebase evolves:

- **New file or directory** → add it to the Directory Layout section.
- **New environment variable** → add a row to the Environment Variables table.
- **New component** → add a row to the Component Responsibilities table.
- **New IDB store or schema change** → update the IndexedDB schema table (version number included).
- **New npm script** → add it to the Development Commands or Testing Workflow section.
- **Changed architectural pattern** → update the relevant Key Architecture Patterns subsection.
- **New common failure mode** → add a numbered entry to Common Gotchas.
- **New E2E test file or Vitest suite** → update the Testing Workflow section.

When in doubt: if you had to look something up or figure it out from source, it belongs here so the next session does not repeat that work.

---

## Testing Workflow

### Commands

```bash
# Unit / component tests (Vitest) — run from identity-dapp/
npm test                    # run once
npm run test:watch          # watch mode

# E2E tests (Playwright + Chrome) — run from identity-dapp/
npm run test:e2e            # vault + backup projects (no localnet needed)
npx playwright test --project=vault   # vault lifecycle only
npx playwright test --project=backup  # backup/restore only

# DID lifecycle E2E tests — requires a running localnet + published identity package
export IOTA_IDENTITY_PKG_ID=0x<package-id>
npm run test:e2e:did        # shorthand: sets LOCALNET=true automatically
# or explicitly:
LOCALNET=true IOTA_IDENTITY_PKG_ID=$IOTA_IDENTITY_PKG_ID npx playwright test --project=did
```

### Localnet setup for DID tests

```bash
# 1. Start localnet
RUST_LOG="off,iota_node=info" iota start --force-regenesis --with-faucet

# 2. Publish identity package (requires the iota-identity repo for the Move source)
#    Run from the iota-identity repo root:
./identity_iota_core/scripts/publish_identity_package.sh
# → prints the package ID on the last line

# 3. Export the package ID and run tests (from this repo root)
export IOTA_IDENTITY_PKG_ID=0x<output-from-step-2>
npm run test:e2e:did
```

`playwright.config.ts` automatically injects `VITE_DEFAULT_NETWORK=localnet` and
`VITE_IOTA_IDENTITY_PKG_ID` into the Vite dev server so the app starts on localnet and can
find the identity package without a network switch.

### Regression rule

**Before and after every code change** that touches components, hooks, storage, or crypto:

1. Run `npm test` — all Vitest unit tests must stay green.
2. Run `npm run test:e2e` — vault + backup E2E tests must stay green.
3. Fix any failures before moving on; never leave a known-broken test.

### Extending tests during feature development

- **New storage helper or crypto function** → add a Vitest unit test in `src/__tests__/`.
- **New UI component or state transition** → add an E2E test in `e2e/` in the relevant spec:
  - Vault lifecycle changes → `e2e/vault-lifecycle.spec.ts`
  - Backup / restore changes → `e2e/backup-restore.spec.ts`
  - DID operations → `e2e/did-lifecycle.spec.ts`
- **New VaultGate panel or button** → test that the element appears on `/` and that the interaction succeeds.
- **New VaultBackup section** → test both the happy path _and_ the error path (wrong password, corrupt file, etc.).
- Always test idempotency for import operations (importing twice should not duplicate keys).

### E2E authoring notes

- Use `getByRole("button", { name: /…/i })` and `getByPlaceholder(…)` — labels in this codebase often lack `htmlFor` so `getByLabel` will not find them.
- When multiple buttons share the same label (e.g. a tab button and a submit button both named
  "Add Service"), use `.last()` or `.nth(n)` to target the submit button specifically.
- Virtual authenticator must be installed **after** `page.goto()` — Chrome's WebAuthn environment resets on navigation.
- `addInitScript` fires on every navigation including `page.reload()`; use the sessionStorage guard in `clearVaultDbScript()` to avoid wiping IDB on reloads inside a test.
- To simulate "new device" (clear IDB mid-test): fire `indexedDB.deleteDatabase(…)` without awaiting, then call `page.reload()` — the reload closes the open IDB connection, letting the delete complete before the new page opens the database.
- DID tests that resolve freshly-created DIDs should use `expect().toPass()` with retries because the localnet node can be transiently inconsistent immediately after object creation.
- Default per-test timeout is 30 s. Add `test.setTimeout(90_000)` to tests that include multiple long async operations (fund + create DID + resolve).

---

## Browser Automation

Use `agent-browser` for web automation. Run `agent-browser --help` for all commands.

Core workflow:

1. `agent-browser open <url>` - Navigate to page
2. `agent-browser snapshot -i` - Get interactive elements with refs (@e1, @e2)
3. `agent-browser click @e1` / `fill @e2 "text"` - Interact using refs
4. Re-snapshot after page changes
