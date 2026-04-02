/// <reference types="node" />
import { defineConfig, devices } from "@playwright/test";

const CI = !!process.env["CI"];

export default defineConfig({
  testDir: "./e2e",
  // Run tests serially within each project — vault tests share browser state.
  fullyParallel: false,
  forbidOnly: CI,
  retries: CI ? 1 : 0,
  use: {
    baseURL: "http://localhost:5174",
    trace: "retain-on-failure",
  },
  projects: [
    {
      name: "vault",
      testMatch: "**/vault-lifecycle.spec.ts",
      use: { ...devices["Desktop Chrome"], channel: "chrome" },
    },
    {
      name: "backup",
      testMatch: "**/backup-restore.spec.ts",
      use: { ...devices["Desktop Chrome"], channel: "chrome" },
    },
    {
      // Only runs when LOCALNET=true is set; requires a local IOTA node.
      name: "did",
      testMatch: "**/did-lifecycle.spec.ts",
      use: { ...devices["Desktop Chrome"], channel: "chrome" },
    },
  ],
  webServer: {
    // E2E tests always need VITE_USE_MOCK=true (burner wallet auto-connect).
    // Use port 5174 so this server is independent of any dev server on 5173.
    command: "npm run dev -- --port 5174",
    url: "http://localhost:5174",
    reuseExistingServer: false,
    env: {
      VITE_USE_MOCK: "true",
      // Forward localnet package ID so IdentityClientReadOnly.create() can skip auto-discovery.
      ...(process.env["IOTA_IDENTITY_PKG_ID"] && {
        VITE_IOTA_IDENTITY_PKG_ID: process.env["IOTA_IDENTITY_PKG_ID"],
      }),
      // Start on localnet when running DID tests so the burner wallet never switches networks
      // (each network switch re-registers the burner wallet with a new random keypair,
      // causing the funded address to diverge from the signer address).
      ...(process.env["LOCALNET"] && { VITE_DEFAULT_NETWORK: "localnet" }),
    },
  },
});
