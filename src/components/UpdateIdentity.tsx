import { useState } from "react";
import { IotaDID, Service } from "@iota/identity-wasm/web";
import { useIdentityClient } from "../hooks/useIdentityClient";

interface Props {
  did: string;
  onUpdated: () => void;
}

type UpdateMode = "add-service" | "deactivate";

function Spinner() {
  return <span className="spinner" style={{ width: 14, height: 14 }} />;
}

export function UpdateIdentity({ did, onUpdated }: Props) {
  const { readOnlyClient, createIdentityClient } = useIdentityClient();
  const [mode, setMode] = useState<UpdateMode>("add-service");

  const [serviceId,       setServiceId]       = useState("#linked-domain");
  const [serviceType,     setServiceType]     = useState("LinkedDomains");
  const [serviceEndpoint, setServiceEndpoint] = useState("https://example.com");

  const [busy,      setBusy]      = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [error,     setError]     = useState<string | null>(null);

  async function handleUpdate() {
    if (!readOnlyClient) return;
    setBusy(true);
    setError(null);

    try {
      const identityClient = await createIdentityClient();
      const iotaDid = IotaDID.parse(did);

      const identity = await identityClient.getIdentity(iotaDid.toObjectID());
      const onChainIdentity = identity.toFullFledged();
      if (!onChainIdentity) throw new Error("This DID is not a full on-chain identity.");

      const controllerToken = await onChainIdentity.getControllerToken(identityClient);
      if (!controllerToken) throw new Error("Connected wallet is not a controller of this identity.");

      if (mode === "add-service") {
        const document = await identityClient.resolveDid(iotaDid);
        document.insertService(
          new Service({
            id: iotaDid.join(serviceId),
            type: serviceType,
            serviceEndpoint,
          }),
        );
        await onChainIdentity
          .updateDidDocument(document, controllerToken)
          .buildAndExecute(identityClient);
      } else {
        await onChainIdentity
          .deactivateDid(controllerToken)
          .buildAndExecute(identityClient);
      }

      onUpdated();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.toLowerCase().includes("rejected") || msg.toLowerCase().includes("cancel")) {
        setError("Transaction cancelled in wallet.");
      } else {
        setError(msg);
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card" style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
        <div>
          <h2 style={{ fontSize: 16, fontWeight: 700, color: "var(--text-1)", marginBottom: 4 }}>Update Identity</h2>
          <p style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "#7dd3fc", wordBreak: "break-all", lineHeight: 1.5 }}>
            {did}
          </p>
        </div>
      </div>

      {/* Mode tabs (underline style) */}
      <div style={{ display: "flex", gap: 0, borderBottom: "1px solid var(--border)" }}>
        {([["add-service", "Add Service"], ["deactivate", "Deactivate"]] as const).map(([m, label]) => (
          <button
            key={m}
            onClick={() => { setMode(m); setConfirmed(false); }}
            style={{
              padding: "8px 16px",
              fontSize: 13,
              fontWeight: 500,
              cursor: "pointer",
              background: "transparent",
              border: "none",
              fontFamily: "inherit",
              borderBottom: mode === m ? "2px solid #0ea5e9" : "2px solid transparent",
              color: mode === m ? "#38bdf8" : "var(--text-2)",
              marginBottom: -1,
              transition: "all 0.15s",
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Add service form */}
      {mode === "add-service" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div>
            <label className="label">Service fragment (e.g. #linked-domain)</label>
            <input className="input" value={serviceId}
              onChange={(e) => setServiceId(e.target.value)} placeholder="#linked-domain" />
          </div>
          <div>
            <label className="label">Service type</label>
            <input className="input" value={serviceType}
              onChange={(e) => setServiceType(e.target.value)} placeholder="LinkedDomains" />
          </div>
          <div>
            <label className="label">Service endpoint URL</label>
            <input className="input" value={serviceEndpoint}
              onChange={(e) => setServiceEndpoint(e.target.value)} placeholder="https://example.com" />
          </div>
        </div>
      )}

      {/* Deactivate panel */}
      {mode === "deactivate" && (
        <div className="danger-notice" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <p style={{ fontSize: 13, fontWeight: 600, color: "#fca5a5" }}>This will deactivate the DID</p>
          <p style={{ fontSize: 12, color: "#f87171", lineHeight: 1.6, opacity: 0.8 }}>
            The DID document will be marked as deactivated on-chain. The Identity object is not
            deleted and can be reactivated by the controller.
          </p>
          <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", fontSize: 13, color: "#fca5a5" }}>
            <input
              type="checkbox"
              checked={confirmed}
              onChange={(e) => setConfirmed(e.target.checked)}
              style={{ width: 14, height: 14, accentColor: "#f87171" }}
            />
            I understand this action
          </label>
        </div>
      )}

      {error && <div className="banner-error">{error}</div>}

      <div>
        {mode === "deactivate" ? (
          <button
            className="btn btn-danger"
            onClick={handleUpdate}
            disabled={busy || !confirmed}
            style={{ width: "100%", padding: "11px 20px" }}
          >
            {busy ? <><Spinner /> Publishing…</> : "Deactivate DID"}
          </button>
        ) : (
          <button
            className="btn btn-primary"
            onClick={handleUpdate}
            disabled={busy || !readOnlyClient}
            style={{ width: "100%", padding: "11px 20px" }}
          >
            {busy ? <><Spinner /> Publishing…</> : "Add Service"}
          </button>
        )}
      </div>
    </div>
  );
}
