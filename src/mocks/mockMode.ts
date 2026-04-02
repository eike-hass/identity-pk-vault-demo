/**
 * Mock mode bypasses the IOTA Browser Wallet for local development.
 *
 * Enable by setting VITE_USE_MOCK=true in your .env.local file.
 * The dApp Kit "Unsafe Burner Wallet" is registered and auto-connected —
 * it signs transactions automatically using an in-memory Ed25519 keypair.
 *
 * You still need a running IOTA node (localnet) and a funded burner address.
 * The DevModeBanner shows the address and a faucet link.
 */
export const MOCK_MODE = import.meta.env.VITE_USE_MOCK === "true";
