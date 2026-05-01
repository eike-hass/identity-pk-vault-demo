import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import App from "../../App";

// ── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock("@iota/dapp-kit", () => ({
  useCurrentAccount:    vi.fn(() => null),
  useIotaClientContext: vi.fn(() => ({ network: "testnet", selectNetwork: vi.fn() })),
  ConnectButton:        () => <button>Connect</button>,
}));

vi.mock("@iota/iota-sdk/client", () => ({
  getNetwork: vi.fn(() => ({ chain: "iota:testnet" })),
}));

vi.mock("../../storage/vault/vaultDb", () => ({
  openVaultDb: vi.fn(() => Promise.resolve({})),
  listDids:    vi.fn(() => Promise.resolve([])),
  putDid:      vi.fn(() => Promise.resolve()),
  deleteDid:   vi.fn(() => Promise.resolve()),
}));

vi.mock("../../hooks/useIdentityClient", () => ({
  useIdentityClient: vi.fn(() => ({ initialising: false, initError: null, storage: {} })),
}));

vi.mock("../../hooks/usePasskeyVault", () => ({
  usePasskeyVault: vi.fn(() => ({
    status: "unlocked", error: null, storage: {},
    register: vi.fn(), unlock: vi.fn(), registerAndRestore: vi.fn(),
  })),
}));

vi.mock("../../mocks/mockMode",    () => ({ MOCK_MODE: false }));
vi.mock("../../mocks/DevModeBanner", () => ({ DevModeBanner: () => null }));

// Pass-through so unlocked vault always renders children
vi.mock("../../components/VaultGate", () => ({
  VaultGate: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

// Sentinel stubs for child components
vi.mock("../../components/IdentityDashboard", () => ({
  IdentityDashboard: ({ did, onClear }: { did: string; onClear: () => void }) => (
    <div data-testid={`dashboard-${did}`}>
      <button onClick={onClear}>Forget</button>
    </div>
  ),
}));

vi.mock("../../components/CreateIdentity", () => ({
  CreateIdentity: ({ onCreated }: { onCreated: (did: string) => void }) => (
    <div data-testid="create-form">
      <button onClick={() => onCreated("did:iota:testnet:0xfresh0000000000")}>
        Create Identity
      </button>
    </div>
  ),
}));

vi.mock("../../components/ResolveIdentity", () => ({
  ResolveIdentity: () => <div data-testid="resolve-panel" />,
}));

vi.mock("../../components/VaultBackup", () => ({
  VaultBackup: () => <div data-testid="vault-backup-panel" />,
}));

vi.mock("../../components/Header", () => ({
  Header:   () => <header />,
  LogoMark: () => null,
}));

// ── Import mocks after vi.mock (hoisting) ─────────────────────────────────────

import { useCurrentAccount } from "@iota/dapp-kit";
import { listDids, deleteDid } from "../../storage/vault/vaultDb";

// ── Constants ─────────────────────────────────────────────────────────────────

const DID_A = "did:iota:testnet:0xaabbccdd11223344";
const DID_B = "did:iota:testnet:0x99887766aabbccdd";

const SHORT_A = DID_A.split(":").pop()!.slice(0, 8) + "…"; // "0xaabbcc…"
const SHORT_B = DID_B.split(":").pop()!.slice(0, 8) + "…"; // "0x998877…"

// ── Helpers ───────────────────────────────────────────────────────────────────

function mockConnected(dids: string[] = []) {
  vi.mocked(useCurrentAccount).mockReturnValue(
    { address: "0xwallet", chains: ["iota:testnet"] } as never,
  );
  vi.mocked(listDids).mockResolvedValue(dids);
}

beforeEach(() => {
  vi.mocked(useCurrentAccount).mockReturnValue(null);
  vi.mocked(listDids).mockResolvedValue([]);
  vi.mocked(deleteDid).mockResolvedValue(undefined);
});

// ── Pill bar visibility ───────────────────────────────────────────────────────

describe("App — pill bar visibility", () => {
  it("shows the create form directly when no DIDs exist", async () => {
    mockConnected([]);
    render(<App />);
    await waitFor(() => expect(screen.getByTestId("create-form")).toBeInTheDocument());
    expect(screen.queryByText("New")).not.toBeInTheDocument();
  });

  it("shows the pill bar for a single DID", async () => {
    mockConnected([DID_A]);
    render(<App />);
    await waitFor(() => expect(screen.getByText(SHORT_A)).toBeInTheDocument());
    expect(screen.getByText("New")).toBeInTheDocument();
  });

  it("shows both DID pills and the New pill when two DIDs exist", async () => {
    mockConnected([DID_A, DID_B]);
    render(<App />);
    await waitFor(() => {
      expect(screen.getByText(SHORT_A)).toBeInTheDocument();
      expect(screen.getByText(SHORT_B)).toBeInTheDocument();
      expect(screen.getByText("New")).toBeInTheDocument();
    });
  });
});

// ── Pill label format ─────────────────────────────────────────────────────────

describe("App — pill label format", () => {
  it("shows the last DID segment truncated to 8 chars + …", async () => {
    mockConnected([DID_A]);
    render(<App />);
    // "0xaabbccdd11223344" → "0xaabbcc…"
    await waitFor(() => expect(screen.getByText("0xaabbcc…")).toBeInTheDocument());
  });
});

// ── New pill interaction ──────────────────────────────────────────────────────

describe("App — New pill", () => {
  it("clicking New hides the dashboard and shows the create form", async () => {
    mockConnected([DID_A]);
    render(<App />);
    await waitFor(() => expect(screen.getByTestId(`dashboard-${DID_A}`)).toBeInTheDocument());

    fireEvent.click(screen.getByText("New"));

    expect(screen.getByTestId("create-form")).toBeInTheDocument();
    expect(screen.queryByTestId(`dashboard-${DID_A}`)).not.toBeInTheDocument();
  });

  it("clicking a DID pill while create form is open switches back to that dashboard", async () => {
    mockConnected([DID_A]);
    render(<App />);
    await waitFor(() => expect(screen.getByText(SHORT_A)).toBeInTheDocument());

    fireEvent.click(screen.getByText("New"));
    expect(screen.getByTestId("create-form")).toBeInTheDocument();

    fireEvent.click(screen.getByText(SHORT_A));
    expect(screen.queryByTestId("create-form")).not.toBeInTheDocument();
    expect(screen.getByTestId(`dashboard-${DID_A}`)).toBeInTheDocument();
  });
});

// ── DID pill switching ────────────────────────────────────────────────────────

describe("App — DID pill switching", () => {
  it("clicking the second DID pill shows its dashboard and hides the first", async () => {
    mockConnected([DID_A, DID_B]);
    render(<App />);
    await waitFor(() => expect(screen.getByTestId(`dashboard-${DID_A}`)).toBeInTheDocument());

    fireEvent.click(screen.getByText(SHORT_B));

    expect(screen.getByTestId(`dashboard-${DID_B}`)).toBeInTheDocument();
    expect(screen.queryByTestId(`dashboard-${DID_A}`)).not.toBeInTheDocument();
  });
});

// ── handleForget ─────────────────────────────────────────────────────────────

describe("App — handleForget", () => {
  it("forgetting the only DID removes the pill bar and shows the create form", async () => {
    mockConnected([DID_A]);
    render(<App />);
    await waitFor(() => expect(screen.getByTestId(`dashboard-${DID_A}`)).toBeInTheDocument());

    fireEvent.click(screen.getByRole("button", { name: /forget/i }));

    await waitFor(() => expect(screen.getByTestId("create-form")).toBeInTheDocument());
    expect(screen.queryByText("New")).not.toBeInTheDocument();
    expect(deleteDid).toHaveBeenCalled();
  });

  it("forgetting the active DID from two auto-selects the remaining DID", async () => {
    mockConnected([DID_A, DID_B]);
    render(<App />);
    await waitFor(() => expect(screen.getByTestId(`dashboard-${DID_A}`)).toBeInTheDocument());

    fireEvent.click(screen.getByRole("button", { name: /forget/i }));

    await waitFor(() => expect(screen.getByTestId(`dashboard-${DID_B}`)).toBeInTheDocument());
    expect(screen.getByText(SHORT_B)).toBeInTheDocument();
    expect(screen.getByText("New")).toBeInTheDocument();
    expect(screen.queryByText(SHORT_A)).not.toBeInTheDocument();
  });
});
