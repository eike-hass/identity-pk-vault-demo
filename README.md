# Identity PK Vault Demo

A browser dApp for creating and managing [IOTA Identity](https://docs.iota.org/developer/iota-identity/) DIDs using the [IOTA dApp Kit](https://docs.iota.org/developer/ts-sdk/dapp-kit/) and a hardware-bound passkey vault.

## Features

| Feature              | Description                                                                                                                                                         |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Passkey Vault**    | Signing keys are encrypted with a WebAuthn PRF-derived key (Touch ID / Windows Hello / PIN). Keys survive page reloads without ever leaving the device unencrypted. |
| **Create Identity**  | Publishes a new `did:iota` DID document on the ledger. Your wallet pays gas and becomes the sole controller.                                                        |
| **Manage Identity**  | Inline add / remove verification keys and service endpoints directly from the identity card. Each change is signed and published on-chain.                          |
| **Danger Zone**      | Deactivate, reactivate, or permanently delete an identity — gated by confirmation checkboxes inside a collapsible accordion.                                        |
| **Resolve DID**      | Look up any `did:iota` identifier on the current network.                                                                                                           |
| **Network switcher** | Dropdown to toggle between testnet, devnet, and localnet from the header.                                                                                           |
| **Vault Backup**     | Export an encrypted backup file; restore keys and DIDs on a new device.                                                                                             |

## Architecture

```
Browser Wallet (IOTA Wallet extension)
        │
        │  useSignTransaction (dApp Kit)
        │
        ▼
  WalletSigner          ← bridges wallet signing to identity library's
  (src/lib/walletSigner.ts)   TransactionSigner interface
        │
        │  IdentityClient.create(readOnlyClient, walletSigner)
        │
        ▼
  @iota/identity-wasm/web   ← WASM build of the Rust identity library
        │
        ▼
  IOTA Ledger (testnet / devnet / localnet)

Passkey (platform authenticator — Touch ID, Windows Hello, PIN)
  └─ WebAuthn PRF extension → 32-byte deterministic output
       └─ HKDF-SHA-256 → AES-GCM-256 vault key (in memory, non-extractable)
            └─ encrypt/decrypt Ed25519 private scalars in IndexedDB
```

## Getting started

### Prerequisites

- Node.js 20+
- An IOTA browser wallet (e.g. [IOTA Wallet](https://chromewebstore.google.com/detail/iota-wallet/)) **or** use mock mode (see below)
- Test IOTA tokens — use the [testnet faucet](https://faucet.testnet.iota.cafe)
- A platform authenticator: Touch ID, Windows Hello, or a device PIN (for the passkey vault)

### Install and run

```bash
npm install
npm run dev
```

Open [http://localhost:5173](http://localhost:5173), connect your wallet, register your passkey vault, and click **Create Identity**.

### Build for production

```bash
npm run build
npm run preview
```

## Mock / dev mode (no wallet extension required)

Copy `.env.local.example` to `.env.local` to enable a stable burner wallet backed by an Ed25519 keypair persisted in `localStorage`. No browser extension is needed — transactions are signed in-memory.

```bash
cp .env.local.example .env.local
npm run dev
```

Click **Fund wallet** in the dev banner to get test tokens from the localnet faucet, or switch to testnet and use the public faucet.

## Dependencies

| Package                 | Role                                               |
| ----------------------- | -------------------------------------------------- |
| `@iota/identity-wasm`   | WASM build of IOTA Identity — DID/VC operations    |
| `@iota/dapp-kit`        | React hooks and components for wallet connection   |
| `@iota/iota-sdk`        | IOTA TypeScript SDK — client, transactions, crypto |
| `@noble/ed25519`        | Ed25519 key generation and signing                 |
| `@tanstack/react-query` | Async state management (required by dApp Kit)      |

## Browser compatibility

| Feature                      | Chrome/Edge 116+ | Safari 17.4+ | Firefox                                      |
| ---------------------------- | ---------------- | ------------ | -------------------------------------------- |
| WebAuthn PRF (passkey vault) | ✓                | ✓            | ✗ — falls back to session-only `JwkMemStore` |
| General dApp functionality   | ✓                | ✓            | ✓                                            |

## Testing

```bash
# Unit tests (Vitest)
npm test

# E2E tests (Playwright — vault + backup, no localnet needed)
npm run test:e2e

# DID lifecycle E2E (requires a running localnet + published identity package)
export IOTA_IDENTITY_PKG_ID=0x<package-id>
npm run test:e2e:did
```
