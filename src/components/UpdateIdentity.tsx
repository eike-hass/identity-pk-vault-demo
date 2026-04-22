import { useState } from "react";
import { DIDUrl, IotaDID, Service } from "@iota/identity-wasm/web";
import type { IotaDocument } from "@iota/identity-wasm/web";
import { useIdentityClient } from "../hooks/useIdentityClient";

interface Props {
  did: string;
  document: IotaDocument;
  onUpdated: () => void;
}

type UpdateMode = "add-service" | "remove-service" | "deactivate" | "reactivate";

function Spinner() {
  return <span className="spinner" style={{ width: 14, height: 14 }} />;
}

export function UpdateIdentity({ did, document, onUpdated }: Props) {
  const { readOnlyClient, createIdentityClient } = useIdentityClient();

  const isDeactivated = document.metadata().deactivated() ?? false;
  const existingServices = document.service();

  const defaultMode: UpdateMode = isDeactivated ? "reactivate" : "add-service";
  const [mode, setMode] = useState<UpdateMode>(defaultMode);

  // Add service fields
  const [serviceId,       setServiceId]       = useState("#linked-domain");
  const [serviceType,     setServiceType]     = useState("LinkedDomains");
  const [serviceEndpoint, setServiceEndpoint] = useState("https://example.com");

  // Remove service field
  const [removeServiceId, setRemoveServiceId] = useState(
    existingServices.length > 0 ? existingServices[0].id().toString() : "",
  );

  // Deactivate / reactivate confirmation
  const [confirmed, setConfirmed] = useState(false);

  const [busy,  setBusy]  = useState(false);
  const [error, setError] = useState<string | null>(null);

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
        const doc = await identityClient.resolveDid(iotaDid);
        doc.insertService(
          new Service({
            id: iotaDid.join(serviceId),
            type: serviceType,
            serviceEndpoint,
          }),
        );
        await onChainIdentity
          .updateDidDocument(doc, controllerToken)
          .buildAndExecute(identityClient);

      } else if (mode === "remove-service") {
        const doc = await identityClient.resolveDid(iotaDid);
        doc.removeService(DIDUrl.parse(removeServiceId));
        await onChainIdentity
          .updateDidDocument(doc, controllerToken)
          .buildAndExecute(identityClient);

      } else if (mode === "deactivate") {
        await onChainIdentity
          .deactivateDid(controllerToken)
          .buildAndExecute(identityClient);

      } else if (mode === "reactivate") {
        const doc = await identityClient.resolveDid(iotaDid);
        doc.setMetadataDeactivated(false);
        await onChainIdentity
          .updateDidDocument(doc, controllerToken)
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

  const tabs: [UpdateMode, string][] = isDeactivated
    ? [["reactivate", "Reactivate"]]
    : [
        ["add-service",    "Add Service"],
        ["remove-service", "Remove Service"],
        ["deactivate",     "Deactivate"],
      ];

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

      {/* Mode tabs */}
      <div style={{ display: "flex", gap: 0, borderBottom: "1px solid var(--border)" }}>
        {tabs.map(([m, label]) => (
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

      {/* Remove service form */}
      {mode === "remove-service" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {existingServices.length === 0 ? (
            <p style={{ fontSize: 13, color: "var(--text-3)", fontStyle: "italic" }}>
              No services to remove.
            </p>
          ) : (
            <div>
              <label className="label">Select service to remove</label>
              <select
                className="input"
                value={removeServiceId}
                onChange={(e) => setRemoveServiceId(e.target.value)}
                style={{ cursor: "pointer" }}
              >
                {existingServices.map((svc) => {
                  const id = svc.id().toString();
                  return (
                    <option key={id} value={id}>
                      {id}
                    </option>
                  );
                })}
              </select>
              {removeServiceId && (
                <p style={{ fontSize: 11, color: "var(--text-3)", marginTop: 6 }}>
                  Type: {existingServices.find((s) => s.id().toString() === removeServiceId)?.type().join(", ")}
                </p>
              )}
            </div>
          )}
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

      {/* Reactivate panel */}
      {mode === "reactivate" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 10, padding: "12px 14px", background: "rgba(34,197,94,0.06)", border: "1px solid rgba(34,197,94,0.2)", borderRadius: 10 }}>
          <p style={{ fontSize: 13, fontWeight: 600, color: "#86efac" }}>Reactivate this DID</p>
          <p style={{ fontSize: 12, color: "#4ade80", lineHeight: 1.6, opacity: 0.85 }}>
            The DID document will be marked as active again on-chain. All existing verification
            methods and services will be restored.
          </p>
          <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", fontSize: 13, color: "#86efac" }}>
            <input
              type="checkbox"
              checked={confirmed}
              onChange={(e) => setConfirmed(e.target.checked)}
              style={{ width: 14, height: 14, accentColor: "#22c55e" }}
            />
            Reactivate this identity
          </label>
        </div>
      )}

      {error && <div className="banner-error">{error}</div>}

      <div>
        {mode === "deactivate" && (
          <button
            className="btn btn-danger"
            onClick={handleUpdate}
            disabled={busy || !confirmed}
            style={{ width: "100%", padding: "11px 20px" }}
          >
            {busy ? <><Spinner /> Publishing…</> : "Deactivate DID"}
          </button>
        )}
        {mode === "reactivate" && (
          <button
            className="btn btn-primary"
            onClick={handleUpdate}
            disabled={busy || !confirmed}
            style={{ width: "100%", padding: "11px 20px" }}
          >
            {busy ? <><Spinner /> Publishing…</> : "Reactivate DID"}
          </button>
        )}
        {mode === "add-service" && (
          <button
            className="btn btn-primary"
            onClick={handleUpdate}
            disabled={busy || !readOnlyClient}
            style={{ width: "100%", padding: "11px 20px" }}
          >
            {busy ? <><Spinner /> Publishing…</> : "Add Service"}
          </button>
        )}
        {mode === "remove-service" && (
          <button
            className="btn btn-danger"
            onClick={handleUpdate}
            disabled={busy || !readOnlyClient || existingServices.length === 0}
            style={{ width: "100%", padding: "11px 20px" }}
          >
            {busy ? <><Spinner /> Publishing…</> : "Remove Service"}
          </button>
        )}
      </div>
    </div>
  );
}
