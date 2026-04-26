# Testing Reference

## Vitest unit / component coverage

| Test file | What it covers |
|---|---|
| `src/__tests__/components/Header.test.tsx` | NetworkSelect, ConnectButton rendering |
| `src/__tests__/components/VaultGate.test.tsx` | Register / unlock / unsupported state panels |
| `src/__tests__/components/VaultBackup.test.tsx` | Export + import happy path and error paths |
| `src/__tests__/components/CreateIdentity.test.tsx` | DID creation form and spinner |
| `src/__tests__/components/IdentityDashboard.test.tsx` | DID display, status badge, inline add/remove forms, Danger Zone accordion, Forget, raw JSON toggle |
| `src/__tests__/components/UpdateIdentity.test.tsx` | Add/remove keys and services, deactivate/reactivate edge cases |
| `src/__tests__/components/ResolveIdentity.test.tsx` | Input states, loading, error messages, document display, raw JSON toggle, Enter key |
| `src/__tests__/components/CopyButton.test.tsx` | Clipboard write, icon transition, revert timer |
| `src/__tests__/storage/PasskeyJwkStorage.test.ts` | `generate`, `exists`/`delete`, `sign` (real Ed25519 verify), `insert` (idempotent) |
| `src/__tests__/storage/vaultDb.test.ts` | DID store CRUD + cross-account/network isolation, JWK + KeyId store round-trips |
| `src/__tests__/storage/vaultBackup.test.ts` | PBKDF2+AES-GCM round-trip, wrong password, tampered ciphertext, version guard |
| `src/__tests__/lib/explorerUrl.test.ts` | All network variants |
| `src/__tests__/lib/retryAsync.test.ts` | Retry policy, immediate success, max attempts |

## Extending tests

- **New storage helper or crypto function** → add a Vitest test in `src/__tests__/storage/` or `src/__tests__/lib/`.
- **New UI component** → add component tests in `src/__tests__/components/`; mock `useIdentityClient` using the pattern in `IdentityDashboard.test.tsx`.
- **New inline action in `IdentityDashboard`** → use the `makeOnChainIdentity()` helper already established in `IdentityDashboard.test.tsx`.
- **New vault state or panel** → add E2E coverage in `e2e/vault-lifecycle.spec.ts`.
- **New backup behaviour** → add E2E coverage in `e2e/backup-restore.spec.ts`.
- **New DID operation** → add E2E coverage in `e2e/did-lifecycle.spec.ts`.
- Always test idempotency for import operations.

## E2E authoring notes

- Use `getByRole("button", { name: /…/i })` and `getByPlaceholder(…)` — labels often lack `htmlFor` so `getByLabel` won't work.
- Virtual authenticator must be installed **after** `page.goto()` — Chrome's WebAuthn environment resets on navigation.
- `addInitScript` fires on every navigation including reloads; use the `sessionStorage` guard in `clearVaultDbScript()` to avoid wiping IDB on in-test reloads.
- To simulate "new device": fire `indexedDB.deleteDatabase(…)` without awaiting, then `page.reload()` — the reload closes the open connection, letting the delete complete.
- DID tests that resolve freshly-created DIDs should use `expect().toPass()` with retries — the localnet node can be transiently inconsistent immediately after object creation.
- Default per-test timeout is 30 s. Add `test.setTimeout(90_000)` for tests with multiple long async operations (fund + create + resolve).
