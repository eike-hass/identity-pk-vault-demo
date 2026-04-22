import { useEffect, useState } from "react";
import { IotaDID } from "@iota/identity-wasm/web";
import type { IotaDocument, Storage } from "@iota/identity-wasm/web";
import { useIdentityClient } from "../hooks/useIdentityClient";
import { UpdateIdentity } from "./UpdateIdentity";
import { CopyButton } from "./CopyButton";
import { explorerObjectUrl } from "../lib/explorerUrl";
import { retryAsync } from "../lib/retryAsync";

interface Props {
  did: string;
  storage: Storage;
  onClear: () => void;   // "Forget" — removes from local IDB only
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

function ChevronIcon({ dir = "down" }: { dir?: "down" | "up" }) {
  return (
    <svg width={12} height={12} viewBox="0 0 12 12" fill="none" aria-hidden="true"
      style={{ transform: dir === "up" ? "rotate(180deg)" : undefined }}>
      <path d="M2.5 4.5L6 8L9.5 4.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function Spinner() {
  return <span className="spinner" style={{ width: 13, height: 13 }} />;
}

// ── IdentityDashboard ─────────────────────────────────────────────────────────
export function IdentityDashboard({ did, storage, onClear }: Props) {
  const { readOnlyClient } = useIdentityClient();
  const [document, setDocument] = useState<IotaDocument | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showUpdate, setShowUpdate] = useState(false);
  const [showRaw, setShowRaw] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

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
      .then((doc) => { if (!cancelled) setDocument(doc); })
      .catch((err: Error) => { if (!cancelled) setError(err.message); })
      .finally(() => { if (!cancelled) setLoading(false); });

    return () => { cancelled = true; };
  }, [readOnlyClient, did, refreshKey]);

  function handleUpdated() {
    setShowUpdate(false);
    setRefreshKey((k) => k + 1);
  }

  const parts = did.split(":");
  const tag = parts[parts.length - 1];
  const network = parts.length >= 4 ? parts[2] : "";

  return (
    <div className="fade-in" style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {/* Main card */}
      <div className="card card-lift">
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>

          {/* Header row */}
          <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              {/* Title + status badge */}
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                <h2 style={{ fontSize: 16, fontWeight: 700, color: "var(--text-1)" }}>Your Identity</h2>
                {document && (
                  document.metadata().deactivated()
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

            {/* Actions */}
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

          {document && !loading && (
            <>
              {/* Verification Methods */}
              <div>
                <span className="label">Verification Methods ({document.methods().length})</span>
                <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 6 }}>
                  {document.methods().map((vm) => (
                    <div key={vm.id().toString()} className="info-card">
                      <div style={{ display: "flex", alignItems: "flex-start", gap: 4, marginBottom: 4 }}>
                        <p style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "#7dd3fc", wordBreak: "break-all", flex: 1 }}>
                          {vm.id().toString()}
                        </p>
                        <CopyButton text={vm.id().toString()} />
                      </div>
                      <p style={{ fontSize: 11, color: "var(--text-3)" }}>Type: {vm.type().toString()}</p>
                    </div>
                  ))}
                </div>
              </div>

              {/* Services */}
              <div>
                <span className="label">Services ({document.service().length})</span>
                {document.service().length > 0 ? (
                  <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 6 }}>
                    {document.service().map((svc) => (
                      <div key={svc.id().toString()} className="info-card">
                        <p style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "#7dd3fc", wordBreak: "break-all", marginBottom: 4 }}>
                          {svc.id().toString()}
                        </p>
                        <p style={{ fontSize: 11, color: "var(--text-3)", marginBottom: 2 }}>Type: {svc.type().join(", ")}</p>
                        <p style={{ fontSize: 11, color: "var(--text-3)", wordBreak: "break-all" }}>Endpoint: {String(svc.serviceEndpoint())}</p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p style={{ fontSize: 13, color: "var(--text-3)", fontStyle: "italic", marginTop: 6 }}>
                    No services — add one with the Update button below.
                  </p>
                )}
              </div>

              {/* Raw JSON toggle */}
              <div>
                <button
                  className="btn btn-ghost"
                  onClick={() => setShowRaw((v) => !v)}
                  style={{ padding: "4px 8px", fontSize: 12, gap: 5 }}
                >
                  <ChevronIcon dir={showRaw ? "up" : "down"} />
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

              {/* Update / Reactivate button */}
              <div style={{ display: "flex", gap: 8, paddingTop: 4 }}>
                <button
                  className="btn btn-secondary"
                  onClick={() => setShowUpdate((s) => !s)}
                  style={{ fontSize: 13 }}
                >
                  {showUpdate
                    ? "Cancel"
                    : document.metadata().deactivated()
                    ? "Reactivate Identity"
                    : "Update Identity"}
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Inline update panel */}
      {showUpdate && document && (
        <div className="slide-in">
          <UpdateIdentity
            did={did}
            document={document}
            storage={storage}
            onUpdated={handleUpdated}
            onDeleted={onClear}
          />
        </div>
      )}
    </div>
  );
}
