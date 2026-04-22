import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { IdentityDashboard } from "../../components/IdentityDashboard";

// ── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock("@iota/identity-wasm/web", () => ({
  IotaDID: { parse: vi.fn((s: string) => s) },
  // Types only — no runtime values needed beyond the parse stub above.
}));

vi.mock("../../hooks/useIdentityClient", () => ({
  useIdentityClient: vi.fn(),
}));

vi.mock("../../lib/retryAsync", () => ({
  // Immediately call the function — no retry delay in tests.
  retryAsync: vi.fn((fn: () => Promise<unknown>) => fn()),
}));

vi.mock("../../lib/explorerUrl", () => ({
  explorerObjectUrl: vi.fn(() => "https://explorer.example.com/obj/0xabc"),
}));

// CopyButton uses navigator.clipboard; stub it so tests don't fail.
Object.defineProperty(navigator, "clipboard", {
  value: { writeText: vi.fn().mockResolvedValue(undefined) },
  writable: true,
  configurable: true,
});

import { useIdentityClient } from "../../hooks/useIdentityClient";

// ── Helpers ───────────────────────────────────────────────────────────────────

const TEST_DID = "did:iota:testnet:0xabc123";

function makeMethod(id: string) {
  return {
    id:   () => ({ toString: () => id }),
    type: () => ({ toString: () => "JsonWebKey2020" }),
  };
}

function makeService(id: string) {
  return {
    id:              () => ({ toString: () => id }),
    type:            () => ["LinkedDomains"],
    serviceEndpoint: () => "https://example.com",
  };
}

function makeDocument({
  deactivated = false,
  methods = [makeMethod(`${TEST_DID}#key-1`)],
  services = [] as ReturnType<typeof makeService>[],
  created = "2024-01-01T00:00:00Z",
} = {}) {
  return {
    metadata: () => ({
      deactivated: () => deactivated,
      created:     () => ({ toString: () => created }),
    }),
    methods:  () => methods,
    service:  () => services,
    toJSON:   () => ({ id: TEST_DID }),
  } as never;
}

function makeProps(overrides: Partial<Parameters<typeof IdentityDashboard>[0]> = {}) {
  return {
    did:     TEST_DID,
    storage: {} as never,
    onClear: vi.fn(),
    ...overrides,
  };
}

const mockResolveDid = vi.fn();

beforeEach(() => {
  vi.mocked(useIdentityClient).mockReturnValue({
    readOnlyClient:       { resolveDid: mockResolveDid } as never,
    createIdentityClient: vi.fn(),
    storage:              {} as never,
    initialising:         false,
    initError:            null,
    isReady:              true,
    isWalletConnected:    true,
  });
  mockResolveDid.mockResolvedValue(makeDocument());
});

// ── DID display ───────────────────────────────────────────────────────────────

describe("IdentityDashboard — DID display", () => {
  it("renders the full DID string", () => {
    render(<IdentityDashboard {...makeProps()} />);
    expect(screen.getByText(TEST_DID)).toBeInTheDocument();
  });

  it("renders a copy button for the DID", () => {
    render(<IdentityDashboard {...makeProps()} />);
    // CopyButton renders a <button> with title "Copy to clipboard"
    expect(screen.getAllByTitle("Copy to clipboard").length).toBeGreaterThanOrEqual(1);
  });

  it("renders a View on Explorer link", () => {
    render(<IdentityDashboard {...makeProps()} />);
    expect(screen.getByRole("link", { name: /view on explorer/i })).toBeInTheDocument();
  });
});

// ── Loading / error states ────────────────────────────────────────────────────

describe("IdentityDashboard — loading and error states", () => {
  it("shows a resolving indicator while loading", () => {
    // Never resolves during this test.
    mockResolveDid.mockReturnValue(new Promise(() => {}));
    render(<IdentityDashboard {...makeProps()} />);
    expect(screen.getByText(/resolving did document/i)).toBeInTheDocument();
  });

  it("shows an error banner when resolution fails", async () => {
    mockResolveDid.mockRejectedValue(new Error("DID not found on this network"));
    render(<IdentityDashboard {...makeProps()} />);
    await waitFor(() =>
      expect(screen.getByText(/did not found on this network/i)).toBeInTheDocument(),
    );
  });
});

// ── Status badge ──────────────────────────────────────────────────────────────

describe("IdentityDashboard — status badge", () => {
  it("shows an Active badge for an active DID document", async () => {
    render(<IdentityDashboard {...makeProps()} />);
    await waitFor(() =>
      expect(screen.getByText("Active")).toBeInTheDocument(),
    );
  });

  it("shows a Deactivated badge for a deactivated DID document", async () => {
    mockResolveDid.mockResolvedValue(makeDocument({ deactivated: true }));
    render(<IdentityDashboard {...makeProps()} />);
    await waitFor(() =>
      expect(screen.getByText("Deactivated")).toBeInTheDocument(),
    );
  });
});

// ── Verification methods ──────────────────────────────────────────────────────

describe("IdentityDashboard — verification methods", () => {
  it("renders each verification method ID with a copy button", async () => {
    const doc = makeDocument({
      methods: [
        makeMethod(`${TEST_DID}#key-1`),
        makeMethod(`${TEST_DID}#key-2`),
      ],
    });
    mockResolveDid.mockResolvedValue(doc);
    render(<IdentityDashboard {...makeProps()} />);
    await waitFor(() =>
      expect(screen.getByText(`${TEST_DID}#key-1`)).toBeInTheDocument(),
    );
    expect(screen.getByText(`${TEST_DID}#key-2`)).toBeInTheDocument();
    // Each method gets its own copy button + the DID badge copy button = 3 total.
    expect(screen.getAllByTitle("Copy to clipboard")).toHaveLength(3);
  });
});

// ── Update / Reactivate button ────────────────────────────────────────────────

describe("IdentityDashboard — Update / Reactivate button", () => {
  it("shows 'Update Identity' for an active DID", async () => {
    render(<IdentityDashboard {...makeProps()} />);
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /update identity/i })).toBeInTheDocument(),
    );
  });

  it("shows 'Reactivate Identity' for a deactivated DID", async () => {
    mockResolveDid.mockResolvedValue(makeDocument({ deactivated: true }));
    render(<IdentityDashboard {...makeProps()} />);
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /reactivate identity/i })).toBeInTheDocument(),
    );
  });

  it("toggles the UpdateIdentity panel open and closed", async () => {
    render(<IdentityDashboard {...makeProps()} />);
    const updateBtn = await screen.findByRole("button", { name: /update identity/i });
    fireEvent.click(updateBtn);
    // UpdateIdentity mounts — it renders "Update Identity" as a heading.
    await waitFor(() =>
      expect(screen.getByRole("heading", { name: /update identity/i })).toBeInTheDocument(),
    );
    fireEvent.click(screen.getByRole("button", { name: /cancel/i }));
    await waitFor(() =>
      expect(screen.queryByRole("heading", { name: /update identity/i })).not.toBeInTheDocument(),
    );
  });
});

// ── Forget button ─────────────────────────────────────────────────────────────

describe("IdentityDashboard — Forget button", () => {
  it("renders a Forget button", () => {
    render(<IdentityDashboard {...makeProps()} />);
    expect(screen.getByRole("button", { name: /forget/i })).toBeInTheDocument();
  });

  it("calls onClear when Forget is clicked", () => {
    const onClear = vi.fn();
    render(<IdentityDashboard {...makeProps({ onClear })} />);
    fireEvent.click(screen.getByRole("button", { name: /forget/i }));
    expect(onClear).toHaveBeenCalledTimes(1);
  });
});

// ── Raw JSON toggle ───────────────────────────────────────────────────────────

describe("IdentityDashboard — raw JSON toggle", () => {
  it("shows raw JSON when the toggle is clicked", async () => {
    render(<IdentityDashboard {...makeProps()} />);
    const toggle = await screen.findByRole("button", { name: /show raw json/i });
    fireEvent.click(toggle);
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /hide raw json/i })).toBeInTheDocument(),
    );
  });
});
