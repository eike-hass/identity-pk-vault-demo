# Passkey Key Vault — Architecture Reference

DID signing keys are persisted in a hardware-bound encrypted vault instead of the session-scoped `JwkMemStore`. This makes identity management (add/remove keys, services, deactivate) possible across page reloads.

## Crypto pipeline

```
Passkey (Touch ID / Windows Hello / PIN)
  └─ WebAuthn PRF extension → 32-byte deterministic output
       └─ HKDF-SHA-256 → AES-GCM-256 vault key (in memory, non-extractable)
            └─ encrypt/decrypt Ed25519 private scalars in IndexedDB
```

## Source files

| File | Purpose |
|---|---|
| `src/storage/vault/vaultDb.ts` | Typed IndexedDB wrapper (`iota-identity-vault` v3) |
| `src/storage/vault/passkeyAuth.ts` | WebAuthn `create`/`get` + HKDF key derivation |
| `src/storage/vault/vaultBackup.ts` | PBKDF2 + AES-GCM backup encrypt/decrypt (pure crypto, no IDB) |
| `src/storage/PasskeyJwkStorage.ts` | `JwkStorage` impl — generate, encrypt, sign, backup/restore |
| `src/storage/PasskeyKeyIdStorage.ts` | `KeyIdStorage` impl — plaintext IDB |
| `src/hooks/usePasskeyVault.ts` | `VaultStatus` state machine, all vault operations |
| `src/components/VaultGate.tsx` | UI guard rendered before app tabs |
| `src/components/VaultBackup.tsx` | Export + import backup panels |

## VaultStatus state machine

```
"checking"     → isPrfSupported? No  → "unsupported"  (falls back to JwkMemStore + amber banner)
               → isRegistered?  No  → "unregistered" (VaultGate shows Create panel)
               → isRegistered?  Yes → "locked"        (VaultGate shows Unlock panel)
"unregistered" → register()              → "unlocked"
               → registerAndRestore()    → "unlocked"  (keys + DIDs imported from backup)
"locked"       → unlock()               → "unlocked"
               → unlock() PRF error     → "unregistered" (allow re-registration)
"unlocked"     → VaultGate renders children (normal app tabs)
any            → unexpected error        → "error"
```

## Backup file format

```json
{
  "version": 1,
  "created": "<ISO-8601>",
  "kdf": { "algorithm": "PBKDF2", "hash": "SHA-256", "iterations": 600000, "salt": "<b64url>" },
  "iv": "<b64url 12 B>",
  "payload": "<b64url — AES-GCM ciphertext of BackupPayload JSON>"
}
```

`BackupPayload` contains `keys` (raw Ed25519 scalars), `keyIds` (MethodDigest mappings), and `dids` (DID records). The `credential` store is excluded — it is device-bound.

## Browser compatibility

| Feature | Chrome/Edge | Safari | Firefox |
|---|---|---|---|
| WebAuthn PRF | 116+ ✓ | 17.4+ ✓ | ✗ — falls back to `JwkMemStore` |

## Mock mode — why a stable burner keypair matters

DIDs are indexed in IDB by `(walletAddress, network)`. A random keypair on every reload (as the old `enableUnsafeBurner` did) made DID records unreachable after each reload. `registerStableBurnerWallet()` generates the keypair once and persists it in `localStorage`.

## @noble/ed25519 v3 API

The dApp uses v3, which differs from v1 used internally by the WASM bindings:
- `ed.keygenAsync()` → `{ secretKey, publicKey }`
- `ed.signAsync(message, secretKey)`
- No `ed.etc.sha512Sync` needed in v3
