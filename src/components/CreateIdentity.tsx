import { useState } from "react";
import {
  IotaDocument,
  IotaDID,
  JwkMemStore,
  MethodScope,
  Storage,
} from "@iota/identity-wasm/web";
import type { JwsAlgorithm } from "@iota/identity-wasm/web";
import { useIotaClient, useIotaClientContext } from "@iota/dapp-kit";
import { useIdentityClient } from "../hooks/useIdentityClient";

interface Props {
  onCreated: (did: string) => void;
  storage: Storage;
}

export function CreateIdentity({ onCreated, storage }: Props) {
  const { readOnlyClient, createIdentityClient, isReady } = useIdentityClient();
  const sdkClient = useIotaClient();
  const { network } = useIotaClientContext();
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleCreate() {
    if (!readOnlyClient) return;
    setCreating(true);
    setError(null);

    try {
      // ── 1. Create the signing-capable client ──────────────────────────────
      const identityClient = await createIdentityClient();
      const network = identityClient.network();

      // ── 2. Build an unpublished DID document ──────────────────────────────
      const unpublished = new IotaDocument(network);
      await unpublished.generateMethod(
        storage,
        JwkMemStore.ed25519KeyType(),
        "EdDSA" as JwsAlgorithm,
        "#key-1",
        MethodScope.VerificationMethod(),
      );

      // ── 3. Build and sign the transaction ─────────────────────────────────
      // Pattern from examples/src/1_advanced/11_advanced_transactions.ts:
      //   .build(identityClient) calls identityClient.signer().sign() internally,
      //   which triggers the wallet popup via WalletSigner, then returns:
      //     [txDataBcs: Uint8Array, signatures: string[], tx: Transaction<CreateIdentity>]
      // We avoid buildAndExecute because its result-processing path tries to
      // deserialise a WasmControllerCap and crashes in this beta version of the library.
      const [txDataBcs, signatures] = await (
        identityClient
          .createIdentity(unpublished)
          .finish()
          .withSender(identityClient.senderAddress()) as unknown as {
          build: (client: unknown) => Promise<[Uint8Array, string[], unknown]>;
        }
      ).build(identityClient);

      // ── 4. Execute and capture object changes ──────────────────────────────
      const result = await (sdkClient as unknown as {
        executeTransactionBlock: (args: {
          transactionBlock: Uint8Array;
          signature: string[];
          options: object;
        }) => Promise<{ objectChanges?: Array<{ type: string; objectType?: string; objectId: string }> }>;
      }).executeTransactionBlock({
        transactionBlock: txDataBcs,
        signature: signatures,
        options: { showObjectChanges: true },
      });

      // ── 5. Find the newly created Identity object ──────────────────────────
      const identityChange = (result.objectChanges ?? []).find(
        (c) => c.type === "created" && c.objectType?.includes("::identity::Identity"),
      );
      if (!identityChange) {
        throw new Error("Identity object not found in transaction output.");
      }

      // ── 6. Derive the DID from the on-chain object ID ─────────────────────
      // Avoids tx.apply() which also crashes on WasmControllerCap in this beta.
      const did = IotaDID.fromObjectId(identityChange.objectId, network).toString();
      onCreated(did);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="card space-y-5">
      <div>
        <h2 className="text-lg font-semibold text-gray-100">Create a new Identity</h2>
        <p className="mt-1 text-sm text-gray-400">
          Publishes a DID document on the IOTA ledger. Your connected wallet pays for gas
          and becomes the sole controller of the identity.
        </p>
      </div>

      {/* What gets created */}
      <div className="bg-gray-800/50 rounded-lg p-4 space-y-2 text-sm">
        <p className="font-medium text-gray-300">What will be created</p>
        <ul className="text-gray-400 space-y-1 list-disc list-inside">
          <li>A new DID anchored to the IOTA ledger</li>
          <li>An Ed25519 verification method (#key-1)</li>
          <li>An on-chain Identity object owned by your wallet address</li>
        </ul>
      </div>

      {error && (
        <div className="bg-red-950/50 border border-red-800/50 rounded-lg p-3 text-sm text-red-300">
          {error}
        </div>
      )}

      <button
        onClick={handleCreate}
        disabled={creating || !isReady}
        className="btn-primary w-full py-2.5"
      >
        {creating ? (
          <span className="flex items-center justify-center gap-2">
            <Spinner /> Publishing identity…
          </span>
        ) : (
          "Create Identity"
        )}
      </button>

      <p className="text-xs text-gray-500 text-center">
        Requires a small amount of IOTA for gas. Get test tokens from the{" "}
        <a
          href={
            network === "localnet"
              ? "http://localhost:9123"
              : `https://faucet.${network}.iota.cafe`
          }
          target="_blank"
          rel="noreferrer"
          className="text-iota-400 hover:underline"
        >
          {network} faucet
        </a>
        .
      </p>
    </div>
  );
}

function Spinner() {
  return (
    <svg
      className="animate-spin h-4 w-4"
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
    >
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
      />
    </svg>
  );
}
