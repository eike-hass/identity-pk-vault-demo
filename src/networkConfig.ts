import { createNetworkConfig } from "@iota/dapp-kit";
import { getFullnodeUrl } from "@iota/iota-sdk/client";

// Supported networks. Add more entries here to expose them in the UI.
const { networkConfig, useNetworkVariable } = createNetworkConfig({
  testnet: {
    url: getFullnodeUrl("testnet"),
  },
  devnet: {
    url: getFullnodeUrl("devnet"),
  },
  localnet: {
    url: getFullnodeUrl("localnet"),
  },
});

export { networkConfig, useNetworkVariable };

export type Network = "testnet" | "devnet" | "localnet";
