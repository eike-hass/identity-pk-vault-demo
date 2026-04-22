import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { UpdateIdentity } from "../../components/UpdateIdentity";

// ── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock("@iota/identity-wasm/web", () => ({
  DIDUrl:       { parse: vi.fn((s: string) => s) },
  IotaDID:      { parse: vi.fn((s: string) => ({ toObjectID: () => s, join: (x: string) => s + x })) },
  JwkMemStore:  { ed25519KeyType: vi.fn(() => "Ed25519") },
  MethodScope:  { VerificationMethod: vi.fn(() => ({})) },
  Service:      vi.fn(),
  Storage:      vi.fn(),
}));

vi.mock("../../hooks/useIdentityClient", () => ({
  useIdentityClient: vi.fn(),
}));

import { useIdentityClient } from "../../hooks/useIdentityClient";

// ── Test helpers ──────────────────────────────────────────────────────────────

function makeMethod(id: string) {
  return {
    id:   () => ({ toString: () => id }),
    type: () => ({ toString: () => "JsonWebKey2020" }),
  };
}

function makeService(id: string, types = ["LinkedDomains"]) {
  return {
    id:              () => ({ toString: () => id }),
    type:            () => types,
    serviceEndpoint: () => "https://example.com",
  };
}

function makeDocument({
  deactivated = false,
  methods = [makeMethod("did:iota:testnet:0xabc#key-1")],
  services = [] as ReturnType<typeof makeService>[],
} = {}) {
  return {
    metadata: () => ({ deactivated: () => deactivated }),
    methods:  () => methods,
    service:  () => services,
  } as never;
}

/** Builds the full async chain returned by createIdentityClient(). */
function makeIdentityClient() {
  const buildAndExecute = vi.fn().mockResolvedValue(undefined);
  const proposal = { buildAndExecute };

  const onChainIdentity = {
    getControllerToken:  vi.fn().mockResolvedValue({}),
    updateDidDocument:   vi.fn().mockReturnValue(proposal),
    deactivateDid:       vi.fn().mockReturnValue(proposal),
    deleteDid:           vi.fn().mockReturnValue(proposal),
  };

  const freshDoc = {
    generateMethod:        vi.fn().mockResolvedValue(undefined),
    insertService:         vi.fn(),
    removeService:         vi.fn(),
    purgeMethod:           vi.fn().mockResolvedValue(undefined),
    setMetadataDeactivated: vi.fn(),
  };

  return {
    client: {
      resolveDid:  vi.fn().mockResolvedValue(freshDoc),
      getIdentity: vi.fn().mockResolvedValue({ toFullFledged: () => onChainIdentity }),
    },
    onChainIdentity,
    freshDoc,
    proposal,
  };
}

function makeProps(
  overrides: Partial<Parameters<typeof UpdateIdentity>[0]> = {},
) {
  return {
    did:       "did:iota:testnet:0xabc",
    document:  makeDocument(),
    storage:   {} as never,
    onUpdated: vi.fn(),
    onDeleted: vi.fn(),
    ...overrides,
  };
}

beforeEach(() => {
  vi.mocked(useIdentityClient).mockReturnValue({
    readOnlyClient:        {} as never,
    createIdentityClient:  vi.fn(),
    storage:               {} as never,
    initialising:          false,
    initError:             null,
    isReady:               true,
    isWalletConnected:     true,
  });
});

// ── Tab rendering ─────────────────────────────────────────────────────────────

describe("UpdateIdentity — tab rendering", () => {
  it("shows all 6 tabs for an active DID", () => {
    render(<UpdateIdentity {...makeProps()} />);
    // Default mode is "add-key" so "Add Key" appears as both tab and submit button.
    expect(screen.getAllByRole("button", { name: "Add Key" }).length).toBeGreaterThanOrEqual(1);
    // These tabs have no same-name submit button in the default mode — safe to use getBy.
    expect(screen.getByRole("button", { name: "Add Service" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Remove Key" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Remove Service" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Deactivate" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Delete" })).toBeInTheDocument();
  });

  it("shows only Reactivate and Delete tabs for a deactivated DID", () => {
    render(<UpdateIdentity {...makeProps({ document: makeDocument({ deactivated: true }) })} />);
    expect(screen.getByRole("button", { name: "Reactivate" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Delete" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Add Key" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Deactivate" })).not.toBeInTheDocument();
  });
});

// ── Add Key tab ───────────────────────────────────────────────────────────────

describe("UpdateIdentity — Add Key tab", () => {
  it("shows a fragment input with a default #key-N value", () => {
    render(<UpdateIdentity {...makeProps()} />);
    const input = screen.getByPlaceholderText("#key-2");
    expect(input).toBeInTheDocument();
    expect((input as HTMLInputElement).value).toMatch(/^#key-/);
  });

  it("auto-suggests the next unused fragment based on existing methods", () => {
    const doc = makeDocument({
      methods: [
        makeMethod("did:iota:testnet:0xabc#key-1"),
        makeMethod("did:iota:testnet:0xabc#key-2"),
      ],
    });
    render(<UpdateIdentity {...makeProps({ document: doc })} />);
    const input = screen.getByPlaceholderText("#key-2") as HTMLInputElement;
    expect(input.value).toBe("#key-3");
  });

  it("Add Key submit button is enabled when fragment starts with #", () => {
    render(<UpdateIdentity {...makeProps()} />);
    // Multiple "Add Key" buttons exist (tab + submit); the submit is the last one.
    const buttons = screen.getAllByRole("button", { name: "Add Key" });
    expect(buttons[buttons.length - 1]).not.toBeDisabled();
  });

  it("Add Key submit button is disabled when fragment does not start with #", () => {
    render(<UpdateIdentity {...makeProps()} />);
    fireEvent.change(screen.getByPlaceholderText("#key-2"), { target: { value: "key-2" } });
    // The submit button (last "Add Key" in DOM) should be disabled
    const buttons = screen.getAllByRole("button", { name: /add key/i });
    const submitBtn = buttons[buttons.length - 1];
    expect(submitBtn).toBeDisabled();
  });

  it("calls onUpdated after a successful Add Key submission", async () => {
    const { client } = makeIdentityClient();
    const createIdentityClient = vi.fn().mockResolvedValue(client);
    vi.mocked(useIdentityClient).mockReturnValue({
      readOnlyClient: {} as never,
      createIdentityClient,
      storage: {} as never,
      initialising: false,
      initError: null,
      isReady: true,
      isWalletConnected: true,
    });
    const onUpdated = vi.fn();
    render(<UpdateIdentity {...makeProps({ onUpdated })} />);
    // submit buttons are the last button with that name
    const buttons = screen.getAllByRole("button", { name: /add key/i });
    fireEvent.click(buttons[buttons.length - 1]);
    await waitFor(() => expect(onUpdated).toHaveBeenCalledTimes(1));
  });
});

// ── Remove Key tab ────────────────────────────────────────────────────────────

describe("UpdateIdentity — Remove Key tab", () => {
  it("shows a method dropdown when multiple methods exist", () => {
    const doc = makeDocument({
      methods: [
        makeMethod("did:iota:testnet:0xabc#key-1"),
        makeMethod("did:iota:testnet:0xabc#key-2"),
      ],
    });
    render(<UpdateIdentity {...makeProps({ document: doc })} />);
    // Exactly one "Remove Key" button before clicking (the tab).
    fireEvent.click(screen.getByRole("button", { name: "Remove Key" }));
    expect(screen.getByRole("combobox")).toBeInTheDocument();
    // Now tab + submit button both exist.
    expect(screen.getAllByRole("button", { name: "Remove Key" }).length).toBe(2);
  });

  it("shows a warning and no submit button when only 1 method exists", () => {
    render(<UpdateIdentity {...makeProps()} />);
    fireEvent.click(screen.getByRole("button", { name: "Remove Key" }));
    expect(screen.getByText(/only verification method/i)).toBeInTheDocument();
    // No Remove Key submit button — only the tab button remains
    const buttons = screen.getAllByRole("button", { name: /remove key/i });
    expect(buttons).toHaveLength(1); // just the tab
  });

  it("calls onUpdated after a successful Remove Key submission", async () => {
    const { client } = makeIdentityClient();
    const createIdentityClient = vi.fn().mockResolvedValue(client);
    vi.mocked(useIdentityClient).mockReturnValue({
      readOnlyClient: {} as never,
      createIdentityClient,
      storage: {} as never,
      initialising: false,
      initError: null,
      isReady: true,
      isWalletConnected: true,
    });
    const doc = makeDocument({
      methods: [
        makeMethod("did:iota:testnet:0xabc#key-1"),
        makeMethod("did:iota:testnet:0xabc#key-2"),
      ],
    });
    const onUpdated = vi.fn();
    render(<UpdateIdentity {...makeProps({ document: doc, onUpdated })} />);
    fireEvent.click(screen.getByRole("button", { name: "Remove Key" }));
    const buttons = screen.getAllByRole("button", { name: /remove key/i });
    fireEvent.click(buttons[buttons.length - 1]);
    await waitFor(() => expect(onUpdated).toHaveBeenCalledTimes(1));
  });
});

// ── Add Service tab ───────────────────────────────────────────────────────────

describe("UpdateIdentity — Add Service tab", () => {
  it("shows service fragment, type, and endpoint inputs", () => {
    render(<UpdateIdentity {...makeProps()} />);
    fireEvent.click(screen.getByRole("button", { name: "Add Service" }));
    expect(screen.getByPlaceholderText("#linked-domain")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("LinkedDomains")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("https://example.com")).toBeInTheDocument();
  });
});

// ── Remove Service tab ────────────────────────────────────────────────────────

describe("UpdateIdentity — Remove Service tab", () => {
  it("shows a warning message and no submit button when no services exist", () => {
    render(<UpdateIdentity {...makeProps()} />);
    fireEvent.click(screen.getByRole("button", { name: "Remove Service" }));
    expect(screen.getByText(/no services to remove/i)).toBeInTheDocument();
    // Only the tab button remains — no submit.
    expect(screen.getAllByRole("button", { name: /remove service/i })).toHaveLength(1);
  });

  it("shows a service dropdown when services exist", () => {
    const doc = makeDocument({ services: [makeService("did:iota:testnet:0xabc#svc-1")] });
    render(<UpdateIdentity {...makeProps({ document: doc })} />);
    fireEvent.click(screen.getByRole("button", { name: "Remove Service" }));
    expect(screen.getByRole("combobox")).toBeInTheDocument();
    // Tab + submit = 2.
    expect(screen.getAllByRole("button", { name: "Remove Service" }).length).toBe(2);
  });
});

// ── Deactivate tab ────────────────────────────────────────────────────────────

describe("UpdateIdentity — Deactivate tab", () => {
  it("shows a deactivation warning and a disabled button before confirmation", () => {
    render(<UpdateIdentity {...makeProps()} />);
    fireEvent.click(screen.getByRole("button", { name: "Deactivate" }));
    expect(screen.getByText(/deactivate the did/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /deactivate did/i })).toBeDisabled();
  });

  it("enables the Deactivate button after checking the confirmation checkbox", () => {
    render(<UpdateIdentity {...makeProps()} />);
    fireEvent.click(screen.getByRole("button", { name: "Deactivate" }));
    fireEvent.click(screen.getByRole("checkbox"));
    expect(screen.getByRole("button", { name: /deactivate did/i })).not.toBeDisabled();
  });

  it("calls onUpdated after a successful deactivation", async () => {
    const { client } = makeIdentityClient();
    const createIdentityClient = vi.fn().mockResolvedValue(client);
    vi.mocked(useIdentityClient).mockReturnValue({
      readOnlyClient: {} as never,
      createIdentityClient,
      storage: {} as never,
      initialising: false,
      initError: null,
      isReady: true,
      isWalletConnected: true,
    });
    const onUpdated = vi.fn();
    render(<UpdateIdentity {...makeProps({ onUpdated })} />);
    fireEvent.click(screen.getByRole("button", { name: "Deactivate" }));
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(screen.getByRole("button", { name: /deactivate did/i }));
    await waitFor(() => expect(onUpdated).toHaveBeenCalledTimes(1));
  });
});

// ── Reactivate (deactivated DID) ──────────────────────────────────────────────

describe("UpdateIdentity — Reactivate (deactivated DID)", () => {
  it("shows the reactivation panel with a checkbox", () => {
    render(<UpdateIdentity {...makeProps({ document: makeDocument({ deactivated: true }) })} />);
    expect(screen.getByText(/reactivate this did/i)).toBeInTheDocument();
    expect(screen.getByRole("checkbox")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /reactivate did/i })).toBeDisabled();
  });

  it("enables the Reactivate button after confirmation", () => {
    render(<UpdateIdentity {...makeProps({ document: makeDocument({ deactivated: true }) })} />);
    fireEvent.click(screen.getByRole("checkbox"));
    expect(screen.getByRole("button", { name: /reactivate did/i })).not.toBeDisabled();
  });
});

// ── Delete tab ────────────────────────────────────────────────────────────────

describe("UpdateIdentity — Delete tab", () => {
  it("shows two confirmation checkboxes and a disabled button initially", () => {
    render(<UpdateIdentity {...makeProps()} />);
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    const checkboxes = screen.getAllByRole("checkbox");
    expect(checkboxes).toHaveLength(2);
    expect(screen.getByRole("button", { name: /permanently delete/i })).toBeDisabled();
  });

  it("remains disabled with only one checkbox checked", () => {
    render(<UpdateIdentity {...makeProps()} />);
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    const [first] = screen.getAllByRole("checkbox");
    fireEvent.click(first);
    expect(screen.getByRole("button", { name: /permanently delete/i })).toBeDisabled();
  });

  it("enables the Delete button only when both checkboxes are checked", () => {
    render(<UpdateIdentity {...makeProps()} />);
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    screen.getAllByRole("checkbox").forEach((cb) => fireEvent.click(cb));
    expect(screen.getByRole("button", { name: /permanently delete/i })).not.toBeDisabled();
  });

  it("calls onDeleted (not onUpdated) after a successful deletion", async () => {
    const { client } = makeIdentityClient();
    const createIdentityClient = vi.fn().mockResolvedValue(client);
    vi.mocked(useIdentityClient).mockReturnValue({
      readOnlyClient: {} as never,
      createIdentityClient,
      storage: {} as never,
      initialising: false,
      initError: null,
      isReady: true,
      isWalletConnected: true,
    });
    const onUpdated = vi.fn();
    const onDeleted = vi.fn();
    render(<UpdateIdentity {...makeProps({ onUpdated, onDeleted })} />);
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    screen.getAllByRole("checkbox").forEach((cb) => fireEvent.click(cb));
    fireEvent.click(screen.getByRole("button", { name: /permanently delete/i }));
    await waitFor(() => expect(onDeleted).toHaveBeenCalledTimes(1));
    expect(onUpdated).not.toHaveBeenCalled();
  });
});

// ── Error handling ────────────────────────────────────────────────────────────

describe("UpdateIdentity — error handling", () => {
  it("shows an error banner when the transaction fails", async () => {
    const createIdentityClient = vi.fn().mockRejectedValue(new Error("Insufficient gas"));
    vi.mocked(useIdentityClient).mockReturnValue({
      readOnlyClient: {} as never,
      createIdentityClient,
      storage: {} as never,
      initialising: false,
      initError: null,
      isReady: true,
      isWalletConnected: true,
    });
    render(<UpdateIdentity {...makeProps()} />);
    const buttons = screen.getAllByRole("button", { name: /add key/i });
    fireEvent.click(buttons[buttons.length - 1]);
    await waitFor(() =>
      expect(screen.getByText(/insufficient gas/i)).toBeInTheDocument(),
    );
  });

  it("shows a cancellation message when the user rejects the wallet prompt", async () => {
    const createIdentityClient = vi.fn().mockRejectedValue(new Error("User rejected the request"));
    vi.mocked(useIdentityClient).mockReturnValue({
      readOnlyClient: {} as never,
      createIdentityClient,
      storage: {} as never,
      initialising: false,
      initError: null,
      isReady: true,
      isWalletConnected: true,
    });
    render(<UpdateIdentity {...makeProps()} />);
    const buttons = screen.getAllByRole("button", { name: /add key/i });
    fireEvent.click(buttons[buttons.length - 1]);
    await waitFor(() =>
      expect(screen.getByText(/transaction cancelled/i)).toBeInTheDocument(),
    );
  });
});
