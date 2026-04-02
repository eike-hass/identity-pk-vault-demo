import { useState } from "react";
import type { IotaDocument } from "@iota/identity-wasm/web";
import { useIdentityClient } from "../hooks/useIdentityClient";
import { explorerObjectUrl } from "../lib/explorerUrl";

export function ResolveIdentity() {
  const { readOnlyClient, isReady } = useIdentityClient();
  const [input, setInput] = useState("");
  const [resolving, setResolving] = useState(false);
  const [document, setDocument] = useState<IotaDocument | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleResolve() {
    if (!readOnlyClient || !input.trim()) return;
    setResolving(true);
    setError(null);
    setDocument(null);

    try {
      // Dynamically import IotaDID to keep the top-level import light.
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
    <div className="card space-y-5">
      <div>
        <h2 className="text-lg font-semibold text-gray-100">Resolve a DID</h2>
        <p className="mt-1 text-sm text-gray-400">
          Look up any <code className="text-iota-400">did:iota</code> identifier on the
          current network.
        </p>
      </div>

      <div className="flex gap-2">
        <input
          className="input"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleResolve()}
          placeholder="did:iota:0x…"
        />
        <button
          onClick={handleResolve}
          disabled={resolving || !isReady || !input.trim()}
          className="btn-primary whitespace-nowrap"
        >
          {resolving ? "Resolving…" : "Resolve"}
        </button>
      </div>

      {error && (
        <div className="bg-red-950/50 border border-red-800/50 rounded-lg p-3 text-sm text-red-300">
          {error}
        </div>
      )}

      {document && (
        <div className="space-y-4">
          {/* DID */}
          <div>
            <span className="label">DID</span>
            <p className="font-mono text-xs text-iota-300 break-all">
              {document.id().toString()}
            </p>
            <a
              href={explorerObjectUrl(document.id().tag(), document.id().network())}
              target="_blank"
              rel="noreferrer"
              className="inline-block mt-1 text-xs text-iota-400 hover:underline"
            >
              View on IOTA Explorer ↗
            </a>
          </div>

          {/* Status */}
          <div>
            <span className="label">Status</span>
            {document.metadata().deactivated() ? (
              <span className="status-badge bg-red-900/40 text-red-300 border border-red-800/40">
                ● Deactivated
              </span>
            ) : (
              <span className="status-badge bg-green-900/40 text-green-300 border border-green-800/40">
                ● Active
              </span>
            )}
          </div>

          {/* Timestamps */}
          {document.metadata().created() && (
            <div>
              <span className="label">Created</span>
              <p className="text-sm text-gray-300">{document.metadata().created()?.toString()}</p>
            </div>
          )}
          {document.metadata().updated() && (
            <div>
              <span className="label">Last Updated</span>
              <p className="text-sm text-gray-300">{document.metadata().updated()?.toString()}</p>
            </div>
          )}

          {/* Verification Methods */}
          <div>
            <span className="label">
              Verification Methods ({document.methods().length})
            </span>
            <div className="space-y-2 mt-1">
              {document.methods().map((vm) => (
                <div key={vm.id().toString()} className="bg-gray-800/50 rounded-lg p-3">
                  <p className="font-mono text-xs text-iota-300 break-all">{vm.id().toString()}</p>
                  <p className="text-xs text-gray-400 mt-1">Type: {vm.type().toString()}</p>
                </div>
              ))}
              {document.methods().length === 0 && (
                <p className="text-sm text-gray-500 italic">No verification methods</p>
              )}
            </div>
          </div>

          {/* Services */}
          <div>
            <span className="label">Services ({document.service().length})</span>
            <div className="space-y-2 mt-1">
              {document.service().map((svc) => (
                <div key={svc.id().toString()} className="bg-gray-800/50 rounded-lg p-3 space-y-1">
                  <p className="font-mono text-xs text-iota-300 break-all">{svc.id().toString()}</p>
                  <p className="text-xs text-gray-400">Type: {svc.type().join(", ")}</p>
                  <p className="text-xs text-gray-400 break-all">
                    Endpoint: {String(svc.serviceEndpoint())}
                  </p>
                </div>
              ))}
              {document.service().length === 0 && (
                <p className="text-sm text-gray-500 italic">No services</p>
              )}
            </div>
          </div>

          {/* Raw JSON — full document as serialised JSON */}
          <details className="group">
            <summary className="cursor-pointer text-xs text-gray-400 hover:text-gray-300 select-none">
              Raw JSON Document
            </summary>
            <pre className="mt-2 bg-gray-800/50 rounded-lg p-3 text-xs text-gray-300 overflow-auto max-h-64 border border-gray-700">
              {JSON.stringify(document.toJSON(), null, 2)}
            </pre>
          </details>
        </div>
      )}
    </div>
  );
}
