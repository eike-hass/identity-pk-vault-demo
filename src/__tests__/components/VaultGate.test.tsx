import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { VaultGate } from "../../components/VaultGate";

function makeProps(overrides: Partial<Parameters<typeof VaultGate>[0]> = {}) {
  return {
    status: "checking" as const,
    onRegister: vi.fn().mockResolvedValue(undefined),
    onUnlock: vi.fn().mockResolvedValue(undefined),
    onRegisterAndRestore: vi.fn().mockResolvedValue(undefined),
    error: null,
    children: <div data-testid="children">App Content</div>,
    ...overrides,
  };
}

describe("VaultGate — checking state", () => {
  it("shows a loading indicator", () => {
    render(<VaultGate {...makeProps({ status: "checking" })} />);
    expect(screen.getByText(/loading key vault/i)).toBeInTheDocument();
    expect(screen.queryByTestId("children")).not.toBeInTheDocument();
  });
});

describe("VaultGate — error state", () => {
  it("shows the error panel with the error message", () => {
    render(<VaultGate {...makeProps({ status: "error", error: "IDB open failed" })} />);
    expect(screen.getByText(/key vault error/i)).toBeInTheDocument();
    expect(screen.getByText("IDB open failed")).toBeInTheDocument();
    expect(screen.queryByTestId("children")).not.toBeInTheDocument();
  });

  it("offers a reload button", () => {
    const reload = vi.fn();
    vi.stubGlobal("location", { reload });
    render(<VaultGate {...makeProps({ status: "error", error: "fail" })} />);
    fireEvent.click(screen.getByRole("button", { name: /reload page/i }));
    expect(reload).toHaveBeenCalledTimes(1);
    vi.unstubAllGlobals();
  });
});

describe("VaultGate — unregistered state", () => {
  it("shows Create and Restore buttons", () => {
    render(<VaultGate {...makeProps({ status: "unregistered" })} />);
    expect(screen.getByRole("button", { name: /create key vault/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /restore from backup/i })).toBeInTheDocument();
  });

  it("calls onRegister when Create is clicked", async () => {
    const onRegister = vi.fn().mockResolvedValue(undefined);
    render(<VaultGate {...makeProps({ status: "unregistered", onRegister })} />);
    fireEvent.click(screen.getByRole("button", { name: /create key vault/i }));
    await waitFor(() => expect(onRegister).toHaveBeenCalledTimes(1));
  });

  it("shows the restore form when Restore is toggled", () => {
    render(<VaultGate {...makeProps({ status: "unregistered" })} />);
    fireEvent.click(screen.getByRole("button", { name: /restore from backup/i }));
    expect(screen.getByRole("button", { name: /register passkey & restore/i })).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/password used when exporting/i)).toBeInTheDocument();
  });

  it("back button closes the restore form", () => {
    render(<VaultGate {...makeProps({ status: "unregistered" })} />);
    fireEvent.click(screen.getByRole("button", { name: /restore from backup/i }));
    fireEvent.click(screen.getByRole("button", { name: /back/i }));
    expect(screen.queryByPlaceholderText(/password used when exporting/i)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /create key vault/i })).toBeInTheDocument();
  });

  it("register & restore button is disabled until file and password are provided", () => {
    render(<VaultGate {...makeProps({ status: "unregistered" })} />);
    fireEvent.click(screen.getByRole("button", { name: /restore from backup/i }));
    const restoreBtn = screen.getByRole("button", { name: /register passkey & restore/i });
    expect(restoreBtn).toBeDisabled();
    fireEvent.change(screen.getByPlaceholderText(/password used when exporting/i), {
      target: { value: "mypassword" },
    });
    expect(restoreBtn).toBeDisabled();
  });

  it("calls onRegisterAndRestore with json and password on submit", async () => {
    const onRegisterAndRestore = vi.fn().mockResolvedValue({ keysImported: 2 });
    const { container } = render(
      <VaultGate {...makeProps({ status: "unregistered", onRegisterAndRestore })} />,
    );
    fireEvent.click(screen.getByRole("button", { name: /restore from backup/i }));

    const json = JSON.stringify({ version: 1 });
    const file = new File([json], "backup.json", { type: "application/json" });
    const fileInput = container.querySelector('input[type="file"]') as HTMLInputElement;
    Object.defineProperty(fileInput, "files", { value: [file] });
    fireEvent.change(fileInput);

    fireEvent.change(screen.getByPlaceholderText(/password used when exporting/i), {
      target: { value: "secret" },
    });
    fireEvent.click(screen.getByRole("button", { name: /register passkey & restore/i }));
    await waitFor(() => expect(onRegisterAndRestore).toHaveBeenCalledWith(json, "secret"));
  });

  it("shows an inline error when onRegisterAndRestore rejects", async () => {
    const onRegisterAndRestore = vi.fn().mockRejectedValue(
      new Error("Decryption failed — wrong password"),
    );
    const { container } = render(
      <VaultGate {...makeProps({ status: "unregistered", onRegisterAndRestore })} />,
    );
    fireEvent.click(screen.getByRole("button", { name: /restore from backup/i }));

    const file = new File([JSON.stringify({ version: 1 })], "backup.json");
    const fileInput = container.querySelector('input[type="file"]') as HTMLInputElement;
    Object.defineProperty(fileInput, "files", { value: [file] });
    fireEvent.change(fileInput);
    fireEvent.change(screen.getByPlaceholderText(/password used when exporting/i), {
      target: { value: "wrong" },
    });
    fireEvent.click(screen.getByRole("button", { name: /register passkey & restore/i }));
    await waitFor(() =>
      expect(screen.getByText(/decryption failed/i)).toBeInTheDocument(),
    );
  });

  it("shows error-variant text when previous unlock failed (re-register flow)", () => {
    render(
      <VaultGate
        {...makeProps({
          status: "unregistered",
          error: "PRF extension unavailable for this credential",
        })}
      />,
    );
    expect(screen.getByRole("button", { name: /register this browser/i })).toBeInTheDocument();
  });
});

describe("VaultGate — locked state", () => {
  it("shows the unlock panel", () => {
    render(<VaultGate {...makeProps({ status: "locked" })} />);
    expect(screen.getByText(/unlock your key vault/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /unlock with biometrics/i })).toBeInTheDocument();
    expect(screen.queryByTestId("children")).not.toBeInTheDocument();
  });

  it("calls onUnlock when the button is clicked", async () => {
    const onUnlock = vi.fn().mockResolvedValue(undefined);
    render(<VaultGate {...makeProps({ status: "locked", onUnlock })} />);
    fireEvent.click(screen.getByRole("button", { name: /unlock with biometrics/i }));
    await waitFor(() => expect(onUnlock).toHaveBeenCalledTimes(1));
  });

  it("shows an error message when error prop is set", () => {
    render(<VaultGate {...makeProps({ status: "locked", error: "Biometric failed" })} />);
    expect(screen.getByText("Biometric failed")).toBeInTheDocument();
  });
});

describe("VaultGate — unlocked state", () => {
  it("renders children directly without any gate UI", () => {
    render(<VaultGate {...makeProps({ status: "unlocked" })} />);
    expect(screen.getByTestId("children")).toBeInTheDocument();
    expect(screen.queryByText(/create key vault/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/unlock/i)).not.toBeInTheDocument();
  });
});

describe("VaultGate — unsupported state", () => {
  it("shows the PRF warning banner and still renders children", () => {
    render(<VaultGate {...makeProps({ status: "unsupported" })} />);
    expect(screen.getByText(/key vault unavailable/i)).toBeInTheDocument();
    expect(screen.getByTestId("children")).toBeInTheDocument();
  });
});
