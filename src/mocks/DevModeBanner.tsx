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
  const frac  = nanos % NANOS_PER_IOTA;
  return `${whole}.${frac.toString().padStart(9, "0").slice(0, 3)} IOTA`;
}

type FundState = "idle" | "loading" | "success" | "error" | "ratelimit";

export function DevModeBanner() {
  const wallets   = useWallets();
  const account   = useCurrentAccount();
  const { mutate: connectWallet } = useConnectWallet();
  const { network } = useIotaClientContext();
  const iotaClient  = useIotaClient();
  const queryClient = useQueryClient();
  const [dismissed,  setDismissed]  = useState(false);
  const [fundState,  setFundState]  = useState<FundState>("idle");

  useEffect(() => {
    return registerStableBurnerWallet(iotaClient as unknown as IotaClient) ?? undefined;
  }, [iotaClient]);

  const { data: balanceData, isLoading: balanceLoading } = useIotaClientQuery(
    "getBalance",
    { owner: account?.address ?? "", coinType: IOTA_COIN_TYPE },
    { enabled: !!account, refetchInterval: 10_000 },
  );

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
        { attempts: 3, delayMs: 1000, shouldRetry: (err) => !(err instanceof FaucetRateLimitError) },
      );
      setFundState("success");
    } catch (err) {
      setFundState(err instanceof FaucetRateLimitError ? "ratelimit" : "error");
    }
  }

  useEffect(() => {
    if (fundState !== "success") return;
    const controller  = new AbortController();
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

  useEffect(() => {
    if (fundState !== "error" && fundState !== "ratelimit") return;
    const id = setTimeout(() => setFundState("idle"), 4_000);
    return () => clearTimeout(id);
  }, [fundState]);

  if (dismissed) return null;

  const isZero      = balanceData?.totalBalance === "0";
  const balanceText = balanceLoading ? "…" : balanceData ? formatBalance(balanceData.totalBalance) : "unavailable";

  const addrShort = account
    ? `${account.address.slice(0, 6)}…${account.address.slice(-4)}`
    : null;

  const fundLabel =
    fundState === "loading"   ? "Requesting…"
    : fundState === "success" ? "Funded ✓"
    : fundState === "ratelimit" ? "Rate limited"
    : fundState === "error"   ? "Failed — retry"
    : isZero                  ? "⚠ Fund wallet"
    : "Request tokens";

  return (
    <div style={{
      background: "rgba(14,165,233,0.08)",
      borderBottom: "1px solid rgba(14,165,233,0.15)",
      padding: "6px 20px",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      gap: 16,
      fontSize: 12,
      color: "#7dd3fc",
    }}>
      <span style={{ fontWeight: 600, color: "#38bdf8" }}>Demo mode</span>

      <span style={{ color: "var(--text-3)" }}>·</span>

      <span>
        Wallet:{" "}
        {addrShort
          ? <span style={{ fontFamily: "var(--font-mono)" }}>{addrShort}</span>
          : <span className="pulse" style={{ color: "var(--text-3)" }}>connecting…</span>
        }
      </span>

      {account && (
        <>
          <span style={{ color: "var(--text-3)" }}>·</span>
          <span>
            Balance:{" "}
            <span style={{ color: isZero ? "#f87171" : "#7dd3fc" }}>{balanceText}</span>
          </span>
        </>
      )}

      <span style={{ color: "var(--text-3)" }}>·</span>
      <span>Network: <span style={{ color: "#38bdf8" }}>{network}</span></span>

      {account && (
        <>
          <span style={{ color: "var(--text-3)" }}>·</span>
          <button
            onClick={handleFund}
            disabled={fundState === "loading" || fundState === "success"}
            style={{
              background: "rgba(14,165,233,0.15)",
              border: "1px solid rgba(14,165,233,0.3)",
              borderRadius: 5,
              padding: "2px 8px",
              color: fundState === "success" ? "#4ade80"
                   : fundState === "error" || fundState === "ratelimit" ? "#f87171"
                   : "#7dd3fc",
              fontSize: 11,
              cursor: fundState === "loading" || fundState === "success" ? "default" : "pointer",
              fontFamily: "inherit",
            }}
          >
            {fundLabel}
          </button>
        </>
      )}

      <button
        onClick={() => setDismissed(true)}
        style={{ marginLeft: "auto", background: "none", border: "none", color: "var(--text-3)", cursor: "pointer", fontSize: 14, lineHeight: 1 }}
        aria-label="Dismiss"
      >
        ✕
      </button>
    </div>
  );
}
