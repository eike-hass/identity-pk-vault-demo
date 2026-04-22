import React from "react";
import ReactDOM from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { IotaClientProvider, WalletProvider, darkTheme } from "@iota/dapp-kit";
import "@iota/dapp-kit/dist/index.css";

// Custom theme — matches the new Space Grotesk + deep navy palette.
const appTheme = {
  ...darkTheme,
  blurs: {
    modalOverlay: "blur(16px)",
  },
  backgroundColors: {
    ...darkTheme.backgroundColors,
    primaryButton:       "#0369a1",               // resting (overridden to gradient via CSS)
    primaryButtonHover:  "#0ea5e9",               // hover (overridden via CSS)
    outlineButtonHover:  "rgba(255,255,255,0.08)",
    modalPrimary:        "#080c18",               // deep navy card
    modalSecondary:      "#0d1525",               // slightly lighter
    dropdownMenu:        "#080c18",
    dropdownMenuSeparator: "rgba(255,255,255,0.07)",
    walletItemHover:     "rgba(255,255,255,0.05)",
    walletItemSelected:  "rgba(14,165,233,0.12)",
    scrollThumb:         "rgba(255,255,255,0.12)",
    modalOverlay:        "rgba(0,0,0,0.75)",
    iconButton:          "transparent",
  },
  borderColors: {
    outlineButton: "rgba(255,255,255,0.1)",
  },
  colors: {
    ...darkTheme.colors,
    primaryButton:      "#ffffff",
    outlineButtonHover: "#e2eeff",
    iconButton:         "#7090a8",
    body:               "#e2eeff",
    bodyMuted:          "#7090a8",
    bodyDanger:         "#fca5a5",
  },
  radii: {
    small:   "6px",
    medium:  "8px",
    large:   "12px",
    xlarge:  "16px",
    full:    "9px",        // square-ish buttons instead of pills
  },
  typography: {
    fontFamily: '"Space Grotesk", system-ui, sans-serif',
    fontStyle:  "normal",
    lineHeight: "22px",
    letterSpacing: "0.01em",
  },
  fontWeights: {
    normal: "400",
    medium: "500",
    bold:   "600",
  },
  fontSizes: {
    small:   "13px",
    medium:  "14px",
    large:   "16px",
    xlarge:  "18px",
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
