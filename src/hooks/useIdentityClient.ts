import { useCallback, useEffect, useState } from "react";
import { useCurrentAccount, useIotaClient, useIotaClientContext, useSignTransaction } from "@iota/dapp-kit";
import {
  IdentityClient,
  IdentityClientReadOnly,
  JwkMemStore,
  KeyIdMemStore,
  Storage,
} from "@iota/identity-wasm/web";
import type { IotaClient } from "@iota/iota-sdk/client";
import { WalletSigner } from "../lib/walletSigner";

// Singleton read-only client keyed by the node URL.
// Re-created only when the active network changes, not on wallet changes.
const readOnlyCache = new Map<string, IdentityClientReadOnly>();

/**
 * @param externalStorage - Optional `Storage` instance to use instead of the
 *   default in-memory store. Pass the Passkey vault `Storage` when available.
 *   Falls back to `JwkMemStore` + `KeyIdMemStore` when null or omitted.
 */
export function useIdentityClient(externalStorage?: Storage | null) {
  const account = useCurrentAccount();
  const sdkClient = useIotaClient();
  const { network } = useIotaClientContext();
  const { mutateAsync: signTransaction } = useSignTransaction();

  const [readOnlyClient, setReadOnlyClient] = useState<IdentityClientReadOnly | null>(null);
  const [initError, setInitError] = useState<string | null>(null);
  const [initialising, setInitialising] = useState(false);

  // Fallback in-memory storage used when no external (Passkey) storage is provided.
  const [memStorage] = useState(() => new Storage(new JwkMemStore(), new KeyIdMemStore()));
  const storage = externalStorage ?? memStorage;

  useEffect(() => {
    let cancelled = false;
    setInitError(null);
    setInitialising(true);

    // Use the active network name as the cache key so switching networks always
    // creates a fresh IdentityClientReadOnly connected to the correct chain.
    // (IotaClient stores its URL in a private WeakMap; `network` is the reliable
    // identifier exposed by IotaClientProvider.)
    if (readOnlyCache.has(network)) {
      setReadOnlyClient(readOnlyCache.get(network)!);
      setInitialising(false);
      return;
    }

    const customPkgId = import.meta.env.VITE_IOTA_IDENTITY_PKG_ID as string | undefined;
    IdentityClientReadOnly.create(sdkClient as unknown as IotaClient, customPkgId ?? null)
      .then((client) => {
        if (cancelled) return;
        readOnlyCache.set(network, client);
        setReadOnlyClient(client);
      })
      .catch((err: Error) => {
        if (cancelled) return;
        setInitError(`Failed to initialise identity client: ${err.message}`);
      })
      .finally(() => {
        if (!cancelled) setInitialising(false);
      });

    return () => {
      cancelled = true;
    };
  }, [sdkClient, network]);

  // Build a full IdentityClient backed by the connected browser wallet.
  const createIdentityClient = useCallback(async (): Promise<IdentityClient> => {
    if (!readOnlyClient) throw new Error("Identity client not initialised yet.");
    if (!account) throw new Error("No wallet connected. Please connect your wallet first.");
    if (!account.publicKey || account.publicKey.length === 0) {
      throw new Error(
        "The connected wallet did not expose its public key. " +
          "Try a different wallet or account.",
      );
    }

    const pubKeyBytes = new Uint8Array(account.publicKey);
    const signer = new WalletSigner(
      pubKeyBytes,
      (args) => signTransaction(args),
    );

    // IMPORTANT: IdentityClient.create() calls __destroy_into_raw() on the
    // readOnly client it receives — it takes ownership of the WASM pointer and
    // zeros it out. Passing the shared `readOnlyClient` would leave every other
    // consumer (IdentityDashboard, ResolveIdentity, …) with a null pointer,
    // causing "null pointer passed to rust" errors on any subsequent call.
    //
    // Fix: create a dedicated IdentityClientReadOnly for this operation so the
    // shared one is never consumed.
    const customPkgId = import.meta.env.VITE_IOTA_IDENTITY_PKG_ID as string | undefined;
    const privateReadOnly = await IdentityClientReadOnly.create(sdkClient as unknown as IotaClient, customPkgId ?? null);
    return IdentityClient.create(privateReadOnly, signer);
  }, [readOnlyClient, account, signTransaction, sdkClient]);

  return {
    /** Read-only client for resolving DIDs without wallet interaction. */
    readOnlyClient,
    /** In-memory key storage for DID verification methods (session-scoped). */
    storage,
    /** Create a signing-capable IdentityClient backed by the browser wallet. */
    createIdentityClient,
    initialising,
    initError,
    isReady: !!readOnlyClient,
    isWalletConnected: !!account,
  };
}
