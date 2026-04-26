import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { ResolveIdentity } from "../../components/ResolveIdentity";

// ── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock("@iota/identity-wasm/web", () => ({
  IotaDID: { parse: vi.fn((s: string) => s) },
}));

vi.mock("../../hooks/useIdentityClient", () => ({
  useIdentityClient: vi.fn(),
}));

vi.mock("../../lib/explorerUrl", () => ({
  explorerObjectUrl: vi.fn(() => "https://explorer.example.com/obj/0xabc"),
}));

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
  methods     = [makeMethod(`${TEST_DID}#key-1`)],
  services    = [] as ReturnType<typeof makeService>[],
} = {}) {
  return {
    metadata: () => ({
      deactivated: () => deactivated,
      created:     () => ({ toString: () => "2024-01-01T00:00:00Z" }),
      updated:     () => undefined,
    }),
    id: () => ({
      toString: () => TEST_DID,
      tag:      () => "0xabc123",
      network:  () => "testnet",
    }),
    methods: () => methods,
    service: () => services,
    toJSON:  () => ({ id: TEST_DID }),
  } as never;
}

const mockResolveDid = vi.fn();

beforeEach(() => {
  mockResolveDid.mockClear();
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

// ── Input and button states ───────────────────────────────────────────────────

describe("ResolveIdentity — input and button states", () => {
  it("renders a DID input with the correct placeholder", () => {
    render(<ResolveIdentity />);
    expect(screen.getByPlaceholderText("did:iota:testnet:0x…")).toBeInTheDocument();
  });

  it("Resolve button is disabled when the input is empty", () => {
    render(<ResolveIdentity />);
    expect(screen.getByRole("button", { name: /^resolve$/i })).toBeDisabled();
  });

  it("Resolve button is disabled when the client is not ready", () => {
    vi.mocked(useIdentityClient).mockReturnValue({
      readOnlyClient:       {} as never,
      createIdentityClient: vi.fn(),
      storage:              {} as never,
      initialising:         true,
      initError:            null,
      isReady:              false,
      isWalletConnected:    false,
    });
    render(<ResolveIdentity />);
    fireEvent.change(screen.getByPlaceholderText("did:iota:testnet:0x…"), {
      target: { value: TEST_DID },
    });
    expect(screen.getByRole("button", { name: /^resolve$/i })).toBeDisabled();
  });

  it("Resolve button is enabled when input is non-empty and client is ready", () => {
    render(<ResolveIdentity />);
    fireEvent.change(screen.getByPlaceholderText("did:iota:testnet:0x…"), {
      target: { value: TEST_DID },
    });
    expect(screen.getByRole("button", { name: /^resolve$/i })).not.toBeDisabled();
  });
});

// ── Loading state ─────────────────────────────────────────────────────────────

describe("ResolveIdentity — loading state", () => {
  it("shows a Resolving… indicator while the request is in flight", () => {
    mockResolveDid.mockReturnValue(new Promise(() => {}));
    render(<ResolveIdentity />);
    fireEvent.change(screen.getByPlaceholderText("did:iota:testnet:0x…"), {
      target: { value: TEST_DID },
    });
    fireEvent.click(screen.getByRole("button", { name: /^resolve$/i }));
    expect(screen.getByText(/resolving/i)).toBeInTheDocument();
  });
});

// ── Error states ──────────────────────────────────────────────────────────────

describe("ResolveIdentity — error states", () => {
  async function triggerResolve() {
    fireEvent.change(screen.getByPlaceholderText("did:iota:testnet:0x…"), {
      target: { value: TEST_DID },
    });
    fireEvent.click(screen.getByRole("button", { name: /^resolve$/i }));
  }

  it("shows a 'not found' message when the error contains 'not found'", async () => {
    mockResolveDid.mockRejectedValue(new Error("DID not found on network"));
    render(<ResolveIdentity />);
    await triggerResolve();
    await waitFor(() =>
      expect(screen.getByText(/not found or has been deleted/i)).toBeInTheDocument(),
    );
  });

  it("shows a 'not found' message when the error contains 'deleted'", async () => {
    mockResolveDid.mockRejectedValue(new Error("object deleted from ledger"));
    render(<ResolveIdentity />);
    await triggerResolve();
    await waitFor(() =>
      expect(screen.getByText(/not found or has been deleted/i)).toBeInTheDocument(),
    );
  });

  it("shows the raw error message for other failures", async () => {
    mockResolveDid.mockRejectedValue(new Error("Network timeout"));
    render(<ResolveIdentity />);
    await triggerResolve();
    await waitFor(() =>
      expect(screen.getByText(/network timeout/i)).toBeInTheDocument(),
    );
  });
});

// ── Document display ──────────────────────────────────────────────────────────

describe("ResolveIdentity — document display", () => {
  async function resolveDoc() {
    render(<ResolveIdentity />);
    fireEvent.change(screen.getByPlaceholderText("did:iota:testnet:0x…"), {
      target: { value: TEST_DID },
    });
    fireEvent.click(screen.getByRole("button", { name: /^resolve$/i }));
    await waitFor(() => expect(screen.getByText("Active")).toBeInTheDocument());
  }

  it("shows an Active badge for an active DID", async () => {
    await resolveDoc();
    expect(screen.getByText("Active")).toBeInTheDocument();
  });

  it("shows a Deactivated badge for a deactivated DID", async () => {
    mockResolveDid.mockResolvedValue(makeDocument({ deactivated: true }));
    render(<ResolveIdentity />);
    fireEvent.change(screen.getByPlaceholderText("did:iota:testnet:0x…"), {
      target: { value: TEST_DID },
    });
    fireEvent.click(screen.getByRole("button", { name: /^resolve$/i }));
    await waitFor(() => expect(screen.getByText("Deactivated")).toBeInTheDocument());
  });

  it("shows the resolved DID string with a copy button", async () => {
    await resolveDoc();
    expect(screen.getByText(TEST_DID)).toBeInTheDocument();
    expect(screen.getAllByTitle("Copy to clipboard").length).toBeGreaterThanOrEqual(1);
  });

  it("shows a View on Explorer link", async () => {
    await resolveDoc();
    expect(screen.getByRole("link", { name: /view on explorer/i })).toBeInTheDocument();
  });

  it("shows each verification method ID with a copy button", async () => {
    mockResolveDid.mockResolvedValue(
      makeDocument({
        methods: [
          makeMethod(`${TEST_DID}#key-1`),
          makeMethod(`${TEST_DID}#key-2`),
        ],
      }),
    );
    render(<ResolveIdentity />);
    fireEvent.change(screen.getByPlaceholderText("did:iota:testnet:0x…"), {
      target: { value: TEST_DID },
    });
    fireEvent.click(screen.getByRole("button", { name: /^resolve$/i }));
    await waitFor(() =>
      expect(screen.getByText(`${TEST_DID}#key-1`)).toBeInTheDocument(),
    );
    expect(screen.getByText(`${TEST_DID}#key-2`)).toBeInTheDocument();
  });

  it("shows 'No verification methods' when the document has none", async () => {
    mockResolveDid.mockResolvedValue(makeDocument({ methods: [] }));
    render(<ResolveIdentity />);
    fireEvent.change(screen.getByPlaceholderText("did:iota:testnet:0x…"), {
      target: { value: TEST_DID },
    });
    fireEvent.click(screen.getByRole("button", { name: /^resolve$/i }));
    await waitFor(() =>
      expect(screen.getByText(/no verification methods/i)).toBeInTheDocument(),
    );
  });

  it("shows each service ID and endpoint", async () => {
    mockResolveDid.mockResolvedValue(
      makeDocument({ services: [makeService(`${TEST_DID}#svc-1`)] }),
    );
    render(<ResolveIdentity />);
    fireEvent.change(screen.getByPlaceholderText("did:iota:testnet:0x…"), {
      target: { value: TEST_DID },
    });
    fireEvent.click(screen.getByRole("button", { name: /^resolve$/i }));
    await waitFor(() =>
      expect(screen.getByText(`${TEST_DID}#svc-1`)).toBeInTheDocument(),
    );
    expect(screen.getByText("Endpoint: https://example.com")).toBeInTheDocument();
  });

  it("shows 'No services' when the document has none", async () => {
    await resolveDoc();
    expect(screen.getByText(/no services/i)).toBeInTheDocument();
  });
});

// ── Raw JSON toggle ───────────────────────────────────────────────────────────

describe("ResolveIdentity — raw JSON toggle", () => {
  it("shows and hides the raw JSON document on toggle", async () => {
    render(<ResolveIdentity />);
    fireEvent.change(screen.getByPlaceholderText("did:iota:testnet:0x…"), {
      target: { value: TEST_DID },
    });
    fireEvent.click(screen.getByRole("button", { name: /^resolve$/i }));

    const showBtn = await screen.findByRole("button", { name: /show raw json/i });
    fireEvent.click(showBtn);
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /hide raw json/i })).toBeInTheDocument(),
    );

    fireEvent.click(screen.getByRole("button", { name: /hide raw json/i }));
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /show raw json/i })).toBeInTheDocument(),
    );
  });
});

// ── Enter key trigger ─────────────────────────────────────────────────────────

describe("ResolveIdentity — Enter key trigger", () => {
  it("pressing Enter in the input triggers resolution", async () => {
    render(<ResolveIdentity />);
    const input = screen.getByPlaceholderText("did:iota:testnet:0x…");
    fireEvent.change(input, { target: { value: TEST_DID } });
    fireEvent.keyDown(input, { key: "Enter" });
    await waitFor(() => expect(mockResolveDid).toHaveBeenCalledTimes(1));
  });

  it("pressing Enter on an empty input does not call resolveDid", () => {
    render(<ResolveIdentity />);
    const input = screen.getByPlaceholderText("did:iota:testnet:0x…");
    fireEvent.keyDown(input, { key: "Enter" });
    expect(mockResolveDid).not.toHaveBeenCalled();
  });
});
