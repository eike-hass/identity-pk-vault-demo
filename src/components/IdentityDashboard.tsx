import { useEffect, useState } from "react";
import { IotaDID } from "@iota/identity-wasm/web";
import type { IotaDocument } from "@iota/identity-wasm/web";
import { useIdentityClient } from "../hooks/useIdentityClient";
import { UpdateIdentity } from "./UpdateIdentity";
import { explorerObjectUrl } from "../lib/explorerUrl";
import { retryAsync } from "../lib/retryAsync";

interface Props {
  did: string;
  onClear: () => void;
}

export function IdentityDashboard({ did, onClear }: Props) {
  const { readOnlyClient } = useIdentityClient();
  const [document, setDocument] = useState<IotaDocument | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showUpdate, setShowUpdate] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  // Resolve and display the DID document, retrying briefly if the object is not
  // yet visible on the node (common immediately after DID creation).
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

    return () => {
      cancelled = true;
    };
  }, [readOnlyClient, did, refreshKey]);

  function handleUpdated() {
    setShowUpdate(false);
    setRefreshKey((k) => k + 1); // trigger re-resolve
  }

  return (
    <div className="space-y-4">
      {/* Identity header */}
      <div className="card space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-lg font-semibold text-gray-100">Your Identity</h2>
            <p className="mt-1 font-mono text-xs text-iota-300 break-all leading-relaxed">
              {did}
            </p>
            {(() => {
              const parts = did.split(":");
              const tag = parts[parts.length - 1];
              const network = parts.length >= 4 ? parts[2] : "";
              return (
                <a
                  href={explorerObjectUrl(tag, network)}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-block mt-1 text-xs text-iota-400 hover:underline"
                >
                  View on IOTA Explorer ↗
                </a>
              );
            })()}
          </div>
          <div className="flex gap-2 shrink-0">
            <button
              onClick={() => setRefreshKey((k) => k + 1)}
              className="btn-secondary text-xs"
              title="Refresh"
            >
              ↻
            </button>
            <button onClick={onClear} className="btn-secondary text-xs">
              Forget
            </button>
          </div>
        </div>

        {loading && (
          <p className="text-sm text-gray-500 animate-pulse">Resolving DID document…</p>
        )}

        {error && (
          <div className="bg-red-950/50 border border-red-800/50 rounded-lg p-3 text-sm text-red-300">
            {error}
          </div>
        )}

        {document && !loading && (
          <>
            {/* Status */}
            <div className="flex items-center gap-2">
              {document.metadata().deactivated() ? (
                <span className="status-badge bg-red-900/40 text-red-300 border border-red-800/40">
                  ● Deactivated
                </span>
              ) : (
                <span className="status-badge bg-green-900/40 text-green-300 border border-green-800/40">
                  ● Active
                </span>
              )}
              {document.metadata().created() && (
                <span className="text-xs text-gray-500">
                  Created {document.metadata().created()?.toString()}
                </span>
              )}
            </div>

            {/* Verification Methods */}
            <div>
              <p className="label">Verification Methods</p>
              <div className="space-y-2">
                {document.methods().map((vm) => (
                  <div key={vm.id().toString()} className="bg-gray-800/50 rounded-lg p-3">
                    <p className="font-mono text-xs text-iota-300 break-all">
                      {vm.id().toString()}
                    </p>
                    <p className="text-xs text-gray-400 mt-0.5">Type: {vm.type().toString()}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Services */}
            <div>
              <p className="label">
                Services{" "}
                <span className="text-gray-600">({document.service().length})</span>
              </p>
              {document.service().length > 0 ? (
                <div className="space-y-2">
                  {document.service().map((svc) => (
                    <div
                      key={svc.id().toString()}
                      className="bg-gray-800/50 rounded-lg p-3 space-y-1"
                    >
                      <p className="font-mono text-xs text-iota-300 break-all">
                        {svc.id().toString()}
                      </p>
                      <p className="text-xs text-gray-400">Type: {svc.type().join(", ")}</p>
                      <p className="text-xs text-gray-400 break-all">
                        Endpoint: {String(svc.serviceEndpoint())}
                      </p>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-gray-600 italic">
                  No services — add one with the Update button below.
                </p>
              )}
            </div>

            {/* Actions */}
            <div className="flex gap-3 pt-1">
              <button
                onClick={() => setShowUpdate((s) => !s)}
                className="btn-secondary"
              >
                {showUpdate ? "Cancel" : "Update Identity"}
              </button>
            </div>
          </>
        )}
      </div>

      {/* Inline update panel */}
      {showUpdate && <UpdateIdentity did={did} onUpdated={handleUpdated} />}
    </div>
  );
}
