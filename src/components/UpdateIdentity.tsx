import { useState } from "react";
import { IotaDID, Service } from "@iota/identity-wasm/web";
import { useIdentityClient } from "../hooks/useIdentityClient";

interface Props {
  did: string;
  onUpdated: () => void;
}

type UpdateMode = "add-service" | "deactivate";

export function UpdateIdentity({ did, onUpdated }: Props) {
  const { readOnlyClient, createIdentityClient } = useIdentityClient();
  const [mode, setMode] = useState<UpdateMode>("add-service");

  // Add-service form state
  const [serviceId, setServiceId] = useState("#linked-domain");
  const [serviceType, setServiceType] = useState("LinkedDomains");
  const [serviceEndpoint, setServiceEndpoint] = useState("https://example.com");

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleUpdate() {
    if (!readOnlyClient) return;
    setBusy(true);
    setError(null);

    try {
      const identityClient = await createIdentityClient();
      const iotaDid = IotaDID.parse(did);

      // getIdentity returns an Identity; toFullFledged() narrows it to OnChainIdentity.
      const identity = await identityClient.getIdentity(iotaDid.toObjectID());
      const onChainIdentity = identity.toFullFledged();
      if (!onChainIdentity) throw new Error("This DID is not a full on-chain identity.");

      // A ControllerToken is required for any mutating operation.
      const controllerToken = await onChainIdentity.getControllerToken(identityClient);
      if (!controllerToken) throw new Error("Connected wallet is not a controller of this identity.");

      if (mode === "add-service") {
        // Resolve the current document, add the service, then publish.
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
        // Deactivate the DID on-chain.
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
    <div className="card space-y-5">
      <div>
        <h2 className="text-lg font-semibold text-gray-100">Update Identity</h2>
        <p className="mt-1 text-sm text-gray-400 font-mono break-all text-xs">{did}</p>
      </div>

      {/* Mode tabs */}
      <div className="flex gap-2 border-b border-gray-800">
        {(["add-service", "deactivate"] as UpdateMode[]).map((m) => (
          <button
            key={m}
            onClick={() => setMode(m)}
            className={`pb-2 px-1 text-sm font-medium border-b-2 transition-colors ${
              mode === m
                ? "border-iota-500 text-iota-400"
                : "border-transparent text-gray-500 hover:text-gray-300"
            }`}
          >
            {m === "add-service" ? "Add Service" : "Deactivate"}
          </button>
        ))}
      </div>

      {mode === "add-service" && (
        <div className="space-y-3">
          <div>
            <label className="label">Service Fragment (e.g. #linked-domain)</label>
            <input
              className="input"
              value={serviceId}
              onChange={(e) => setServiceId(e.target.value)}
              placeholder="#linked-domain"
            />
          </div>
          <div>
            <label className="label">Service Type</label>
            <input
              className="input"
              value={serviceType}
              onChange={(e) => setServiceType(e.target.value)}
              placeholder="LinkedDomains"
            />
          </div>
          <div>
            <label className="label">Service Endpoint URL</label>
            <input
              className="input"
              value={serviceEndpoint}
              onChange={(e) => setServiceEndpoint(e.target.value)}
              placeholder="https://example.com"
            />
          </div>
        </div>
      )}

      {mode === "deactivate" && (
        <div className="bg-red-950/30 border border-red-800/30 rounded-lg p-4 text-sm text-red-300 space-y-1">
          <p className="font-medium">⚠ This will deactivate the DID</p>
          <p className="text-red-400/80">
            The DID document will be marked as deactivated. The on-chain Identity object is
            not deleted; it can be reactivated by the controller.
          </p>
        </div>
      )}

      {error && (
        <div className="bg-red-950/50 border border-red-800/50 rounded-lg p-3 text-sm text-red-300">
          {error}
        </div>
      )}

      <div className="flex gap-3">
        <button
          onClick={handleUpdate}
          disabled={busy || !readOnlyClient}
          className={mode === "deactivate" ? "btn-danger flex-1 py-2.5" : "btn-primary flex-1 py-2.5"}
        >
          {busy ? "Publishing…" : mode === "add-service" ? "Add Service" : "Deactivate DID"}
        </button>
      </div>
    </div>
  );
}
