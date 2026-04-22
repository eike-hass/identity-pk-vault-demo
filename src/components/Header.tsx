import { useState } from "react";
import { ConnectButton, useCurrentAccount, useIotaClientContext } from "@iota/dapp-kit";
import { getNetwork } from "@iota/iota-sdk/client";
import type { VaultStatus } from "../hooks/usePasskeyVault";
import type { Network } from "../networkConfig";

const NETWORKS: { id: Network; label: string }[] = [
  { id: "testnet", label: "Testnet" },
  { id: "devnet",  label: "Devnet"  },
  { id: "localnet",label: "Localnet"},
];

const VAULT_CFG: Record<VaultStatus, { label: string; dot: string; text: string; tooltip: string }> = {
  checking:     { label: "Vault",       dot: "#6b7280", text: "#6b7280", tooltip: "Checking key vault…"                                                                     },
  unsupported:  { label: "Unsupported", dot: "#f59e0b", text: "#fbbf24", tooltip: "WebAuthn PRF not available. Keys are stored in memory only and lost on page reload."    },
  unregistered: { label: "Not set up",  dot: "#6b7280", text: "#9ca3af", tooltip: "No key vault found. Create one with your device biometrics to persist signing keys."    },
  locked:       { label: "Locked",      dot: "#f97316", text: "#fb923c", tooltip: "Key vault is locked. Unlock with biometrics to enable signing."                         },
  unlocked:     { label: "Unlocked",    dot: "#22c55e", text: "#4ade80", tooltip: "Key vault is unlocked. Signing keys are available for this session."                    },
  error:        { label: "Vault error", dot: "#f87171", text: "#fca5a5", tooltip: "Key vault error. Reload the page to try again."                                         },
};

// ── Logo mark (person + verified badge) ────────────────────────────────────────
export function LogoMark({ size = 34 }: { size?: number }) {
  const br = Math.round(size * 0.294);
  const iconSize = Math.round(size * 0.62);
  return (
    <div style={{
      width: size, height: size,
      borderRadius: br,
      background: "linear-gradient(145deg, #0c4a7c 0%, #0369a1 40%, #0ea5e9 100%)",
      display: "flex", alignItems: "center", justifyContent: "center",
      boxShadow: `0 4px ${Math.round(size * 0.35)}px rgba(14,165,233,0.38), inset 0 1px 0 rgba(255,255,255,0.18)`,
      flexShrink: 0, position: "relative", overflow: "hidden",
    }}>
      {/* Inner glow */}
      <div style={{
        position: "absolute", inset: 0, borderRadius: "inherit",
        background: "radial-gradient(circle at 35% 30%, rgba(255,255,255,0.13) 0%, transparent 65%)",
        pointerEvents: "none",
      }} />
      <svg width={iconSize} height={iconSize} viewBox="0 0 20 20" fill="none" aria-hidden="true">
        {/* Head */}
        <circle cx="9.5" cy="7" r="3" stroke="white" strokeWidth="1.5" />
        {/* Shoulders arc */}
        <path d="M3.5 17.5C3.5 13.8 6.1 11.5 9.5 11.5C12.9 11.5 15.5 13.8 15.5 17.5"
          stroke="white" strokeWidth="1.5" strokeLinecap="round" />
        {/* Verified badge ring */}
        <circle cx="15.5" cy="6" r="3" fill="#0ea5e9" stroke="rgba(12,74,124,0.6)" strokeWidth="0.8" />
        {/* Checkmark inside badge */}
        <path d="M14 6L15.1 7.1L17.2 5" stroke="white" strokeWidth="1.2"
          strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </div>
  );
}

// ── Vault status pill ──────────────────────────────────────────────────────────
function VaultStatusPill({ status }: { status: VaultStatus }) {
  const [tooltipVisible, setTooltipVisible] = useState(false);
  const cfg = VAULT_CFG[status];

  return (
    <div
      style={{ position: "relative" }}
      onMouseEnter={() => setTooltipVisible(true)}
      onMouseLeave={() => setTooltipVisible(false)}
    >
      <div style={{
        display: "flex", alignItems: "center", gap: 5,
        fontSize: 12, fontWeight: 500, color: cfg.text, cursor: "default",
      }}>
        <span style={{
          width: 7, height: 7, borderRadius: "50%",
          background: cfg.dot, display: "inline-block",
          boxShadow: `0 0 6px ${cfg.dot}`,
          flexShrink: 0,
        }} />
        {cfg.label}
      </div>
      {tooltipVisible && (
        <div style={{
          position: "absolute", right: 0, top: "calc(100% + 8px)",
          width: 200, background: "#0f1c2e",
          border: "1px solid rgba(255,255,255,0.1)",
          borderRadius: 10, padding: "10px 12px",
          fontSize: 12, color: "var(--text-2)", lineHeight: 1.5,
          boxShadow: "0 8px 24px rgba(0,0,0,0.5)",
          pointerEvents: "none", zIndex: 100,
        }}>
          {cfg.tooltip}
        </div>
      )}
    </div>
  );
}

// ── Header ─────────────────────────────────────────────────────────────────────
export function Header({ vaultStatus }: { vaultStatus?: VaultStatus }) {
  const account = useCurrentAccount();
  const { network: currentNetwork, selectNetwork } = useIotaClientContext();

  const dappChain = (() => {
    try { return getNetwork(currentNetwork).chain; } catch { return null; }
  })();
  const walletChain = account?.chains?.[0] ?? null;
  const networkMismatch =
    account && dappChain && walletChain &&
    walletChain !== "iota:unknown" &&
    !account.chains.includes(dappChain);

  return (
    <header style={{
      position: "sticky", top: 0, zIndex: 50,
      borderBottom: "1px solid rgba(255,255,255,0.06)",
      background: "rgba(2,12,24,0.85)",
      backdropFilter: "blur(16px)",
    }}>
      {networkMismatch && (
        <div style={{
          background: "rgba(251,146,60,0.08)",
          borderBottom: "1px solid rgba(251,146,60,0.22)",
          padding: "6px 20px",
          textAlign: "center",
          fontSize: 12,
          color: "#fdba74",
        }}>
          Your wallet is on a different network. Please switch to{" "}
          <span style={{ fontWeight: 600 }}>{currentNetwork}</span> to sign transactions.
        </div>
      )}

      <div style={{
        maxWidth: 800, margin: "0 auto", padding: "0 20px",
        height: 60, display: "flex", alignItems: "center",
        justifyContent: "space-between", gap: 16,
      }}>
        {/* Logo */}
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <LogoMark size={34} />
          <div>
            <span style={{ fontWeight: 700, fontSize: 14, color: "var(--text-1)", letterSpacing: "-0.01em" }}>
              IOTA Identity
            </span>
            <span style={{ fontSize: 12, color: "var(--text-3)", marginLeft: 6 }}>Manager</span>
          </div>
        </div>

        {/* Right controls */}
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          {account && vaultStatus && <VaultStatusPill status={vaultStatus} />}

          {/* Network selector */}
          <select
            value={currentNetwork}
            onChange={(e) => selectNetwork(e.target.value as Network)}
            style={{
              background: "rgba(255,255,255,0.05)",
              border: "1px solid rgba(255,255,255,0.08)",
              color: "var(--text-2)",
              fontSize: 12,
              borderRadius: 8,
              padding: "5px 10px",
              fontFamily: "inherit",
              cursor: "pointer",
              outline: "none",
            }}
          >
            {NETWORKS.map(({ id, label }) => (
              <option key={id} value={id}>{label}</option>
            ))}
          </select>

          {/* dApp Kit connect button */}
          <ConnectButton />
        </div>
      </div>
    </header>
  );
}
