import { ConnectButton, useCurrentAccount, useIotaClientContext } from "@iota/dapp-kit";
import { getNetwork } from "@iota/iota-sdk/client";
import type { VaultStatus } from "../hooks/usePasskeyVault";
import type { Network } from "../networkConfig";

const NETWORKS: { id: Network; label: string }[] = [
  { id: "testnet", label: "Testnet" },
  { id: "devnet", label: "Devnet" },
  { id: "localnet", label: "Localnet" },
];

const VAULT_STATUS_CONFIG: Record<
  VaultStatus,
  { label: string; dot: string; text: string; tooltip: string }
> = {
  checking:     { label: "Vault",       dot: "bg-gray-500 animate-pulse", text: "text-gray-400", tooltip: "Checking key vault…"                                                                     },
  unsupported:  { label: "Unsupported", dot: "bg-amber-500",              text: "text-amber-400", tooltip: "WebAuthn PRF not available. Keys are stored in memory only and lost on page reload."    },
  unregistered: { label: "Not set up",  dot: "bg-gray-500",               text: "text-gray-400", tooltip: "No key vault found. Create one with your device biometrics to persist signing keys."    },
  locked:       { label: "Locked",      dot: "bg-orange-500",             text: "text-orange-400", tooltip: "Key vault is locked. Unlock with biometrics to enable signing operations."            },
  unlocked:     { label: "Unlocked",    dot: "bg-green-500",              text: "text-green-400", tooltip: "Key vault is unlocked. Signing keys are available for this session."                   },
  error:        { label: "Vault error", dot: "bg-red-500",                text: "text-red-400", tooltip: "Key vault encountered an error. Reload the page to try again."                          },
};

function VaultStatusPill({ status }: { status: VaultStatus }) {
  const { label, dot, text, tooltip } = VAULT_STATUS_CONFIG[status];
  return (
    <div className="relative group hidden sm:flex items-center">
      <div className={`flex items-center gap-1.5 text-xs font-medium cursor-default ${text}`}>
        <span className={`w-2 h-2 rounded-full shrink-0 ${dot}`} />
        {label}
      </div>
      {/* Tooltip */}
      <div className="
        pointer-events-none absolute right-0 top-full mt-2 z-50
        w-56 rounded-lg bg-gray-800 border border-gray-700
        px-3 py-2 text-xs text-gray-300 leading-snug shadow-xl
        opacity-0 group-hover:opacity-100 transition-opacity duration-150
      ">
        {tooltip}
        {/* Arrow */}
        <span className="absolute -top-1.5 right-3 w-3 h-3 bg-gray-800 border-l border-t border-gray-700 rotate-45" />
      </div>
    </div>
  );
}

export function Header({ vaultStatus }: { vaultStatus?: VaultStatus }) {
  const account = useCurrentAccount();
  const { network: currentNetwork, selectNetwork } = useIotaClientContext();

  // Detect network mismatch between the dApp's selected network and the wallet's chain.
  const dappChain = (() => {
    try { return getNetwork(currentNetwork).chain; } catch { return null; }
  })();
  const walletChain = account?.chains?.[0] ?? null;
  const networkMismatch =
    account &&
    dappChain &&
    walletChain &&
    walletChain !== "iota:unknown" &&
    !account.chains.includes(dappChain);

  return (
    <header className="border-b border-gray-800 bg-gray-950/80 backdrop-blur sticky top-0 z-50">
      {networkMismatch && (
        <div className="bg-amber-950/70 border-b border-amber-800/50 px-4 py-1.5 text-center text-xs text-amber-300">
          Your wallet is on a different network. Please switch your wallet to{" "}
          <span className="font-semibold capitalize">{currentNetwork}</span> to sign transactions.
        </div>
      )}
      <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between gap-4">
        {/* Logo + title */}
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-iota-500 to-iota-700 flex items-center justify-center select-none shadow-lg shadow-iota-900/60">
            <svg className="w-5 h-5" viewBox="0 0 20 20" fill="none" aria-hidden="true">
              {/* Fingerprint — center dot + 3 concentric ridges */}
              <circle cx="10" cy="13.5" r="1.4" fill="white" />
              <path d="M7.8 13.5C7.8 10.8 8.7 9 10 9C11.3 9 12.2 10.8 12.2 13.5" stroke="white" strokeWidth="1.4" strokeLinecap="round" />
              <path d="M5.5 13.5C5.5 8.5 7.4 5.5 10 5.5C12.6 5.5 14.5 8.5 14.5 13.5C14.5 15.5 13.8 17 12.5 18" stroke="white" strokeWidth="1.4" strokeLinecap="round" />
              <path d="M3 14C3 6.5 6.1 2.5 10 2.5C13.9 2.5 17 6.5 17 14C17 16.5 16 18.5 14.5 19.5" stroke="white" strokeWidth="1.4" strokeLinecap="round" />
            </svg>
          </div>
          <div>
            <span className="font-semibold text-gray-100 text-sm">IOTA Identity</span>
            <span className="ml-1.5 text-gray-500 text-xs hidden sm:inline">Manager</span>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {/* Vault status — only shown when a wallet is connected */}
          {account && vaultStatus && <VaultStatusPill status={vaultStatus} />}

          {/* Network selector */}
          <select
            value={currentNetwork}
            onChange={(e) => selectNetwork(e.target.value as Network)}
            className="bg-gray-800 border border-gray-700 text-gray-300 text-xs rounded-lg px-2.5 py-1.5
                       focus:outline-none focus:ring-2 focus:ring-iota-500 cursor-pointer"
          >
            {NETWORKS.map(({ id, label }) => (
              <option key={id} value={id}>
                {label}
              </option>
            ))}
          </select>

          {/* Wallet connect */}
          <ConnectButton />
        </div>
      </div>
    </header>
  );
}
