import { useState } from "react";
import {
  DIDUrl, IotaDID, JwkMemStore, MethodScope, Service, Storage,
} from "@iota/identity-wasm/web";
import type { IotaDocument, JwsAlgorithm } from "@iota/identity-wasm/web";
import { useIdentityClient } from "../hooks/useIdentityClient";

interface Props {
  did: string;
  document: IotaDocument;
  storage: Storage;
  onUpdated: () => void;
  onDeleted: () => void;
}

type UpdateMode =
  | "add-key"
  | "add-service"
  | "remove-key"
  | "remove-service"
  | "deactivate"
  | "delete";

function Spinner() {
  return <span className="spinner" style={{ width: 14, height: 14 }} />;
}

/** Suggest the next unused #key-N fragment based on existing methods. */
function nextKeyFragment(doc: IotaDocument): string {
  const fragments = new Set(
    doc.methods().map((vm) => vm.id().toString().split("#")[1] ?? ""),
  );
  for (let i = 2; i < 100; i++) {
    if (!fragments.has(`key-${i}`)) return `#key-${i}`;
  }
  return "#key-new";
}

export function UpdateIdentity({ did, document, storage, onUpdated, onDeleted }: Props) {
  const { readOnlyClient, createIdentityClient } = useIdentityClient();

  const isDeactivated = document.metadata().deactivated() ?? false;
  const existingMethods  = document.methods();
  const existingServices = document.service();

  const defaultMode: UpdateMode = isDeactivated ? "deactivate" : "add-key";
  const [mode, setMode] = useState<UpdateMode>(defaultMode);

  // Add key
  const [keyFragment, setKeyFragment] = useState(() => nextKeyFragment(document));

  // Remove key
  const [removeMethodId, setRemoveMethodId] = useState(
    existingMethods.length > 0 ? existingMethods[0].id().toString() : "",
  );

  // Add service
  const [serviceId,       setServiceId]       = useState("#linked-domain");
  const [serviceType,     setServiceType]     = useState("LinkedDomains");
  const [serviceEndpoint, setServiceEndpoint] = useState("https://example.com");

  // Remove service
  const [removeServiceId, setRemoveServiceId] = useState(
    existingServices.length > 0 ? existingServices[0].id().toString() : "",
  );

  // Confirmations
  const [confirmed1, setConfirmed1] = useState(false);
  const [confirmed2, setConfirmed2] = useState(false);

  const [busy,  setBusy]  = useState(false);
  const [error, setError] = useState<string | null>(null);

  function resetConfirm() {
    setConfirmed1(false);
    setConfirmed2(false);
    setError(null);
  }

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

      if (mode === "add-key") {
        const doc = await identityClient.resolveDid(iotaDid);
        await doc.generateMethod(
          storage,
          JwkMemStore.ed25519KeyType(),
          "EdDSA" as JwsAlgorithm,
          keyFragment,
          MethodScope.VerificationMethod(),
        );
        await onChainIdentity
          .updateDidDocument(doc, controllerToken)
          .buildAndExecute(identityClient);
        onUpdated();

      } else if (mode === "add-service") {
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
        onUpdated();

      } else if (mode === "remove-key") {
        const doc = await identityClient.resolveDid(iotaDid);
        // purgeMethod removes from the document AND deletes the key from vault storage.
        await doc.purgeMethod(storage, DIDUrl.parse(removeMethodId));
        await onChainIdentity
          .updateDidDocument(doc, controllerToken)
          .buildAndExecute(identityClient);
        onUpdated();

      } else if (mode === "remove-service") {
        const doc = await identityClient.resolveDid(iotaDid);
        doc.removeService(DIDUrl.parse(removeServiceId));
        await onChainIdentity
          .updateDidDocument(doc, controllerToken)
          .buildAndExecute(identityClient);
        onUpdated();

      } else if (mode === "deactivate") {
        await onChainIdentity
          .deactivateDid(controllerToken)
          .buildAndExecute(identityClient);
        onUpdated();

      } else if (mode === "delete") {
        await onChainIdentity
          .deleteDid(controllerToken)
          .buildAndExecute(identityClient);
        // Trigger parent to remove DID from local IDB and the UI list.
        onDeleted();
      }

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

  const activeTabs: [UpdateMode, string][] = [
    ["add-key",        "Add Key"],
    ["add-service",    "Add Service"],
    ["remove-key",     "Remove Key"],
    ["remove-service", "Remove Service"],
    ["deactivate",     "Deactivate"],
    ["delete",         "Delete"],
  ];

  // Deactivated DIDs can only be reactivated (via the deactivate tab which now shows reactivate UI)
  // or deleted.
  const tabs: [UpdateMode, string][] = isDeactivated
    ? [["deactivate", "Reactivate"], ["delete", "Delete"]]
    : activeTabs;

  const isDangerMode = mode === "deactivate" || mode === "delete";

  return (
    <div className="card" style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      {/* Header */}
      <div>
        <h2 style={{ fontSize: 16, fontWeight: 700, color: "var(--text-1)", marginBottom: 4 }}>Update Identity</h2>
        <p style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "#7dd3fc", wordBreak: "break-all", lineHeight: 1.5 }}>
          {did}
        </p>
      </div>

      {/* Mode tabs — horizontally scrollable so they never wrap */}
      <div style={{ overflowX: "auto", marginBottom: -1 }}>
        <div style={{ display: "flex", borderBottom: "1px solid var(--border)", minWidth: "max-content" }}>
          {tabs.map(([m, label]) => {
            const danger = (m === "deactivate" && !isDeactivated) || m === "delete";
            return (
              <button
                key={m}
                onClick={() => { setMode(m); resetConfirm(); }}
                style={{
                  padding: "7px 12px",
                  fontSize: 12,
                  fontWeight: 500,
                  cursor: "pointer",
                  background: "transparent",
                  border: "none",
                  fontFamily: "inherit",
                  borderBottom: mode === m
                    ? `2px solid ${danger ? "#f87171" : "#0ea5e9"}`
                    : "2px solid transparent",
                  color: mode === m
                    ? (danger ? "#fca5a5" : "#38bdf8")
                    : "var(--text-2)",
                  marginBottom: -1,
                  transition: "all 0.15s",
                  whiteSpace: "nowrap",
                }}
              >
                {label}
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Add key ── */}
      {mode === "add-key" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div>
            <label className="label">Key fragment (e.g. #key-2)</label>
            <input className="input" value={keyFragment}
              onChange={(e) => setKeyFragment(e.target.value)} placeholder="#key-2" />
          </div>
          <p style={{ fontSize: 12, color: "var(--text-3)", lineHeight: 1.6 }}>
            Generates a new Ed25519 key, stores it in your passkey vault, and adds it to the DID
            document as a verification method.
          </p>
        </div>
      )}

      {/* ── Add service ── */}
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

      {/* ── Remove key ── */}
      {mode === "remove-key" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {existingMethods.length <= 1 ? (
            <div className="banner-warn">
              Cannot remove the only verification method. Add another key first.
            </div>
          ) : (
            <>
              <div>
                <label className="label">Select key to remove</label>
                <select className="input" value={removeMethodId}
                  onChange={(e) => setRemoveMethodId(e.target.value)}
                  style={{ cursor: "pointer" }}>
                  {existingMethods.map((vm) => {
                    const id = vm.id().toString();
                    return <option key={id} value={id}>{id}</option>;
                  })}
                </select>
              </div>
              <p style={{ fontSize: 12, color: "var(--text-3)", lineHeight: 1.6 }}>
                The key will be removed from the DID document on-chain and deleted from your
                passkey vault. This cannot be undone.
              </p>
            </>
          )}
        </div>
      )}

      {/* ── Remove service ── */}
      {mode === "remove-service" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {existingServices.length === 0 ? (
            <p style={{ fontSize: 13, color: "var(--text-3)", fontStyle: "italic" }}>
              No services to remove.
            </p>
          ) : (
            <div>
              <label className="label">Select service to remove</label>
              <select className="input" value={removeServiceId}
                onChange={(e) => setRemoveServiceId(e.target.value)}
                style={{ cursor: "pointer" }}>
                {existingServices.map((svc) => {
                  const id = svc.id().toString();
                  return <option key={id} value={id}>{id}</option>;
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

      {/* ── Deactivate / Reactivate ── */}
      {mode === "deactivate" && (
        isDeactivated ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 10, padding: "12px 14px", background: "rgba(34,197,94,0.06)", border: "1px solid rgba(34,197,94,0.2)", borderRadius: 10 }}>
            <p style={{ fontSize: 13, fontWeight: 600, color: "#86efac" }}>Reactivate this DID</p>
            <p style={{ fontSize: 12, color: "#4ade80", lineHeight: 1.6, opacity: 0.85 }}>
              The DID document will be marked as active again on-chain. All existing verification
              methods and services will be restored.
            </p>
            <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", fontSize: 13, color: "#86efac" }}>
              <input type="checkbox" checked={confirmed1}
                onChange={(e) => setConfirmed1(e.target.checked)}
                style={{ width: 14, height: 14, accentColor: "#22c55e" }} />
              Reactivate this identity
            </label>
          </div>
        ) : (
          <div className="danger-notice" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <p style={{ fontSize: 13, fontWeight: 600, color: "#fca5a5" }}>This will deactivate the DID</p>
            <p style={{ fontSize: 12, color: "#f87171", lineHeight: 1.6, opacity: 0.8 }}>
              The DID document will be marked as deactivated on-chain. The Identity object is not
              deleted and can be reactivated by the controller.
            </p>
            <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", fontSize: 13, color: "#fca5a5" }}>
              <input type="checkbox" checked={confirmed1}
                onChange={(e) => setConfirmed1(e.target.checked)}
                style={{ width: 14, height: 14, accentColor: "#f87171" }} />
              I understand this action
            </label>
          </div>
        )
      )}

      {/* ── Delete ── */}
      {mode === "delete" && (
        <div className="danger-notice" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <p style={{ fontSize: 13, fontWeight: 600, color: "#fca5a5" }}>Permanently delete this DID</p>
          <p style={{ fontSize: 12, color: "#f87171", lineHeight: 1.6, opacity: 0.8 }}>
            The Identity object will be destroyed on-chain. This is <strong style={{ color: "#fca5a5" }}>irreversible</strong> —
            the DID cannot be recovered or reactivated after deletion.
          </p>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", fontSize: 13, color: "#fca5a5" }}>
              <input type="checkbox" checked={confirmed1}
                onChange={(e) => setConfirmed1(e.target.checked)}
                style={{ width: 14, height: 14, accentColor: "#f87171" }} />
              I understand the DID will be permanently deleted on-chain
            </label>
            <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", fontSize: 13, color: "#fca5a5" }}>
              <input type="checkbox" checked={confirmed2}
                onChange={(e) => setConfirmed2(e.target.checked)}
                style={{ width: 14, height: 14, accentColor: "#f87171" }} />
              I understand this action cannot be undone
            </label>
          </div>
        </div>
      )}

      {error && <div className="banner-error">{error}</div>}

      {/* Submit button */}
      <div>
        {mode === "add-key" && (
          <button className="btn btn-primary" onClick={handleUpdate}
            disabled={busy || !readOnlyClient || !keyFragment.startsWith("#")}
            style={{ width: "100%", padding: "11px 20px" }}>
            {busy ? <><Spinner /> Publishing…</> : "Add Key"}
          </button>
        )}
        {mode === "add-service" && (
          <button className="btn btn-primary" onClick={handleUpdate}
            disabled={busy || !readOnlyClient}
            style={{ width: "100%", padding: "11px 20px" }}>
            {busy ? <><Spinner /> Publishing…</> : "Add Service"}
          </button>
        )}
        {mode === "remove-key" && existingMethods.length > 1 && (
          <button className="btn btn-danger" onClick={handleUpdate}
            disabled={busy || !readOnlyClient}
            style={{ width: "100%", padding: "11px 20px" }}>
            {busy ? <><Spinner /> Publishing…</> : "Remove Key"}
          </button>
        )}
        {mode === "remove-service" && existingServices.length > 0 && (
          <button className="btn btn-danger" onClick={handleUpdate}
            disabled={busy || !readOnlyClient}
            style={{ width: "100%", padding: "11px 20px" }}>
            {busy ? <><Spinner /> Publishing…</> : "Remove Service"}
          </button>
        )}
        {mode === "deactivate" && (
          <button
            className={isDeactivated ? "btn btn-primary" : "btn btn-danger"}
            onClick={handleUpdate}
            disabled={busy || !confirmed1}
            style={{ width: "100%", padding: "11px 20px" }}>
            {busy
              ? <><Spinner /> Publishing…</>
              : isDeactivated ? "Reactivate DID" : "Deactivate DID"}
          </button>
        )}
        {mode === "delete" && (
          <button className="btn btn-danger" onClick={handleUpdate}
            disabled={busy || !confirmed1 || !confirmed2}
            style={{ width: "100%", padding: "11px 20px" }}>
            {busy ? <><Spinner /> Publishing…</> : "Permanently Delete DID"}
          </button>
        )}
      </div>
    </div>
  );
}
