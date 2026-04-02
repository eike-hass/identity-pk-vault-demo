import React from "react";
import ReactDOM from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { IotaClientProvider, WalletProvider, darkTheme } from "@iota/dapp-kit";
import "@iota/dapp-kit/dist/index.css";

// Custom theme: darkTheme base, overridden to match the app's gray-950 + iota-600 palette.
const appTheme = {
  ...darkTheme,
  backgroundColors: {
    ...darkTheme.backgroundColors,
    primaryButton: "#0284c7",         // iota-600
    primaryButtonHover: "#0ea5e9",    // iota-500
    outlineButtonHover: "#1f2937",    // gray-800
    modalPrimary: "#111827",          // gray-900
    modalSecondary: "#1f2937",        // gray-800
    dropdownMenu: "#111827",          // gray-900
    dropdownMenuSeparator: "#374151", // gray-700
    walletItemHover: "rgba(255,255,255,0.05)",
    walletItemSelected: "rgba(255,255,255,0.10)",
    scrollThumb: "#374151",           // gray-700
    modalOverlay: "rgba(0,0,0,0.75)",
  },
  borderColors: {
    outlineButton: "#374151",         // gray-700
  },
  colors: {
    ...darkTheme.colors,
    primaryButton: "#ffffff",
    outlineButtonHover: "#f3f4f6",    // gray-100
    body: "#f3f4f6",                  // gray-100
    bodyMuted: "#9ca3af",             // gray-400
  },
};

import { networkConfig } from "./networkConfig";
import App from "./App";
import "./index.css";
import { MOCK_MODE } from "./mocks/mockMode";

// ── WASM initialisation ──────────────────────────────────────────────────────
// The identity-wasm web build ships a separate .wasm file. Vite resolves the
// `?url` suffix to the asset URL at build time; at runtime the WASM binary is
// fetched and initialised before React mounts.
import wasmUrl from "@iota/identity-wasm/web/identity_wasm_bg.wasm?url";
import { init } from "@iota/identity-wasm/web";

const queryClient = new QueryClient();

init(wasmUrl).then(() => {
  ReactDOM.createRoot(document.getElementById("root")!).render(
    <React.StrictMode>
      <QueryClientProvider client={queryClient}>
        <IotaClientProvider
          networks={networkConfig}
          defaultNetwork={(import.meta.env.VITE_DEFAULT_NETWORK as "testnet" | "devnet" | "localnet" | undefined) || "devnet"}
        >
          <WalletProvider autoConnect={!MOCK_MODE} theme={appTheme}>
            <App />
          </WalletProvider>
        </IotaClientProvider>
      </QueryClientProvider>
    </React.StrictMode>,
  );
}).catch((err) => {
  document.getElementById("root")!.innerHTML =
    `<div style="font-family:sans-serif;padding:2rem;color:#f87171">` +
    `<strong>Failed to initialise WASM:</strong><br><pre>${err}</pre></div>`;
});
