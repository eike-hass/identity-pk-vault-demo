import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { Header } from "../../components/Header";

vi.mock("@iota/dapp-kit", () => ({
  useCurrentAccount: vi.fn(() => null),
  useIotaClientContext: vi.fn(() => ({
    network: "devnet",
    selectNetwork: vi.fn(),
  })),
  ConnectButton: () => <button>Connect</button>,
}));

vi.mock("@iota/iota-sdk/client", () => ({
  getNetwork: vi.fn((network: string) => {
    const map: Record<string, string> = {
      devnet: "iota:devnet",
      testnet: "iota:testnet",
      localnet: "iota:local",
    };
    if (!(network in map)) throw new Error(`Unknown network: ${network}`);
    return { chain: map[network] };
  }),
}));

import { useCurrentAccount, useIotaClientContext } from "@iota/dapp-kit";

function mockAccount(chains: string[]) {
  vi.mocked(useCurrentAccount).mockReturnValue(
    { address: "0xabc", chains } as unknown as ReturnType<typeof useCurrentAccount>,
  );
}

function mockContext(network: string) {
  vi.mocked(useIotaClientContext).mockReturnValue(
    { network, selectNetwork: vi.fn() } as unknown as ReturnType<typeof useIotaClientContext>,
  );
}

beforeEach(() => {
  vi.mocked(useCurrentAccount).mockReturnValue(null);
  vi.mocked(useIotaClientContext).mockReturnValue(
    { network: "devnet", selectNetwork: vi.fn() } as unknown as ReturnType<typeof useIotaClientContext>,
  );
});

describe("Header — network mismatch banner", () => {
  it("is not shown when no wallet is connected", () => {
    render(<Header />);
    expect(screen.queryByText(/different network/i)).not.toBeInTheDocument();
  });

  it("is not shown when wallet chain matches dApp network", () => {
    mockContext("devnet");
    mockAccount(["iota:devnet"]);
    render(<Header />);
    expect(screen.queryByText(/different network/i)).not.toBeInTheDocument();
  });

  it("is shown when wallet is on a different network", () => {
    mockContext("devnet");
    mockAccount(["iota:testnet"]);
    render(<Header />);
    expect(screen.getByText(/different network/i)).toBeInTheDocument();
  });

  it("is not shown for burner wallet (iota:unknown)", () => {
    mockContext("devnet");
    mockAccount(["iota:unknown"]);
    render(<Header />);
    expect(screen.queryByText(/different network/i)).not.toBeInTheDocument();
  });

  it("is not shown when wallet supports multiple chains including the dApp chain", () => {
    mockContext("testnet");
    mockAccount(["iota:devnet", "iota:testnet"]);
    render(<Header />);
    expect(screen.queryByText(/different network/i)).not.toBeInTheDocument();
  });

  it("names the dApp's current network in the banner", () => {
    mockContext("testnet");
    mockAccount(["iota:devnet"]);
    render(<Header />);
    // Scope to the banner div to avoid matching the <option>Testnet</option> in the select.
    const banner = screen.getByText(/different network/i).closest("div")!;
    expect(within(banner).getByText(/switch your wallet to/i)).toBeInTheDocument();
    // The <span className="font-semibold capitalize"> holds the exact (lowercase) network value.
    expect(within(banner).getByText("testnet")).toBeInTheDocument();
  });

  it("is not shown when getNetwork throws for unknown network names", () => {
    mockContext("unknownnet");
    mockAccount(["iota:devnet"]);
    render(<Header />);
    expect(screen.queryByText(/different network/i)).not.toBeInTheDocument();
  });
});

describe("Header — vault status pill", () => {
  it("is not rendered when no wallet is connected", () => {
    render(<Header vaultStatus="unlocked" />);
    expect(screen.queryByText("Unlocked")).not.toBeInTheDocument();
  });

  it("shows Unlocked when account is connected and vault is unlocked", () => {
    mockAccount(["iota:devnet"]);
    render(<Header vaultStatus="unlocked" />);
    expect(screen.getByText("Unlocked")).toBeInTheDocument();
  });

  it("shows Locked when vault is locked", () => {
    mockAccount(["iota:devnet"]);
    render(<Header vaultStatus="locked" />);
    expect(screen.getByText("Locked")).toBeInTheDocument();
  });

  it("shows Not set up when vault is unregistered", () => {
    mockAccount(["iota:devnet"]);
    render(<Header vaultStatus="unregistered" />);
    expect(screen.getByText("Not set up")).toBeInTheDocument();
  });
});

describe("Header — network selector", () => {
  it("renders a network select element", () => {
    render(<Header />);
    expect(screen.getByRole("combobox")).toBeInTheDocument();
  });

  it("shows Testnet, Devnet, Localnet options", () => {
    render(<Header />);
    const select = screen.getByRole("combobox");
    const options = within(select).getAllByRole("option");
    expect(options.map((o) => o.textContent)).toEqual(["Testnet", "Devnet", "Localnet"]);
  });
});
