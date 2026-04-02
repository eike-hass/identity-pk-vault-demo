/**
 * Stable mock burner wallet.
 *
 * Like dApp Kit's `registerUnsafeBurnerWallet` but persists the Ed25519 keypair
 * in localStorage so the wallet address stays the same across page reloads.
 * This is essential for E2E tests that rely on DIDs stored per wallet address.
 *
 * Storage key: "iota-mock-burner-keypair"  (Bech32-encoded secret key)
 */
import { Ed25519Keypair } from "@iota/iota-sdk/keypairs/ed25519";
import { Transaction } from "@iota/iota-sdk/transactions";
import { toBase64 } from "@iota/iota-sdk/utils";
import { getWallets, ReadonlyWalletAccount, SUPPORTED_CHAINS } from "@iota/wallet-standard";
import type { IotaClient } from "@iota/iota-sdk/client";

const WALLET_NAME = "Unsafe Burner Wallet";
const STORAGE_KEY = "iota-mock-burner-keypair";

function getMockKeypair(): Ed25519Keypair {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored) {
    try {
      return Ed25519Keypair.fromSecretKey(stored);
    } catch {
      // Corrupt data — generate a fresh keypair below.
    }
  }
  const keypair = new Ed25519Keypair();
  localStorage.setItem(STORAGE_KEY, keypair.getSecretKey());
  return keypair;
}

export function registerStableBurnerWallet(iotaClient: IotaClient): (() => void) | undefined {
  const walletsApi = getWallets();
  if (walletsApi.get().find((w) => w.name === WALLET_NAME)) {
    // Already registered (e.g. iotaClient changed but wallet is still live).
    return;
  }

  const keypair = getMockKeypair();
  const account = new ReadonlyWalletAccount({
    address: keypair.getPublicKey().toIotaAddress(),
    publicKey: keypair.getPublicKey().toIotaBytes(),
    chains: ["iota:unknown"],
    features: ["iota:signTransaction", "iota:signAndExecuteTransaction"],
  });

  const wallet = {
    get version() { return "1.0.0" as const; },
    get name() { return WALLET_NAME; },
    get icon() { return "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==" as `data:image/${string};base64,${string}`; },
    get chains() { return SUPPORTED_CHAINS; },
    get accounts() { return [account]; },
    get features() {
      return {
        "standard:connect": {
          version: "1.0.0" as const,
          connect: async () => ({ accounts: [account] }),
        },
        "standard:events": {
          version: "1.0.0" as const,
          on: () => () => {},
        },
        "iota:signPersonalMessage": {
          version: "1.0.0" as const,
          signPersonalMessage: async (input: { message: Uint8Array }) => {
            return keypair.signPersonalMessage(input.message);
          },
        },
        "iota:signTransaction": {
          version: "2.0.0" as const,
          signTransaction: async (input: { transaction: { toJSON(): Promise<string> }; signal?: AbortSignal }) => {
            const { bytes, signature } = await Transaction.from(
              await input.transaction.toJSON(),
            ).sign({ client: iotaClient, signer: keypair });
            input.signal?.throwIfAborted();
            return { bytes, signature };
          },
        },
        "iota:signAndExecuteTransaction": {
          version: "2.0.0" as const,
          signAndExecuteTransaction: async (input: { transaction: { toJSON(): Promise<string> }; signal?: AbortSignal }) => {
            const { bytes, signature } = await Transaction.from(
              await input.transaction.toJSON(),
            ).sign({ client: iotaClient, signer: keypair });
            input.signal?.throwIfAborted();
            const { rawEffects, digest } = await (iotaClient as unknown as {
              executeTransactionBlock(args: { signature: string; transactionBlock: string; options: object }): Promise<{ rawEffects: number[]; digest: string }>;
            }).executeTransactionBlock({
              signature,
              transactionBlock: bytes,
              options: { showRawEffects: true },
            });
            return { bytes, signature, digest, effects: toBase64(new Uint8Array(rawEffects)) };
          },
        },
      };
    },
  };

  return walletsApi.register(wallet as Parameters<typeof walletsApi.register>[0]);
}
