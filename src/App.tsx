import { useEffect, useState } from "react";
import { useCurrentAccount, useIotaClientContext } from "@iota/dapp-kit";
import { listDids, putDid, deleteDid, openVaultDb } from "./storage/vault/vaultDb";
import { Header } from "./components/Header";
import { CreateIdentity } from "./components/CreateIdentity";
import { IdentityDashboard } from "./components/IdentityDashboard";
import { ResolveIdentity } from "./components/ResolveIdentity";
import { VaultBackup } from "./components/VaultBackup";
import { VaultGate } from "./components/VaultGate";
import { useIdentityClient } from "./hooks/useIdentityClient";
import { usePasskeyVault } from "./hooks/usePasskeyVault";
import { MOCK_MODE } from "./mocks/mockMode";
import { DevModeBanner } from "./mocks/DevModeBanner";

// ── Tab type ─────────────────────────────────────────────────────────────────
type Tab = "identity" | "resolve" | "vault";

const TABS: { id: Tab; label: string }[] = [
  { id: "identity", label: "My Identity" },
  { id: "resolve", label: "Resolve DID" },
  { id: "vault", label: "Key Vault" },
];

// ── App ───────────────────────────────────────────────────────────────────────
export default function App() {
  const account = useCurrentAccount();
  const { network } = useIotaClientContext();

  // Passkey vault — provides persistent encrypted key storage.
  const vault = usePasskeyVault();

  // Pass the vault Storage when unlocked; falls back to JwkMemStore otherwise.
  const { initialising, initError, storage } = useIdentityClient(vault.storage);

  const [dids, setDids] = useState<string[]>([]);
  const [tab, setTab] = useState<Tab>("identity");
  const [showCreate, setShowCreate] = useState(false);

  // Load all DIDs for the connected account+network whenever either changes.
  useEffect(() => {
    if (!account) {
      setDids([]);
      setShowCreate(false);
      return;
    }
    openVaultDb()
      .then((db) => listDids(db, account.address, network))
      .then(setDids);
    setShowCreate(false);
  }, [account, network]);

  async function handleCreated(newDid: string) {
    if (!account) return;
    const db = await openVaultDb();
    await putDid(db, account.address, network, newDid);
    setDids((prev) => [...prev, newDid]);
    setShowCreate(false);
  }

  async function refreshDids() {
    if (!account) return;
    const db = await openVaultDb();
    setDids(await listDids(db, account.address, network));
  }

  async function handleForget(did: string) {
    const db = await openVaultDb();
    await deleteDid(db, did);
    setDids((prev) => prev.filter((d) => d !== did));
  }

  return (
    <div className="min-h-screen flex flex-col">
      <Header vaultStatus={vault.status} />
      {MOCK_MODE && <DevModeBanner />}

      <main className="flex-1 max-w-2xl mx-auto w-full px-4 py-8 space-y-6">
        {/* Init error (identity client couldn't connect to node) */}
        {initError && (
          <div className="bg-amber-950/50 border border-amber-800/50 rounded-xl p-4 text-sm text-amber-300">
            <p className="font-medium">Identity client error</p>
            <p className="mt-1 text-amber-400/80">{initError}</p>
          </div>
        )}

        {/* Not connected — landing banner (shown regardless of vault state) */}
        {!account && <LandingBanner initialising={initialising} />}

        {/* Connected — vault gate guards all key operations */}
        {account && (
          <VaultGate
            status={vault.status}
            onRegister={vault.register}
            onUnlock={vault.unlock}
            onRegisterAndRestore={vault.registerAndRestore}
            error={vault.error}
          >
            {/* Tabs */}
            <div className="flex gap-1 bg-gray-900 border border-gray-800 rounded-xl p-1">
              {TABS.map(({ id, label }) => (
                <button
                  key={id}
                  onClick={() => setTab(id)}
                  className={`flex-1 text-sm font-medium py-2 rounded-lg transition-colors ${
                    tab === id
                      ? "bg-iota-600 text-white shadow"
                      : "text-gray-400 hover:text-gray-200"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            {/* Tab panels */}
            {tab === "identity" && (
              <div className="space-y-4">
                {dids.map((did) => (
                  <IdentityDashboard key={did} did={did} onClear={() => handleForget(did)} />
                ))}

                {dids.length === 0 || showCreate ? (
                  <CreateIdentity onCreated={handleCreated} storage={storage} />
                ) : (
                  <button
                    onClick={() => setShowCreate(true)}
                    className="btn-secondary w-full py-2.5 text-sm"
                  >
                    + Create another identity
                  </button>
                )}
              </div>
            )}

            {tab === "resolve" && <ResolveIdentity />}
            {tab === "vault" && <VaultBackup vault={vault} onImport={refreshDids} />}
          </VaultGate>
        )}
      </main>

      <footer className="border-t border-gray-800 py-4 text-center text-xs text-gray-600">
        Built with{" "}
        <a
          href="https://docs.iota.org/developer/iota-identity/"
          target="_blank"
          rel="noreferrer"
          className="text-iota-500 hover:underline"
        >
          IOTA Identity
        </a>{" "}
        &amp;{" "}
        <a
          href="https://docs.iota.org/developer/ts-sdk/dapp-kit/"
          target="_blank"
          rel="noreferrer"
          className="text-iota-500 hover:underline"
        >
          dApp Kit
        </a>
      </footer>
    </div>
  );
}

function LandingBanner({ initialising }: { initialising: boolean }) {
  return (
    <div className="card text-center space-y-6 py-10">
      {/* Logo mark */}
      <div className="mx-auto w-16 h-16 rounded-2xl bg-gradient-to-br from-iota-500 to-iota-700 flex items-center justify-center select-none shadow-xl shadow-iota-900/60">
        <svg className="w-10 h-10" viewBox="0 0 20 20" fill="none" aria-hidden="true">
          <circle cx="10" cy="13.5" r="1.4" fill="white" />
          <path d="M7.8 13.5C7.8 10.8 8.7 9 10 9C11.3 9 12.2 10.8 12.2 13.5" stroke="white" strokeWidth="1.4" strokeLinecap="round" />
          <path d="M5.5 13.5C5.5 8.5 7.4 5.5 10 5.5C12.6 5.5 14.5 8.5 14.5 13.5C14.5 15.5 13.8 17 12.5 18" stroke="white" strokeWidth="1.4" strokeLinecap="round" />
          <path d="M3 14C3 6.5 6.1 2.5 10 2.5C13.9 2.5 17 6.5 17 14C17 16.5 16 18.5 14.5 19.5" stroke="white" strokeWidth="1.4" strokeLinecap="round" />
        </svg>
      </div>

      <div>
        <h1 className="text-2xl font-bold text-gray-100">IOTA Identity Manager</h1>
        <p className="mt-2 text-gray-400 max-w-md mx-auto">
          Create and manage self-sovereign digital identities (DIDs) anchored to the IOTA
          ledger — directly from your browser wallet.
        </p>
      </div>

      {initialising ? (
        <p className="text-sm text-gray-500 animate-pulse">
          Connecting to the IOTA network…
        </p>
      ) : (
        <div className="space-y-3 text-sm text-gray-400 max-w-xs mx-auto text-left">
          <Feature icon="🔗">Create a DID anchored to your wallet address</Feature>
          <Feature icon="📄">Inspect verification methods and services</Feature>
          <Feature icon="✏️">Update your DID document on-chain</Feature>
          <Feature icon="🔍">Resolve any did:iota identifier</Feature>
        </div>
      )}

      <p className="text-sm text-gray-500">
        Connect your IOTA wallet using the button in the top right to get started.
      </p>
    </div>
  );
}

function Feature({ icon, children }: { icon: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2">
      <span className="text-base">{icon}</span>
      <span>{children}</span>
    </div>
  );
}
