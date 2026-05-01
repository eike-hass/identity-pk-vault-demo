import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { IdentityDashboard } from "../../components/IdentityDashboard";

// ── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock("@iota/identity-wasm/web", () => ({
  IotaDID: {
    parse: vi.fn((s: string) => ({
      toString:   () => s,
      toObjectID: () => "obj-0xabc123",
      join:       (f: string) => `${s}${f}`,
    })),
  },
  DIDUrl:       { parse: vi.fn((s: string) => s) },
  JwkMemStore:  { ed25519KeyType: vi.fn(() => "Ed25519") },
  MethodScope:  { VerificationMethod: vi.fn(() => ({})) },
  Service:      vi.fn((data: unknown) => data),
}));

vi.mock("../../hooks/useIdentityClient", () => ({
  useIdentityClient: vi.fn(),
}));

vi.mock("../../lib/retryAsync", () => ({
  retryAsync: vi.fn((fn: () => Promise<unknown>) => fn()),
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
  created     = "2024-01-01T00:00:00Z",
} = {}) {
  return {
    metadata: () => ({
      deactivated: () => deactivated,
      created:     () => ({ toString: () => created }),
    }),
    methods:               () => methods,
    service:               () => services,
    toJSON:                () => ({ id: TEST_DID }),
    generateMethod:        vi.fn().mockResolvedValue(undefined),
    purgeMethod:           vi.fn().mockResolvedValue(undefined),
    removeMethod:          vi.fn(),
    insertService:         vi.fn(),
    removeService:         vi.fn(),
    setMetadataDeactivated: vi.fn(),
  } as any;
}

function makeProps(overrides: Partial<Parameters<typeof IdentityDashboard>[0]> = {}) {
  return {
    did:     TEST_DID,
    storage: {} as never,
    onClear: vi.fn(),
    ...overrides,
  };
}

function makeOnChainIdentity() {
  const buildAndExecute = vi.fn().mockResolvedValue(undefined);
  const builder = { buildAndExecute };
  return {
    getControllerToken: vi.fn().mockResolvedValue("token"),
    updateDidDocument:  vi.fn().mockReturnValue(builder),
    deactivateDid:      vi.fn().mockReturnValue(builder),
    deleteDid:          vi.fn().mockReturnValue(builder),
  };
}

const mockResolveDid = vi.fn();

beforeEach(() => {
  mockResolveDid.mockClear();
  mockResolveDid.mockResolvedValue(makeDocument());

  vi.mocked(useIdentityClient).mockReturnValue({
    readOnlyClient: { resolveDid: mockResolveDid } as never,
    createIdentityClient: vi.fn().mockResolvedValue({
      getIdentity: vi.fn().mockResolvedValue({ toFullFledged: () => makeOnChainIdentity() }),
      resolveDid:  vi.fn().mockResolvedValue(makeDocument()),
    }),
    storage:           {} as never,
    initialising:      false,
    initError:         null,
    isReady:           true,
    isWalletConnected: true,
  });
});

// ── DID display ───────────────────────────────────────────────────────────────

describe("IdentityDashboard — DID display", () => {
  it("renders the full DID string", () => {
    render(<IdentityDashboard {...makeProps()} />);
    expect(screen.getByText(TEST_DID)).toBeInTheDocument();
  });

  it("renders a copy button for the DID", () => {
    render(<IdentityDashboard {...makeProps()} />);
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
  it("renders each verification method ID", async () => {
    mockResolveDid.mockResolvedValue(makeDocument({
      methods: [
        makeMethod(`${TEST_DID}#key-1`),
        makeMethod(`${TEST_DID}#key-2`),
      ],
    }));
    render(<IdentityDashboard {...makeProps()} />);
    await waitFor(() =>
      expect(screen.getByText(`${TEST_DID}#key-1`)).toBeInTheDocument(),
    );
    expect(screen.getByText(`${TEST_DID}#key-2`)).toBeInTheDocument();
  });

  it("does not show a trash button when the document has only one method", async () => {
    render(<IdentityDashboard {...makeProps()} />);
    await waitFor(() =>
      expect(screen.getByText(`${TEST_DID}#key-1`)).toBeInTheDocument(),
    );
    expect(screen.queryByTitle("Remove key")).not.toBeInTheDocument();
  });

  it("shows trash buttons when the document has multiple methods", async () => {
    mockResolveDid.mockResolvedValue(makeDocument({
      methods: [
        makeMethod(`${TEST_DID}#key-1`),
        makeMethod(`${TEST_DID}#key-2`),
      ],
    }));
    render(<IdentityDashboard {...makeProps()} />);
    await waitFor(() =>
      expect(screen.getAllByTitle("Remove key")).toHaveLength(2),
    );
  });

  it("clicking a trash button calls purgeMethod and publishes the update", async () => {
    const twoMethodDoc = makeDocument({
      methods: [makeMethod(`${TEST_DID}#key-1`), makeMethod(`${TEST_DID}#key-2`)],
    });
    mockResolveDid.mockResolvedValue(twoMethodDoc);
    vi.mocked(useIdentityClient).mockReturnValue({
      readOnlyClient:       { resolveDid: mockResolveDid } as never,
      createIdentityClient: vi.fn().mockResolvedValue({
        getIdentity: vi.fn().mockResolvedValue({ toFullFledged: () => makeOnChainIdentity() }),
        resolveDid:  vi.fn().mockResolvedValue(twoMethodDoc),
      }),
      storage:              {} as never,
      initialising:         false,
      initError:            null,
      isReady:              true,
      isWalletConnected:    true,
    });

    render(<IdentityDashboard {...makeProps()} />);
    const [firstTrash] = await screen.findAllByTitle("Remove key");
    fireEvent.click(firstTrash);
    await waitFor(() => expect(twoMethodDoc.purgeMethod).toHaveBeenCalledTimes(1));
  });

  it("falls back to removeMethod when purgeMethod throws a key-id storage error", async () => {
    const twoMethodDoc = makeDocument({
      methods: [makeMethod(`${TEST_DID}#key-1`), makeMethod(`${TEST_DID}#key-2`)],
    });
    twoMethodDoc.purgeMethod = vi.fn().mockRejectedValue(
      new Error("key id storage error: key id storage operation failed"),
    );
    twoMethodDoc.removeMethod = vi.fn();

    mockResolveDid.mockResolvedValue(twoMethodDoc);
    vi.mocked(useIdentityClient).mockReturnValue({
      readOnlyClient:       { resolveDid: mockResolveDid } as never,
      createIdentityClient: vi.fn().mockResolvedValue({
        getIdentity: vi.fn().mockResolvedValue({ toFullFledged: () => makeOnChainIdentity() }),
        resolveDid:  vi.fn().mockResolvedValue(twoMethodDoc),
      }),
      storage:              {} as never,
      initialising:         false,
      initError:            null,
      isReady:              true,
      isWalletConnected:    true,
    });

    render(<IdentityDashboard {...makeProps()} />);
    const [firstTrash] = await screen.findAllByTitle("Remove key");
    fireEvent.click(firstTrash);
    await waitFor(() => expect(twoMethodDoc.removeMethod).toHaveBeenCalledTimes(1));
    expect(screen.queryByText(/key id storage/i)).not.toBeInTheDocument();
  });
});

// ── Add verification key inline form ─────────────────────────────────────────

describe("IdentityDashboard — add verification key form", () => {
  it("shows the Add verification key button once the document loads", async () => {
    render(<IdentityDashboard {...makeProps()} />);
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /add verification key/i })).toBeInTheDocument(),
    );
  });

  it("clicking Add verification key reveals the inline form", async () => {
    render(<IdentityDashboard {...makeProps()} />);
    fireEvent.click(await screen.findByRole("button", { name: /add verification key/i }));
    expect(screen.getByText("Add Verification Key")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("#key-2")).toBeInTheDocument();
  });

  it("closing the add key form with ✕ hides it", async () => {
    render(<IdentityDashboard {...makeProps()} />);
    fireEvent.click(await screen.findByRole("button", { name: /add verification key/i }));
    fireEvent.click(screen.getByText("✕"));
    await waitFor(() =>
      expect(screen.queryByText("Add Verification Key")).not.toBeInTheDocument(),
    );
  });

  it("submitting the form calls createIdentityClient", async () => {
    const createIdentityClient = vi.fn().mockResolvedValue({
      getIdentity: vi.fn().mockResolvedValue({ toFullFledged: () => makeOnChainIdentity() }),
      resolveDid:  vi.fn().mockResolvedValue(makeDocument()),
    });
    vi.mocked(useIdentityClient).mockReturnValue({
      readOnlyClient:       { resolveDid: mockResolveDid } as never,
      createIdentityClient,
      storage:              {} as never,
      initialising:         false,
      initError:            null,
      isReady:              true,
      isWalletConnected:    true,
    });

    render(<IdentityDashboard {...makeProps()} />);
    fireEvent.click(await screen.findByRole("button", { name: /add verification key/i }));
    fireEvent.click(screen.getByRole("button", { name: /^add key$/i }));
    await waitFor(() => expect(createIdentityClient).toHaveBeenCalledTimes(1));
  });
});

// ── Services ──────────────────────────────────────────────────────────────────

describe("IdentityDashboard — services", () => {
  it("renders each service ID and endpoint", async () => {
    mockResolveDid.mockResolvedValue(makeDocument({
      services: [makeService(`${TEST_DID}#svc-1`)],
    }));
    render(<IdentityDashboard {...makeProps()} />);
    await waitFor(() =>
      expect(screen.getByText(`${TEST_DID}#svc-1`)).toBeInTheDocument(),
    );
    expect(screen.getByText(/endpoint: https:\/\/example\.com/i)).toBeInTheDocument();
  });

  it("shows a trash button for each service", async () => {
    mockResolveDid.mockResolvedValue(makeDocument({
      services: [makeService(`${TEST_DID}#svc-1`)],
    }));
    render(<IdentityDashboard {...makeProps()} />);
    await waitFor(() =>
      expect(screen.getByTitle("Remove service")).toBeInTheDocument(),
    );
  });

  it("shows the Add service endpoint button", async () => {
    render(<IdentityDashboard {...makeProps()} />);
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /add service endpoint/i })).toBeInTheDocument(),
    );
  });
});

// ── Add service endpoint inline form ─────────────────────────────────────────

describe("IdentityDashboard — add service endpoint form", () => {
  it("clicking Add service endpoint reveals the inline form", async () => {
    render(<IdentityDashboard {...makeProps()} />);
    fireEvent.click(await screen.findByRole("button", { name: /add service endpoint/i }));
    expect(screen.getByText("Add Service Endpoint")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("#linked-domain")).toBeInTheDocument();
  });

  it("closing the add service form with ✕ hides it", async () => {
    render(<IdentityDashboard {...makeProps()} />);
    fireEvent.click(await screen.findByRole("button", { name: /add service endpoint/i }));
    fireEvent.click(screen.getByText("✕"));
    await waitFor(() =>
      expect(screen.queryByText("Add Service Endpoint")).not.toBeInTheDocument(),
    );
  });
});

// ── Danger Zone accordion ─────────────────────────────────────────────────────

describe("IdentityDashboard — Danger Zone", () => {
  it("shows the Danger Zone label after document loads", async () => {
    render(<IdentityDashboard {...makeProps()} />);
    await waitFor(() =>
      expect(screen.getByText(/danger zone/i)).toBeInTheDocument(),
    );
  });

  it("shows 'Deactivate Identity' row for an active DID", async () => {
    render(<IdentityDashboard {...makeProps()} />);
    await waitFor(() =>
      expect(screen.getByText("Deactivate Identity")).toBeInTheDocument(),
    );
  });

  it("shows 'Reactivate Identity' row for a deactivated DID", async () => {
    mockResolveDid.mockResolvedValue(makeDocument({ deactivated: true }));
    render(<IdentityDashboard {...makeProps()} />);
    await waitFor(() =>
      expect(screen.getByText("Reactivate Identity")).toBeInTheDocument(),
    );
  });

  it("shows 'Delete Identity' row always", async () => {
    render(<IdentityDashboard {...makeProps()} />);
    await waitFor(() =>
      expect(screen.getByText("Delete Identity")).toBeInTheDocument(),
    );
  });

  it("clicking the Deactivate row opens its accordion panel", async () => {
    render(<IdentityDashboard {...makeProps()} />);
    fireEvent.click((await screen.findByText("Deactivate Identity")).closest("button")!);
    await waitFor(() =>
      expect(screen.getByText(/i understand this will deactivate the did/i)).toBeInTheDocument(),
    );
  });

  it("Deactivate DID button is disabled until the confirmation checkbox is checked", async () => {
    render(<IdentityDashboard {...makeProps()} />);
    fireEvent.click((await screen.findByText("Deactivate Identity")).closest("button")!);
    const deactivateBtn = await screen.findByRole("button", { name: /deactivate did/i });
    expect(deactivateBtn).toBeDisabled();
    fireEvent.click(screen.getByRole("checkbox"));
    expect(deactivateBtn).not.toBeDisabled();
  });

  it("clicking the Delete row opens its accordion panel", async () => {
    render(<IdentityDashboard {...makeProps()} />);
    fireEvent.click((await screen.findByText("Delete Identity")).closest("button")!);
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /permanently delete did/i })).toBeInTheDocument(),
    );
  });

  it("Delete DID button is disabled until both confirmation checkboxes are checked", async () => {
    render(<IdentityDashboard {...makeProps()} />);
    fireEvent.click((await screen.findByText("Delete Identity")).closest("button")!);
    const deleteBtn = await screen.findByRole("button", { name: /permanently delete did/i });
    expect(deleteBtn).toBeDisabled();
    const checkboxes = await screen.findAllByRole("checkbox");
    fireEvent.click(checkboxes[0]);
    expect(deleteBtn).toBeDisabled();
    fireEvent.click(checkboxes[1]);
    expect(deleteBtn).not.toBeDisabled();
  });

  it("opening one panel closes the other and resets checkboxes", async () => {
    render(<IdentityDashboard {...makeProps()} />);
    // Open the deactivate panel and check its checkbox.
    fireEvent.click((await screen.findByText("Deactivate Identity")).closest("button")!);
    const checkbox = await screen.findByRole("checkbox");
    fireEvent.click(checkbox);
    expect(checkbox).toBeChecked();
    // Switch to the delete panel — deactivate content should disappear.
    fireEvent.click(screen.getByText("Delete Identity").closest("button")!);
    await waitFor(() =>
      expect(screen.queryByText(/i understand this will deactivate/i)).not.toBeInTheDocument(),
    );
    // Delete checkboxes should start unchecked.
    const deleteCheckboxes = await screen.findAllByRole("checkbox");
    deleteCheckboxes.forEach((cb) => expect(cb).not.toBeChecked());
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
