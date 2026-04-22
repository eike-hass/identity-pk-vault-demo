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

function Spinner() {
  return <span className="spinner" style={{ width: 14, height: 14 }} />;
}

const WHAT_WILL_BE_CREATED = [
  "A new DID anchored to the IOTA ledger",
  "An Ed25519 verification method (#key-1)",
  "An on-chain Identity object owned by your wallet",
];

export function CreateIdentity({ onCreated, storage }: Props) {
  const { readOnlyClient, createIdentityClient, isReady } = useIdentityClient();
  const sdkClient = useIotaClient();
  const { network } = useIotaClientContext();
  const [creating, setCreating] = useState(false);
  const [step, setStep] = useState<"signing" | "publishing" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const stepLabel = step === "signing"
    ? "Waiting for wallet signature…"
    : step === "publishing"
    ? "Publishing to IOTA ledger…"
    : "";

  async function handleCreate() {
    if (!readOnlyClient) return;
    setCreating(true);
    setStep("signing");
    setError(null);

    try {
      const identityClient = await createIdentityClient();
      const network = identityClient.network();

      const unpublished = new IotaDocument(network);
      await unpublished.generateMethod(
        storage,
        JwkMemStore.ed25519KeyType(),
        "EdDSA" as JwsAlgorithm,
        "#key-1",
        MethodScope.VerificationMethod(),
      );

      setStep("publishing");

      const [txDataBcs, signatures] = await (
        identityClient
          .createIdentity(unpublished)
          .finish()
          .withSender(identityClient.senderAddress()) as unknown as {
          build: (client: unknown) => Promise<[Uint8Array, string[], unknown]>;
        }
      ).build(identityClient);

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

      const identityChange = (result.objectChanges ?? []).find(
        (c) => c.type === "created" && c.objectType?.includes("::identity::Identity"),
      );
      if (!identityChange) {
        throw new Error("Identity object not found in transaction output.");
      }

      const did = IotaDID.fromObjectId(identityChange.objectId, network).toString();
      onCreated(did);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setCreating(false);
      setStep(null);
    }
  }

  const faucetUrl = network === "localnet"
    ? "http://localhost:9123"
    : `https://faucet.${network}.iota.cafe`;

  return (
    <div className="card fade-in" style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div>
        <h2 style={{ fontSize: 17, fontWeight: 700, color: "var(--text-1)", marginBottom: 6 }}>
          Create a new identity
        </h2>
        <p style={{ fontSize: 13, color: "var(--text-2)", lineHeight: 1.6 }}>
          Publishes a DID document on the IOTA ledger. Your connected wallet pays for gas and
          becomes the sole controller.
        </p>
      </div>

      {/* What will be created */}
      <div style={{
        background: "rgba(255,255,255,0.03)",
        border: "1px solid rgba(255,255,255,0.06)",
        borderRadius: 10,
        padding: "12px 14px",
      }}>
        <p style={{ fontSize: 12, fontWeight: 600, color: "var(--text-2)", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 10 }}>
          What will be created
        </p>
        <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
          {WHAT_WILL_BE_CREATED.map((item, i) => (
            <div key={i} style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
              <span style={{
                width: 16, height: 16, borderRadius: "50%",
                background: "rgba(14,165,233,0.15)",
                border: "1px solid rgba(14,165,233,0.3)",
                display: "flex", alignItems: "center", justifyContent: "center",
                flexShrink: 0, marginTop: 1,
              }}>
                <span style={{ width: 5, height: 5, borderRadius: "50%", background: "#38bdf8", display: "block" }} />
              </span>
              <span style={{ fontSize: 13, color: "var(--text-2)", lineHeight: 1.5 }}>{item}</span>
            </div>
          ))}
        </div>
      </div>

      {error && <div className="banner-error">{error}</div>}

      {/* Progress indicator */}
      {creating && (
        <div style={{
          display: "flex", alignItems: "center", gap: 10,
          padding: "10px 14px",
          background: "rgba(14,165,233,0.06)",
          border: "1px solid rgba(14,165,233,0.15)",
          borderRadius: 10,
        }}>
          <Spinner />
          <span style={{ fontSize: 13, color: "#7dd3fc" }}>{stepLabel}</span>
        </div>
      )}

      <button
        className="btn btn-primary"
        onClick={handleCreate}
        disabled={creating || !isReady}
        style={{ padding: "12px 20px", fontSize: 14 }}
      >
        {creating ? <><Spinner /> Publishing…</> : "Create Identity"}
      </button>

      <p style={{ fontSize: 12, color: "var(--text-3)", textAlign: "center" }}>
        Requires a small amount of IOTA for gas.{" "}
        <a href={faucetUrl} target="_blank" rel="noreferrer" style={{ color: "#38bdf8", textDecoration: "none" }}>
          Get test tokens ↗
        </a>
      </p>
    </div>
  );
}
