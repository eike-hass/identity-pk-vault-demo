# Architecture Reference

## 1. WASM Initialisation (`src/main.tsx`)

```typescript
import wasmUrl from "@iota/identity-wasm/web/identity_wasm_bg.wasm?url";
import { init } from "@iota/identity-wasm/web";

init(wasmUrl).then(() => ReactDOM.createRoot(...).render(...));
```

- Vite resolves `?url` to the hashed asset path at build time.
- React does **not** mount until WASM is ready.
- Always import from `@iota/identity-wasm/web` (not `/node`) in browser code.

## 2. WalletSigner Bridge (`src/lib/walletSigner.ts`)

Bridges the identity library's `TransactionSigner` interface to dApp Kit's `useSignTransaction`:

```
IdentityClient.createIdentity()
  → TransactionSigner.sign(bcsBytes)
    → WalletSigner.sign() — encodes bytes as base64
      → signFn({ transaction: base64 })   // dApp Kit
        → wallet popup / burner auto-sign
```

**Public key byte formats** handled by `WalletSigner.publicKey()`:

| Length | Flag byte | Interpretation |
|---|---|---|
| 32 | — | Raw Ed25519 |
| 33 | `0x00` | IOTA-prefixed Ed25519 → strip flag, use 32 bytes |
| 33 | `0x02`/`0x03` | Raw Secp256k1 compressed |
| 34 | `0x01` | IOTA-prefixed Secp256k1 → strip flag, use 33 bytes |

The dApp Kit burner wallet returns `toIotaBytes()` = 33 bytes with flag `0x00`. **Always check the flag; never assume 33 bytes = Secp256k1.**

## 3. Read-Only Client Caching (`src/hooks/useIdentityClient.ts`)

```typescript
const readOnlyCache = new Map<string, IdentityClientReadOnly>();
```

- `IdentityClientReadOnly` is expensive to construct (auto-discovers the identity package ID on-chain).
- Cached per network name (e.g. `"localnet"`); the same JS object is returned to every component on the same network.
- **Critical:** `IdentityClient.create(readOnlyClient, ...)` calls `__destroy_into_raw()` on its argument, consuming the WASM pointer. Never pass the cached singleton — always construct a **fresh** `IdentityClientReadOnly` inside `createIdentityClient()`.

## 4. DID Persistence (`src/App.tsx` + `src/storage/vault/vaultDb.ts`)

DIDs are stored in the `dids` IndexedDB object store:

```
Store: "dids"  keyPath: "did"  index: "by_account" → [address, network]
```

- `listDids(db, address, network)` — returns DID strings for the connected wallet + network.
- `putDid(db, address, network, did)` — idempotent upsert.
- `deleteDid(db, did)` — triggered by the Forget button in `IdentityDashboard`.
- List is reloaded whenever the connected account or network changes.

## 5. Custom CSS Classes (`src/index.css`)

| Class | Purpose |
|---|---|
| `.card` | Semi-transparent dark card with backdrop blur |
| `.btn-primary` | IOTA-600 button (with disabled state) |
| `.btn-secondary` | Gray-800 button |
| `.btn-danger` | Red button for destructive actions |
| `.input` | Dark form input with iota-500 focus ring |
| `.label` | Small uppercase form label |
| `.did-badge` | Monospace DID display pill |
| `.status-active` / `.status-deactivated` | Color-coded status pills |
