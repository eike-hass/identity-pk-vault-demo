import { useState } from "react";
import type { IotaDocument } from "@iota/identity-wasm/web";
import { useIdentityClient } from "../hooks/useIdentityClient";
import { CopyButton } from "./CopyButton";
import { explorerObjectUrl } from "../lib/explorerUrl";

function Spinner() {
  return <span className="spinner" style={{ width: 14, height: 14 }} />;
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

export function ResolveIdentity() {
  const { readOnlyClient, isReady } = useIdentityClient();
  const [input, setInput] = useState("");
  const [resolving, setResolving] = useState(false);
  const [document, setDocument] = useState<IotaDocument | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showRaw, setShowRaw] = useState(false);

  async function handleResolve() {
    if (!readOnlyClient || !input.trim()) return;
    setResolving(true);
    setError(null);
    setDocument(null);
    setShowRaw(false);

    try {
      const { IotaDID } = await import("@iota/identity-wasm/web");
      const did = IotaDID.parse(input.trim());
      const doc = await readOnlyClient.resolveDid(did);
      setDocument(doc);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes("not found") || msg.includes("deleted")) {
        setError("DID not found or has been deleted on this network.");
      } else {
        setError(msg);
      }
    } finally {
      setResolving(false);
    }
  }

  return (
    <div className="card card-lift fade-in" style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div>
        <h2 style={{ fontSize: 17, fontWeight: 700, color: "var(--text-1)", marginBottom: 6 }}>Resolve a DID</h2>
        <p style={{ fontSize: 13, color: "var(--text-2)", lineHeight: 1.5 }}>
          Look up any{" "}
          <code style={{ fontFamily: "var(--font-mono)", color: "#7dd3fc", background: "rgba(14,165,233,0.1)", padding: "1px 5px", borderRadius: 4 }}>
            did:iota
          </code>{" "}
          identifier on the current network.
        </p>
      </div>

      {/* Search row */}
      <div style={{ display: "flex", gap: 8 }}>
        <input
          className="input"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && !resolving && handleResolve()}
          placeholder="did:iota:testnet:0x…"
          style={{ flex: 1 }}
        />
        <button
          className="btn btn-primary"
          onClick={handleResolve}
          disabled={resolving || !isReady || !input.trim()}
          style={{ padding: "10px 20px", flexShrink: 0 }}
        >
          {resolving ? <><Spinner /> Resolving…</> : "Resolve"}
        </button>
      </div>

      {error && <div className="banner-error">{error}</div>}

      {document && (
        <div className="fade-in" style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {/* Status + Explorer link */}
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              {document.metadata().deactivated()
                ? <span className="status-deactivated"><span style={{ width: 6, height: 6, borderRadius: "50%", background: "#f87171", display: "inline-block" }} />Deactivated</span>
                : <span className="status-active"><span style={{ width: 6, height: 6, borderRadius: "50%", background: "#22c55e", display: "inline-block" }} />Active</span>
              }
              <a
                href={explorerObjectUrl(document.id().tag(), document.id().network())}
                target="_blank"
                rel="noreferrer"
                style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 12, color: "#38bdf8", textDecoration: "none" }}
              >
                <LinkIcon /> View on Explorer
              </a>
            </div>

            {/* DID box */}
            <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
              <div className="did-badge" style={{ flex: 1 }}>{document.id().toString()}</div>
              <CopyButton text={document.id().toString()} />
            </div>
          </div>

          {/* Timestamps */}
          <div style={{ display: "flex", gap: 20 }}>
            {document.metadata().created() && (
              <div>
                <span className="label">Created</span>
                <p style={{ fontSize: 13, color: "var(--text-2)" }}>
                  {document.metadata().created()?.toString().slice(0, 10)}
                </p>
              </div>
            )}
            {document.metadata().updated() && (
              <div>
                <span className="label">Last updated</span>
                <p style={{ fontSize: 13, color: "var(--text-2)" }}>
                  {document.metadata().updated()?.toString().slice(0, 10)}
                </p>
              </div>
            )}
          </div>

          <hr style={{ border: "none", borderTop: "1px solid var(--border)" }} />

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
              {document.methods().length === 0 && (
                <p style={{ fontSize: 13, color: "var(--text-3)", fontStyle: "italic" }}>No verification methods</p>
              )}
            </div>
          </div>

          {/* Services */}
          <div>
            <span className="label">Services ({document.service().length})</span>
            <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 6 }}>
              {document.service().map((svc) => (
                <div key={svc.id().toString()} className="info-card">
                  <p style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "#7dd3fc", wordBreak: "break-all", marginBottom: 4 }}>
                    {svc.id().toString()}
                  </p>
                  <p style={{ fontSize: 11, color: "var(--text-3)", marginBottom: 2 }}>Type: {svc.type().join(", ")}</p>
                  <p style={{ fontSize: 11, color: "var(--text-3)" }}>Endpoint: {String(svc.serviceEndpoint())}</p>
                </div>
              ))}
              {document.service().length === 0 && (
                <p style={{ fontSize: 13, color: "var(--text-3)", fontStyle: "italic" }}>No services</p>
              )}
            </div>
          </div>

          {/* Raw JSON */}
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
        </div>
      )}
    </div>
  );
}
