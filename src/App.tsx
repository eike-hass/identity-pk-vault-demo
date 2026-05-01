import { useEffect, useState } from "react";
import { useCurrentAccount, useIotaClientContext } from "@iota/dapp-kit";
import { listDids, putDid, deleteDid, openVaultDb } from "./storage/vault/vaultDb";
import { Header, LogoMark } from "./components/Header";
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
  { id: "resolve",  label: "Resolve DID" },
  { id: "vault",    label: "Key Vault"   },
];

// ── App ───────────────────────────────────────────────────────────────────────
export default function App() {
  const account = useCurrentAccount();
  const { network } = useIotaClientContext();

  const vault = usePasskeyVault();
  const { initialising, initError, storage } = useIdentityClient(vault.storage);

  const [dids, setDids] = useState<string[]>([]);
  const [activeDid, setActiveDid] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("identity");
  const [showCreate, setShowCreate] = useState(false);

  useEffect(() => {
    if (!account) {
      setDids([]);
      setActiveDid(null);
      setShowCreate(false);
      return;
    }
    openVaultDb()
      .then((db) => listDids(db, account.address, network))
      .then((fetched) => {
        setDids(fetched);
        setActiveDid(fetched.length > 0 ? fetched[0] : null);
      });
    setShowCreate(false);
  }, [account, network]);

  // Auto-select first DID when list changes and nothing active
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (dids.length > 0 && (!activeDid || !dids.includes(activeDid))) {
      setActiveDid(dids[0]);
      setShowCreate(false);
    }
  }, [dids]);

  async function handleCreated(newDid: string) {
    if (!account) return;
    const db = await openVaultDb();
    await putDid(db, account.address, network, newDid);
    setDids((prev) => [...prev, newDid]);
    setActiveDid(newDid);
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
    setDids((prev) => {
      const next = prev.filter((d) => d !== did);
      if (activeDid === did) setActiveDid(next[0] ?? null);
      return next;
    });
  }

  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column" }}>
      <Header vaultStatus={vault.status} />
      {MOCK_MODE && <DevModeBanner />}

      <main style={{
        flex: 1,
        maxWidth: 680,
        margin: "0 auto",
        width: "100%",
        padding: "28px 20px",
        display: "flex",
        flexDirection: "column",
        gap: 20,
      }}>
        {/* Init error */}
        {initError && (
          <div className="banner-warn" style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
            <span style={{ flexShrink: 0 }}>⚠</span>
            <span>
              <strong>Identity client error</strong>
              <br />
              {initError}
            </span>
          </div>
        )}

        {/* Not connected — landing banner */}
        {!account && <LandingBanner initialising={initialising} />}

        {/* Connected — vault gate guards key operations */}
        {account && (
          <VaultGate
            status={vault.status}
            onRegister={vault.register}
            onUnlock={vault.unlock}
            onRegisterAndRestore={vault.registerAndRestore}
            error={vault.error}
          >
            {/* Tab bar */}
            <div className="tab-bar">
              {TABS.map(({ id, label }) => (
                <button
                  key={id}
                  onClick={() => setTab(id)}
                  className={`tab-btn${tab === id ? " active" : ""}`}
                >
                  {label}
                </button>
              ))}
            </div>

            {/* Tab panels */}
            {tab === "identity" && (
              <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                {/* DID pill switcher — shown when 1+ DIDs exist */}
                {dids.length > 0 && (
                  <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                    {dids.map((did) => {
                      const short = did.split(":").pop()!.slice(0, 8) + "…";
                      const active = activeDid === did;
                      return (
                        <button
                          key={did}
                          onClick={() => { setActiveDid(did); setShowCreate(false); }}
                          title={did}
                          style={{
                            padding: "5px 12px",
                            borderRadius: 100,
                            fontSize: 12,
                            fontWeight: 500,
                            fontFamily: "var(--font-mono)",
                            cursor: "pointer",
                            border: "none",
                            background: active ? "var(--accent-muted)" : "rgba(255,255,255,0.06)",
                            color: active ? "#fff" : "var(--text-2)",
                            boxShadow: active ? "0 1px 6px rgba(0,0,0,0.3)" : "none",
                            transition: "all 0.15s",
                          }}
                        >
                          {short}
                        </button>
                      );
                    })}
                    {/* New identity pill */}
                    <button
                      onClick={() => { setShowCreate(true); setActiveDid(null); }}
                      style={{
                        padding: "5px 12px",
                        borderRadius: 100,
                        fontSize: 12,
                        fontWeight: 500,
                        cursor: "pointer",
                        border: "1px dashed rgba(255,255,255,0.15)",
                        background: showCreate ? "rgba(14,165,233,0.12)" : "transparent",
                        color: showCreate ? "#38bdf8" : "var(--text-3)",
                        display: "flex",
                        alignItems: "center",
                        gap: 5,
                        transition: "all 0.15s",
                      }}
                    >
                      <svg width={11} height={11} viewBox="0 0 11 11" fill="none">
                        <path d="M5.5 1.5V9.5M1.5 5.5H9.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
                      </svg>
                      New
                    </button>
                  </div>
                )}

                {/* Active DID dashboard */}
                {activeDid && !showCreate && (
                  <IdentityDashboard
                    key={activeDid}
                    did={activeDid}
                    storage={storage}
                    onClear={() => handleForget(activeDid)}
                  />
                )}

                {/* Create form — first run or when New is clicked */}
                {(dids.length === 0 || showCreate) && (
                  <CreateIdentity onCreated={handleCreated} storage={storage} />
                )}
              </div>
            )}

            {tab === "resolve" && <ResolveIdentity />}
            {tab === "vault"   && <VaultBackup vault={vault} onImport={refreshDids} />}
          </VaultGate>
        )}
      </main>

      <footer style={{
        borderTop: "1px solid rgba(255,255,255,0.05)",
        padding: "16px 20px",
        textAlign: "center",
        fontSize: 12,
        color: "var(--text-3)",
      }}>
        Built with{" "}
        <a href="https://docs.iota.org/developer/iota-identity/" target="_blank" rel="noreferrer"
           style={{ color: "#38bdf8", textDecoration: "none" }}>
          IOTA Identity
        </a>
        {" "}&amp;{" "}
        <a href="https://docs.iota.org/developer/ts-sdk/dapp-kit/" target="_blank" rel="noreferrer"
           style={{ color: "#38bdf8", textDecoration: "none" }}>
          dApp Kit
        </a>
      </footer>
    </div>
  );
}

// ── LandingBanner ─────────────────────────────────────────────────────────────
const FEATURES = [
  {
    icon: (
      <svg width={15} height={15} viewBox="0 0 16 16" fill="none" aria-hidden="true">
        <path d="M8 1.5L2.5 4V8C2.5 11.2 4.9 14.1 8 15C11.1 14.1 13.5 11.2 13.5 8V4L8 1.5Z"
          stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
        <path d="M5.5 8L7.2 9.7L10.5 6.5" stroke="currentColor" strokeWidth="1.3"
          strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
    text: "Create DIDs anchored to your wallet address",
  },
  {
    icon: (
      <svg width={15} height={15} viewBox="0 0 16 16" fill="none" aria-hidden="true">
        <circle cx="6" cy="7" r="3.5" stroke="currentColor" strokeWidth="1.3" />
        <path d="M9 8.5L14 8.5M12 8.5V11" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
      </svg>
    ),
    text: "Keys stored in hardware-bound passkey vault",
  },
  {
    icon: <span style={{ fontSize: 13, lineHeight: 1 }}>✎</span>,
    text: "Update your DID document on-chain",
  },
  {
    icon: <span style={{ fontSize: 13, lineHeight: 1 }}>◎</span>,
    text: "Resolve any did:iota identifier",
  },
];

function LandingBanner({ initialising }: { initialising: boolean }) {
  return (
    <div className="card fade-in" style={{ textAlign: "center", padding: "48px 32px" }}>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 28 }}>
        <LogoMark size={80} />

        <div>
          <h1 style={{ fontSize: 26, fontWeight: 700, color: "var(--text-1)", marginBottom: 10, letterSpacing: "-0.02em" }}>
            IOTA Identity Manager
          </h1>
          <p style={{ fontSize: 14, color: "var(--text-2)", lineHeight: 1.7, maxWidth: 420, margin: "0 auto" }}>
            Create and manage self-sovereign digital identities anchored to the IOTA ledger —
            directly from your browser wallet.
          </p>
        </div>

        {initialising ? (
          <p className="pulse" style={{ fontSize: 13, color: "var(--text-2)" }}>
            Connecting to the IOTA network…
          </p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 10, textAlign: "left", width: "100%", maxWidth: 340 }}>
            {FEATURES.map((f, i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span style={{
                  width: 28, height: 28, borderRadius: 8,
                  background: "rgba(14,165,233,0.1)",
                  border: "1px solid rgba(14,165,233,0.2)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  color: "#38bdf8", flexShrink: 0,
                }}>
                  {f.icon}
                </span>
                <span style={{ fontSize: 13, color: "var(--text-2)" }}>{f.text}</span>
              </div>
            ))}
          </div>
        )}

        <p style={{ fontSize: 13, color: "var(--text-2)" }}>
          Connect your IOTA wallet using the button in the top right to get started.
        </p>
      </div>
    </div>
  );
}
