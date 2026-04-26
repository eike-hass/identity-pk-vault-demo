import { useEffect, useState } from "react";
import {
  DIDUrl, IotaDID, JwkMemStore, MethodScope, Service,
} from "@iota/identity-wasm/web";
import type { IotaDocument, JwsAlgorithm, Storage } from "@iota/identity-wasm/web";
import { useIdentityClient } from "../hooks/useIdentityClient";
import { CopyButton } from "./CopyButton";
import { explorerObjectUrl } from "../lib/explorerUrl";
import { retryAsync } from "../lib/retryAsync";

interface Props {
  did: string;
  storage: Storage;
  onClear: () => void;
}

// ── Icons ─────────────────────────────────────────────────────────────────────
function RefreshIcon() {
  return (
    <svg width={14} height={14} viewBox="0 0 14 14" fill="none" aria-hidden="true">
      <path d="M2 7A5 5 0 0 1 11.5 4.5M12 7A5 5 0 0 1 2.5 9.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
      <path d="M9.5 2.5L11.5 4.5L9.5 6" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M4.5 11.5L2.5 9.5L4.5 8" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function LinkIcon() {
  return (
    <svg width={12} height={12} viewBox="0 0 12 12" fill="none" aria-hidden="true">
      <path d="M5 3H2.5C1.95 3 1.5 3.45 1.5 4V9.5C1.5 10.05 1.95 10.5 2.5 10.5H8C8.55 10.5 9 10.05 9 9.5V7" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
      <path d="M7 1.5H10.5M10.5 1.5V5M10.5 1.5L5.5 6.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function ChevronIcon({ open }: { open: boolean }) {
  return (
    <svg width={12} height={12} viewBox="0 0 12 12" fill="none" aria-hidden="true"
      style={{ transition: "transform 0.2s", transform: open ? "rotate(180deg)" : "none" }}>
      <path d="M2.5 4.5L6 8L9.5 4.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function PlusIcon() {
  return (
    <svg width={13} height={13} viewBox="0 0 13 13" fill="none" aria-hidden="true">
      <path d="M6.5 2.5V10.5M2.5 6.5H10.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg width={13} height={13} viewBox="0 0 13 13" fill="none" aria-hidden="true">
      <path d="M2.5 4.5H10.5M5 4.5V3H8V4.5M5.5 6V10M7.5 6V10M3 4.5L3.5 11H9.5L10 4.5"
        stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function Spinner() {
  return <span className="spinner" style={{ width: 13, height: 13 }} />;
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function nextKeyFragment(doc: IotaDocument): string {
  const fragments = new Set(
    doc.methods().map((vm) => vm.id().toString().split("#")[1] ?? ""),
  );
  for (let i = 2; i < 100; i++) {
    if (!fragments.has(`key-${i}`)) return `#key-${i}`;
  }
  return "#key-new";
}

// ── IdentityDashboard ─────────────────────────────────────────────────────────
export function IdentityDashboard({ did, storage, onClear }: Props) {
  const { readOnlyClient, createIdentityClient } = useIdentityClient();
  const [document, setDocument] = useState<IotaDocument | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showRaw, setShowRaw] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  // Inline add forms
  const [showAddKey, setShowAddKey] = useState(false);
  const [newKeyFragment, setNewKeyFragment] = useState("#key-2");
  const [showAddService, setShowAddService] = useState(false);
  const [newServiceId, setNewServiceId] = useState("#linked-domain");
  const [newServiceType, setNewServiceType] = useState("LinkedDomains");
  const [newServiceEndpoint, setNewServiceEndpoint] = useState("https://example.com");

  // Danger zone accordion
  const [dangerOpen, setDangerOpen] = useState<"deactivate" | "delete" | null>(null);
  const [dangerConfirm1, setDangerConfirm1] = useState(false);
  const [dangerConfirm2, setDangerConfirm2] = useState(false);

  // Inline action state
  const [inlineBusy, setInlineBusy] = useState<string | null>(null);
  const [inlineError, setInlineError] = useState<string | null>(null);

  useEffect(() => {
    if (!readOnlyClient || !did) return;
    let cancelled = false;
    setLoading(true);
    setError(null);

    retryAsync(
      () => readOnlyClient!.resolveDid(IotaDID.parse(did)),
      {
        attempts: 5,
        delayMs: 1500,
        shouldRetry: (err) => {
          const msg = err instanceof Error ? err.message : String(err);
          return msg.toLowerCase().includes("could not find");
        },
      },
    )
      .then((doc) => {
        if (!cancelled) {
          setDocument(doc);
          setNewKeyFragment(nextKeyFragment(doc));
        }
      })
      .catch((err: Error) => { if (!cancelled) setError(err.message); })
      .finally(() => { if (!cancelled) setLoading(false); });

    return () => { cancelled = true; };
  }, [readOnlyClient, did, refreshKey]);

  async function handleInlineAction(mode: string, params: Record<string, string> = {}) {
    setInlineBusy(mode);
    setInlineError(null);
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
          params.keyFragment,
          MethodScope.VerificationMethod(),
        );
        await onChainIdentity.updateDidDocument(doc, controllerToken).buildAndExecute(identityClient);
        setShowAddKey(false);

      } else if (mode === "remove-key") {
        const doc = await identityClient.resolveDid(iotaDid);
        try {
          await doc.purgeMethod(storage, DIDUrl.parse(params.methodId));
        } catch (e) {
          // purgeMethod failed to find the key in vault storage (e.g. the key
          // was created before the digest-migration fix). Fall back to removing
          // the method from the document only; the orphaned vault entry is benign.
          if (e instanceof Error && e.message.toLowerCase().includes("key id")) {
            doc.removeMethod(DIDUrl.parse(params.methodId));
          } else {
            throw e;
          }
        }
        await onChainIdentity.updateDidDocument(doc, controllerToken).buildAndExecute(identityClient);

      } else if (mode === "add-service") {
        const doc = await identityClient.resolveDid(iotaDid);
        doc.insertService(new Service({
          id: iotaDid.join(params.serviceId),
          type: params.serviceType,
          serviceEndpoint: params.serviceEndpoint,
        }));
        await onChainIdentity.updateDidDocument(doc, controllerToken).buildAndExecute(identityClient);
        setShowAddService(false);
        setNewServiceId("#linked-domain");
        setNewServiceType("LinkedDomains");
        setNewServiceEndpoint("https://example.com");

      } else if (mode === "remove-service") {
        const doc = await identityClient.resolveDid(iotaDid);
        doc.removeService(DIDUrl.parse(params.serviceId));
        await onChainIdentity.updateDidDocument(doc, controllerToken).buildAndExecute(identityClient);

      } else if (mode === "deactivate") {
        await onChainIdentity.deactivateDid(controllerToken).buildAndExecute(identityClient);
        setDangerOpen(null);
        setDangerConfirm1(false);

      } else if (mode === "reactivate") {
        const doc = await identityClient.resolveDid(iotaDid);
        doc.setMetadataDeactivated(false);
        await onChainIdentity.updateDidDocument(doc, controllerToken).buildAndExecute(identityClient);
        setDangerOpen(null);
        setDangerConfirm1(false);

      } else if (mode === "delete") {
        await onChainIdentity.deleteDid(controllerToken).buildAndExecute(identityClient);
        onClear();
        return;
      }

      setRefreshKey((k) => k + 1);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.toLowerCase().includes("rejected") || msg.toLowerCase().includes("cancel")) {
        setInlineError("Transaction cancelled in wallet.");
      } else {
        setInlineError(msg);
      }
    } finally {
      setInlineBusy(null);
    }
  }

  function toggleDanger(panel: "deactivate" | "delete") {
    setDangerOpen((v) => (v === panel ? null : panel));
    setDangerConfirm1(false);
    setDangerConfirm2(false);
    setInlineError(null);
  }

  const isDeactivated = document?.metadata().deactivated() ?? false;
  const parts = did.split(":");
  const tag = parts[parts.length - 1];
  const network = parts.length >= 4 ? parts[2] : "";

  return (
    <div className="fade-in">
      <div className="card card-lift">
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>

          {/* Header row */}
          <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                <h2 style={{ fontSize: 16, fontWeight: 700, color: "var(--text-1)" }}>Your Identity</h2>
                {document && (
                  isDeactivated
                    ? <span className="status-deactivated"><span style={{ width: 6, height: 6, borderRadius: "50%", background: "#f87171", display: "inline-block" }} />Deactivated</span>
                    : <span className="status-active"><span style={{ width: 6, height: 6, borderRadius: "50%", background: "#22c55e", display: "inline-block" }} />Active</span>
                )}
              </div>

              {/* DID box */}
              <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                <div className="did-badge" style={{ flex: 1 }}>{did}</div>
                <CopyButton text={did} />
              </div>

              {/* Explorer + created date */}
              <div style={{ display: "flex", gap: 12, marginTop: 8, alignItems: "center" }}>
                <a
                  href={explorerObjectUrl(tag, network)}
                  target="_blank"
                  rel="noreferrer"
                  style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 12, color: "#38bdf8", textDecoration: "none" }}
                >
                  <LinkIcon /> View on Explorer
                </a>
                {document?.metadata().created() && (
                  <span style={{ fontSize: 11, color: "var(--text-3)" }}>
                    Created {document.metadata().created()?.toString().slice(0, 10)}
                  </span>
                )}
              </div>
            </div>

            <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
              <button
                className="btn btn-ghost"
                onClick={() => setRefreshKey((k) => k + 1)}
                title="Refresh"
                style={{ padding: "6px 10px" }}
              >
                <RefreshIcon />
              </button>
              <button
                className="btn btn-secondary"
                onClick={onClear}
                style={{ padding: "6px 12px", fontSize: 12 }}
              >
                Forget
              </button>
            </div>
          </div>

          {/* Loading */}
          {loading && (
            <div className="pulse" style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <Spinner />
              <span style={{ fontSize: 13, color: "var(--text-2)" }}>Resolving DID document…</span>
            </div>
          )}

          {error && <div className="banner-error">{error}</div>}
          {inlineError && <div className="banner-error">{inlineError}</div>}

          {document && !loading && (
            <>
              {/* ── Verification Methods ── */}
              <div>
                <span className="label">Verification Methods ({document.methods().length})</span>
                <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 6 }}>
                  {document.methods().map((vm) => {
                    const vmId = vm.id().toString();
                    return (
                      <div
                        key={vmId}
                        style={{
                          background: "rgba(255,255,255,0.03)",
                          border: "1px solid rgba(255,255,255,0.06)",
                          borderRadius: 10, padding: "9px 12px",
                          display: "flex", alignItems: "center", gap: 8,
                        }}
                      >
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <p style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "#7dd3fc", wordBreak: "break-all", marginBottom: 3 }}>
                            {vmId}
                          </p>
                          <p style={{ fontSize: 11, color: "var(--text-3)" }}>Type: {vm.type().toString()}</p>
                        </div>
                        {document.methods().length > 1 && (
                          <button
                            className="btn btn-ghost"
                            onClick={() => handleInlineAction("remove-key", { methodId: vmId })}
                            disabled={!!inlineBusy}
                            title="Remove key"
                            style={{ padding: "4px 8px", color: "#f87171", flexShrink: 0 }}
                          >
                            <TrashIcon />
                          </button>
                        )}
                      </div>
                    );
                  })}

                  {/* Add Key form / button */}
                  {showAddKey ? (
                    <div className="fade-in" style={{ border: "1px solid rgba(14,165,233,0.25)", borderRadius: 10, padding: "12px 14px", background: "rgba(14,165,233,0.04)", display: "flex", flexDirection: "column", gap: 10 }}>
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                        <p style={{ fontSize: 12, fontWeight: 600, color: "var(--text-1)" }}>Add Verification Key</p>
                        <button className="btn btn-ghost" onClick={() => setShowAddKey(false)} style={{ padding: "2px 6px", fontSize: 12 }}>✕</button>
                      </div>
                      <div>
                        <label className="label">Key fragment</label>
                        <input
                          className="input"
                          value={newKeyFragment}
                          onChange={(e) => setNewKeyFragment(e.target.value)}
                          placeholder="#key-2"
                        />
                        <p style={{ fontSize: 11, color: "var(--text-3)", marginTop: 5, lineHeight: 1.5 }}>
                          Generated in your passkey vault — never leaves your device unencrypted.
                        </p>
                      </div>
                      <button
                        className="btn btn-primary"
                        onClick={() => handleInlineAction("add-key", { keyFragment: newKeyFragment })}
                        disabled={!!inlineBusy || !newKeyFragment.startsWith("#")}
                        style={{ padding: "9px 16px" }}
                      >
                        {inlineBusy === "add-key" ? <><Spinner /> Publishing…</> : "Add Key"}
                      </button>
                    </div>
                  ) : (
                    <button
                      className="btn btn-ghost"
                      onClick={() => setShowAddKey(true)}
                      style={{ padding: "7px 10px", fontSize: 12, justifyContent: "flex-start", color: "#38bdf8", gap: 6 }}
                    >
                      <PlusIcon /> Add verification key
                    </button>
                  )}
                </div>
              </div>

              {/* ── Services ── */}
              <div>
                <span className="label">Services ({document.service().length})</span>
                <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 6 }}>
                  {document.service().map((svc) => {
                    const svcId = svc.id().toString();
                    return (
                      <div
                        key={svcId}
                        style={{
                          background: "rgba(255,255,255,0.03)",
                          border: "1px solid rgba(255,255,255,0.06)",
                          borderRadius: 10, padding: "9px 12px",
                          display: "flex", alignItems: "flex-start", gap: 8,
                        }}
                      >
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <p style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "#7dd3fc", wordBreak: "break-all", marginBottom: 3 }}>{svcId}</p>
                          <p style={{ fontSize: 11, color: "var(--text-3)", marginBottom: 1 }}>Type: {svc.type().join(", ")}</p>
                          <p style={{ fontSize: 11, color: "var(--text-3)", wordBreak: "break-all" }}>Endpoint: {String(svc.serviceEndpoint())}</p>
                        </div>
                        <button
                          className="btn btn-ghost"
                          onClick={() => handleInlineAction("remove-service", { serviceId: svcId })}
                          disabled={!!inlineBusy}
                          title="Remove service"
                          style={{ padding: "4px 8px", color: "#f87171", flexShrink: 0 }}
                        >
                          <TrashIcon />
                        </button>
                      </div>
                    );
                  })}

                  {/* Add Service form / button */}
                  {showAddService ? (
                    <div className="fade-in" style={{ border: "1px solid rgba(14,165,233,0.25)", borderRadius: 10, padding: "12px 14px", background: "rgba(14,165,233,0.04)", display: "flex", flexDirection: "column", gap: 10 }}>
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                        <p style={{ fontSize: 12, fontWeight: 600, color: "var(--text-1)" }}>Add Service Endpoint</p>
                        <button className="btn btn-ghost" onClick={() => setShowAddService(false)} style={{ padding: "2px 6px", fontSize: 12 }}>✕</button>
                      </div>
                      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                        <div>
                          <label className="label">Service fragment</label>
                          <input className="input" value={newServiceId} onChange={(e) => setNewServiceId(e.target.value)} placeholder="#linked-domain" />
                        </div>
                        <div>
                          <label className="label">Service type</label>
                          <input className="input" value={newServiceType} onChange={(e) => setNewServiceType(e.target.value)} placeholder="LinkedDomains" />
                        </div>
                        <div>
                          <label className="label">Endpoint URL</label>
                          <input className="input" value={newServiceEndpoint} onChange={(e) => setNewServiceEndpoint(e.target.value)} placeholder="https://example.com" />
                        </div>
                      </div>
                      <button
                        className="btn btn-primary"
                        onClick={() => handleInlineAction("add-service", { serviceId: newServiceId, serviceType: newServiceType, serviceEndpoint: newServiceEndpoint })}
                        disabled={!!inlineBusy}
                        style={{ padding: "9px 16px" }}
                      >
                        {inlineBusy === "add-service" ? <><Spinner /> Publishing…</> : "Add Service"}
                      </button>
                    </div>
                  ) : (
                    <button
                      className="btn btn-ghost"
                      onClick={() => setShowAddService(true)}
                      style={{ padding: "7px 10px", fontSize: 12, justifyContent: "flex-start", color: "#38bdf8", gap: 6 }}
                    >
                      <PlusIcon /> Add service endpoint
                    </button>
                  )}
                </div>
              </div>

              {/* ── Raw JSON toggle ── */}
              <div>
                <button
                  className="btn btn-ghost"
                  onClick={() => setShowRaw((v) => !v)}
                  style={{ padding: "4px 8px", fontSize: 12, gap: 5 }}
                >
                  <ChevronIcon open={showRaw} />
                  {showRaw ? "Hide" : "Show"} raw JSON document
                </button>
                {showRaw && (
                  <pre style={{
                    marginTop: 8,
                    background: "rgba(0,0,0,0.3)",
                    border: "1px solid rgba(255,255,255,0.06)",
                    borderRadius: 10,
                    padding: 14,
                    fontSize: 11,
                    fontFamily: "var(--font-mono)",
                    color: "var(--text-2)",
                    overflowX: "auto",
                    maxHeight: 260,
                    lineHeight: 1.6,
                  }}>
                    {JSON.stringify(document.toJSON(), null, 2)}
                  </pre>
                )}
              </div>

              {/* ── Danger Zone ── */}
              <div style={{ borderTop: "1px solid rgba(248,113,113,0.15)", paddingTop: 14, display: "flex", flexDirection: "column", gap: 6 }}>
                <p style={{ fontSize: 10, fontWeight: 700, color: "#f87171", textTransform: "uppercase", letterSpacing: "0.09em", marginBottom: 2 }}>
                  Danger Zone
                </p>

                {/* Deactivate / Reactivate accordion */}
                <div style={{
                  border: `1px solid ${isDeactivated ? "rgba(34,197,94,0.2)" : "rgba(248,113,113,0.18)"}`,
                  borderRadius: 10, overflow: "hidden",
                  background: isDeactivated ? "rgba(34,197,94,0.03)" : "rgba(248,113,113,0.025)",
                }}>
                  <button
                    onClick={() => toggleDanger("deactivate")}
                    style={{ width: "100%", display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", background: "transparent", border: "none", fontFamily: "inherit", cursor: "pointer", textAlign: "left" }}
                  >
                    <span style={{
                      width: 26, height: 26, borderRadius: 7, display: "flex", alignItems: "center", justifyContent: "center",
                      background: isDeactivated ? "rgba(34,197,94,0.12)" : "rgba(248,113,113,0.1)",
                      border: `1px solid ${isDeactivated ? "rgba(34,197,94,0.2)" : "rgba(248,113,113,0.2)"}`,
                      color: isDeactivated ? "#4ade80" : "#f87171", flexShrink: 0,
                    }}>
                      {isDeactivated
                        ? <svg width={13} height={13} viewBox="0 0 13 13" fill="none"><circle cx="6.5" cy="6.5" r="4.5" stroke="currentColor" strokeWidth="1.2"/><path d="M5 4.5L9 6.5L5 8.5V4.5Z" fill="currentColor"/></svg>
                        : <svg width={13} height={13} viewBox="0 0 13 13" fill="none"><circle cx="6.5" cy="6.5" r="4.5" stroke="currentColor" strokeWidth="1.2"/><path d="M4.5 4.5L8.5 8.5M8.5 4.5L4.5 8.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/></svg>
                      }
                    </span>
                    <div style={{ flex: 1 }}>
                      <p style={{ fontSize: 12, fontWeight: 600, color: isDeactivated ? "#86efac" : "#fca5a5" }}>
                        {isDeactivated ? "Reactivate Identity" : "Deactivate Identity"}
                      </p>
                      <p style={{ fontSize: 11, color: "var(--text-3)", marginTop: 1 }}>
                        {isDeactivated ? "Mark the DID as active again on-chain" : "Mark as inactive — reversible by the controller"}
                      </p>
                    </div>
                    <span style={{ color: "var(--text-3)", flexShrink: 0 }}>
                      <ChevronIcon open={dangerOpen === "deactivate"} />
                    </span>
                  </button>

                  {dangerOpen === "deactivate" && (
                    <div className="fade-in" style={{ padding: "0 12px 12px", display: "flex", flexDirection: "column", gap: 10 }}>
                      <div style={{ height: 1, background: isDeactivated ? "rgba(34,197,94,0.15)" : "rgba(248,113,113,0.12)", marginBottom: 2 }} />
                      <div style={{
                        padding: "10px 12px",
                        background: isDeactivated ? "rgba(34,197,94,0.06)" : "rgba(248,113,113,0.06)",
                        border: `1px solid ${isDeactivated ? "rgba(34,197,94,0.18)" : "rgba(248,113,113,0.14)"}`,
                        borderRadius: 9,
                      }}>
                        <p style={{ fontSize: 12, color: isDeactivated ? "#4ade80" : "#f87171", lineHeight: 1.6, marginBottom: 8 }}>
                          {isDeactivated
                            ? "All verification methods and services will be restored on-chain."
                            : "The DID will be marked inactive but not deleted. You can reactivate it later as the controller."
                          }
                        </p>
                        <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", fontSize: 12, color: isDeactivated ? "#86efac" : "#fca5a5" }}>
                          <input
                            type="checkbox"
                            checked={dangerConfirm1}
                            onChange={(e) => setDangerConfirm1(e.target.checked)}
                            style={{ accentColor: isDeactivated ? "#22c55e" : "#f87171" }}
                          />
                          {isDeactivated ? "Confirm reactivation" : "I understand this will deactivate the DID"}
                        </label>
                      </div>
                      <button
                        className={isDeactivated ? "btn btn-primary" : "btn btn-danger"}
                        onClick={() => handleInlineAction(isDeactivated ? "reactivate" : "deactivate")}
                        disabled={!!inlineBusy || !dangerConfirm1}
                        style={{ padding: "9px 16px" }}
                      >
                        {(inlineBusy === "deactivate" || inlineBusy === "reactivate")
                          ? <><Spinner /> Publishing…</>
                          : isDeactivated ? "Reactivate DID" : "Deactivate DID"
                        }
                      </button>
                    </div>
                  )}
                </div>

                {/* Delete accordion */}
                <div style={{ border: "1px solid rgba(248,113,113,0.18)", borderRadius: 10, overflow: "hidden", background: "rgba(248,113,113,0.025)" }}>
                  <button
                    onClick={() => toggleDanger("delete")}
                    style={{ width: "100%", display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", background: "transparent", border: "none", fontFamily: "inherit", cursor: "pointer", textAlign: "left" }}
                  >
                    <span style={{ width: 26, height: 26, borderRadius: 7, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(248,113,113,0.1)", border: "1px solid rgba(248,113,113,0.2)", color: "#f87171", flexShrink: 0 }}>
                      <svg width={13} height={13} viewBox="0 0 13 13" fill="none">
                        <path d="M2.5 4H10.5M4.5 4V3H8.5V4M5 5.5V9.5M8 5.5V9.5M3 4L3.5 11H9.5L10 4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                    </span>
                    <div style={{ flex: 1 }}>
                      <p style={{ fontSize: 12, fontWeight: 600, color: "#fca5a5" }}>Delete Identity</p>
                      <p style={{ fontSize: 11, color: "var(--text-3)", marginTop: 1 }}>Permanently destroy the on-chain object — irreversible</p>
                    </div>
                    <span style={{ color: "var(--text-3)", flexShrink: 0 }}>
                      <ChevronIcon open={dangerOpen === "delete"} />
                    </span>
                  </button>

                  {dangerOpen === "delete" && (
                    <div className="fade-in" style={{ padding: "0 12px 12px", display: "flex", flexDirection: "column", gap: 10 }}>
                      <div style={{ height: 1, background: "rgba(248,113,113,0.12)", marginBottom: 2 }} />
                      <div style={{ padding: "10px 12px", background: "rgba(248,113,113,0.06)", border: "1px solid rgba(248,113,113,0.14)", borderRadius: 9, display: "flex", flexDirection: "column", gap: 8 }}>
                        <p style={{ fontSize: 12, color: "#f87171", lineHeight: 1.6 }}>
                          The Identity object will be <strong style={{ color: "#fca5a5" }}>permanently destroyed</strong> on-chain. The DID cannot be recovered or reused.
                        </p>
                        <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", fontSize: 12, color: "#fca5a5" }}>
                          <input
                            type="checkbox"
                            checked={dangerConfirm1}
                            onChange={(e) => setDangerConfirm1(e.target.checked)}
                            style={{ accentColor: "#f87171" }}
                          />
                          I understand the DID will be permanently deleted on-chain
                        </label>
                        <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", fontSize: 12, color: "#fca5a5" }}>
                          <input
                            type="checkbox"
                            checked={dangerConfirm2}
                            onChange={(e) => setDangerConfirm2(e.target.checked)}
                            style={{ accentColor: "#f87171" }}
                          />
                          I understand this cannot be undone
                        </label>
                      </div>
                      <button
                        className="btn btn-danger"
                        onClick={() => handleInlineAction("delete")}
                        disabled={!!inlineBusy || !dangerConfirm1 || !dangerConfirm2}
                        style={{ padding: "9px 16px" }}
                      >
                        {inlineBusy === "delete" ? <><Spinner /> Publishing…</> : "Permanently Delete DID"}
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
