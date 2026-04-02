import { useEffect, useState } from "react";
import {
  useConnectWallet,
  useCurrentAccount,
  useWallets,
  useIotaClientQuery,
  useIotaClient,
} from "@iota/dapp-kit";
import { useIotaClientContext } from "@iota/dapp-kit";
import { useQueryClient } from "@tanstack/react-query";
import { requestIotaFromFaucetV0, getFaucetHost, FaucetRateLimitError } from "@iota/iota-sdk/faucet";
import { retryAsync } from "../lib/retryAsync";
import { registerStableBurnerWallet } from "./stableBurnerWallet";
import type { IotaClient } from "@iota/iota-sdk/client";

const BURNER_WALLET_NAME = "Unsafe Burner Wallet";
const IOTA_COIN_TYPE = "0x2::iota::IOTA";
const NANOS_PER_IOTA = 1_000_000_000n;

function formatBalance(totalBalance: string): string {
  const nanos = BigInt(totalBalance);
  const whole = nanos / NANOS_PER_IOTA;
  const frac = nanos % NANOS_PER_IOTA;
  return `${whole}.${frac.toString().padStart(9, "0").slice(0, 3)} IOTA`;
}

type FundState = "idle" | "loading" | "success" | "error" | "ratelimit";

/**
 * Rendered only when VITE_USE_MOCK=true.
 *
 * Auto-connects to the dApp Kit "Unsafe Burner Wallet" and shows the wallet
 * address, live balance, network, and an inline "Fund wallet" button that
 * calls the faucet API directly without opening an external page.
 */
export function DevModeBanner() {
  const wallets = useWallets();
  const account = useCurrentAccount();
  const { mutate: connectWallet } = useConnectWallet();
  const { network } = useIotaClientContext();
  const iotaClient = useIotaClient();
  const queryClient = useQueryClient();
  const [dismissed, setDismissed] = useState(false);
  const [fundState, setFundState] = useState<FundState>("idle");

  // Register the stable burner wallet (localStorage-persisted keypair so address
  // stays the same across page reloads — required for E2E DID tests).
  useEffect(() => {
    return registerStableBurnerWallet(iotaClient as unknown as IotaClient) ?? undefined;
  }, [iotaClient]);

  const { data: balanceData, isLoading: balanceLoading } = useIotaClientQuery(
    "getBalance",
    { owner: account?.address ?? "", coinType: IOTA_COIN_TYPE },
    { enabled: !!account, refetchInterval: 10_000 },
  );

  // Auto-connect to the burner wallet once it is registered.
  useEffect(() => {
    if (account) return;
    const burner = wallets.find((w) => w.name === BURNER_WALLET_NAME);
    if (burner) connectWallet({ wallet: burner });
  }, [wallets, account, connectWallet]);

  async function handleFund() {
    if (!account || fundState === "loading") return;
    setFundState("loading");
    try {
      await retryAsync(
        () => requestIotaFromFaucetV0({ host: getFaucetHost(network), recipient: account.address }),
        {
          attempts: 3,
          delayMs: 1000,
          shouldRetry: (err) => !(err instanceof FaucetRateLimitError),
        },
      );
      setFundState("success");
    } catch (err) {
      setFundState(err instanceof FaucetRateLimitError ? "ratelimit" : "error");
    }
  }

  // After a successful faucet request, poll until the balance actually increases,
  // then transition to idle. Effect cleanup aborts the poll on unmount.
  useEffect(() => {
    if (fundState !== "success") return;
    const controller = new AbortController();
    const prevBalance = balanceData?.totalBalance ?? "0";

    retryAsync(
      async () => {
        const result = await iotaClient.getBalance({ owner: account?.address ?? "", coinType: IOTA_COIN_TYPE });
        if (result.totalBalance === prevBalance) throw new Error("balance unchanged");
      },
      { attempts: 10, delayMs: 1000, shouldRetry: () => true, signal: controller.signal },
    )
      .then(() => queryClient.invalidateQueries({ queryKey: ["getBalance"] }))
      .finally(() => { if (!controller.signal.aborted) setFundState("idle"); });

    return () => controller.abort();
  }, [fundState, balanceData, account, queryClient]);

  // Reset error/ratelimit states after a delay.
  useEffect(() => {
    if (fundState !== "error" && fundState !== "ratelimit") return;
    const id = setTimeout(() => setFundState("idle"), 4_000);
    return () => clearTimeout(id);
  }, [fundState]);

  if (dismissed) return null;

  const isZero = balanceData?.totalBalance === "0";
  const balanceText = balanceLoading
    ? "…"
    : balanceData
      ? formatBalance(balanceData.totalBalance)
      : "unavailable";

  const fundLabel =
    fundState === "loading"
      ? "Requesting…"
      : fundState === "success"
        ? "Funded ✓"
        : fundState === "ratelimit"
          ? "Rate limited"
          : fundState === "error"
            ? "Failed — retry"
            : isZero
              ? "⚠ Fund wallet"
              : "Request tokens";

  const fundColor =
    fundState === "success"
      ? "text-green-400"
      : fundState === "error" || fundState === "ratelimit"
        ? "text-red-400"
        : isZero
          ? "text-red-400 font-semibold"
          : "text-amber-300 hover:text-amber-200";

  return (
    <div className="relative bg-amber-950/60 border-b border-amber-700/50 px-4 py-2 text-xs text-amber-300 flex items-center gap-3 flex-wrap">
      <span className="font-semibold shrink-0 uppercase tracking-wide text-amber-400">
        Dev Mode
      </span>

      <span className="text-amber-400/70">|</span>

      <span className="shrink-0">
        Wallet:{" "}
        {account ? (
          <span className="font-mono text-amber-200">
            {account.address.slice(0, 10)}…{account.address.slice(-6)}
          </span>
        ) : (
          <span className="animate-pulse text-amber-500">connecting…</span>
        )}
      </span>

      {account && (
        <>
          <span className="text-amber-400/70">|</span>
          <span className="shrink-0">
            Balance:{" "}
            <span className={`font-medium ${isZero ? "text-red-400" : "text-amber-200"}`}>
              {balanceText}
            </span>
          </span>
        </>
      )}

      <span className="text-amber-400/70">|</span>

      <span className="shrink-0">
        Network: <span className="font-medium text-amber-200">{network}</span>
      </span>

      {account && (
        <>
          <span className="text-amber-400/70">|</span>
          <button
            onClick={handleFund}
            disabled={fundState === "loading" || fundState === "success"}
            className={`shrink-0 underline underline-offset-2 transition-colors disabled:cursor-default disabled:no-underline ${fundColor}`}
          >
            {fundLabel}
          </button>
        </>
      )}

      <button
        onClick={() => setDismissed(true)}
        className="ml-auto shrink-0 text-amber-500 hover:text-amber-300 transition-colors"
        aria-label="Dismiss"
      >
        ✕
      </button>
    </div>
  );
}
