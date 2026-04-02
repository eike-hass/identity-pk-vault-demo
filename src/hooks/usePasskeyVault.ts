/**
 * React hook that manages the Passkey key vault lifecycle.
 *
 * State machine:
 *
 *   "checking"     — IDB and capability checks in progress (initial state)
 *   "unsupported"  — PRF extension not available in this browser
 *   "unregistered" — PRF is available but no Passkey has been registered yet
 *   "locked"       — Passkey is registered; vault key not in memory
 *   "unlocked"     — Vault key is in memory; storage instances are ready
 *   "error"        — An unexpected error occurred; `error` contains the message
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { Storage } from "@iota/identity-wasm/web";
import { PasskeyJwkStorage } from "../storage/PasskeyJwkStorage";
import { PasskeyKeyIdStorage } from "../storage/PasskeyKeyIdStorage";
import { isPasskeyRegistered, isPrfSupported } from "../storage/vault/passkeyAuth";

export type VaultStatus =
  | "checking"
  | "unsupported"
  | "unregistered"
  | "locked"
  | "unlocked"
  | "error";

export interface UsePasskeyVaultResult {
  status: VaultStatus;
  /** WASM Storage instance wrapping both stores; null until vault is unlocked. */
  storage: Storage | null;
  /** Register a new Passkey and unlock the vault. */
  register(): Promise<void>;
  /** Authenticate with the existing Passkey and unlock the vault. */
  unlock(): Promise<void>;
  /** Export all vault data as a password-protected JSON string. Rejects if locked. */
  exportBackup(password: string): Promise<string>;
  /** Import vault data from a backup JSON string. Rejects if locked or wrong password. */
  importBackup(json: string, password: string): Promise<{ keysImported: number }>;
  /** Register a new Passkey then immediately restore from a backup. */
  registerAndRestore(json: string, password: string): Promise<{ keysImported: number }>;
  /** Error message when status === "error". */
  error: string | null;
}

export function usePasskeyVault(): UsePasskeyVaultResult {
  const [status, setStatus] = useState<VaultStatus>("checking");
  const [jwkStorage, setJwkStorage] = useState<PasskeyJwkStorage | null>(null);
  const [keyIdStorage, setKeyIdStorage] = useState<PasskeyKeyIdStorage | null>(null);
  const [error, setError] = useState<string | null>(null);

  // ── Initial capability & registration check ─────────────────────────────────
  useEffect(() => {
    let cancelled = false;

    async function check() {
      if (!isPrfSupported()) {
        if (!cancelled) setStatus("unsupported");
        return;
      }
      try {
        const registered = await isPasskeyRegistered();
        if (!cancelled) setStatus(registered ? "locked" : "unregistered");
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : String(err));
          setStatus("error");
        }
      }
    }

    check();
    return () => { cancelled = true; };
  }, []);

  // ── Register ────────────────────────────────────────────────────────────────
  const register = useCallback(async () => {
    setError(null);
    try {
      const jwk = await PasskeyJwkStorage.register();
      const kid = await PasskeyKeyIdStorage.open();
      setJwkStorage(jwk);
      setKeyIdStorage(kid);
      setStatus("unlocked");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setStatus("error");
    }
  }, []);

  // ── Unlock ──────────────────────────────────────────────────────────────────
  const unlock = useCallback(async () => {
    setError(null);
    try {
      const jwk = await PasskeyJwkStorage.unlock();
      const kid = await PasskeyKeyIdStorage.open();
      setJwkStorage(jwk);
      setKeyIdStorage(kid);
      setStatus("unlocked");
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
      // If PRF is unavailable for the stored credential (e.g. the credential was
      // registered from a different browser), allow re-registration rather than
      // landing on the dead-end "error" screen.
      if (msg.includes("PRF") || msg.includes("transient")) {
        setStatus("unregistered");
      } else {
        setStatus("error");
      }
    }
  }, []);

  // ── Export backup ────────────────────────────────────────────────────────────
  const exportBackup = useCallback(async (password: string): Promise<string> => {
    if (!jwkStorage) throw new Error("Vault is locked. Unlock before exporting.");
    return jwkStorage.exportBackup(password);
  }, [jwkStorage]);

  // ── Import backup ────────────────────────────────────────────────────────────
  const importBackup = useCallback(async (
    json: string,
    password: string,
  ): Promise<{ keysImported: number }> => {
    if (!jwkStorage) throw new Error("Vault is locked. Unlock before importing.");
    return jwkStorage.importBackup(json, password);
  }, [jwkStorage]);

  // ── Register + restore ───────────────────────────────────────────────────────
  const registerAndRestore = useCallback(async (
    json: string,
    password: string,
  ): Promise<{ keysImported: number }> => {
    setError(null);
    try {
      const jwk = await PasskeyJwkStorage.register();
      const kid = await PasskeyKeyIdStorage.open();
      const result = await jwk.importBackup(json, password);
      setJwkStorage(jwk);
      setKeyIdStorage(kid);
      setStatus("unlocked");
      return result;
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setStatus("unregistered");
      throw err;
    }
  }, []);

  // ── Build WASM Storage when both stores are ready ──────────────────────────
  const storage = useMemo(() => {
    if (!jwkStorage || !keyIdStorage) return null;
    return new Storage(jwkStorage, keyIdStorage);
  }, [jwkStorage, keyIdStorage]);

  return { status, storage, register, unlock, exportBackup, importBackup, registerAndRestore, error };
}
