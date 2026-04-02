import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { VaultBackup } from "../../components/VaultBackup";
import type { UsePasskeyVaultResult } from "../../hooks/usePasskeyVault";

function makeVault(overrides: Partial<UsePasskeyVaultResult> = {}): UsePasskeyVaultResult {
  return {
    status: "unlocked",
    storage: null,
    error: null,
    register: vi.fn(),
    unlock: vi.fn(),
    exportBackup: vi.fn().mockResolvedValue('{"version":1,"kdf":{},"iv":"","payload":""}'),
    importBackup: vi.fn().mockResolvedValue({ keysImported: 3 }),
    registerAndRestore: vi.fn(),
    ...overrides,
  };
}

// ── Export panel ──────────────────────────────────────────────────────────────

describe("VaultBackup — Export panel", () => {
  it("renders export section heading and input fields", () => {
    render(<VaultBackup vault={makeVault()} />);
    expect(screen.getByText(/export backup/i)).toBeInTheDocument();
    // Labels lack htmlFor; identify inputs by placeholder text.
    expect(screen.getByPlaceholderText("Min. 8 characters")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Repeat password")).toBeInTheDocument();
  });

  it("download button is disabled when fields are empty", () => {
    render(<VaultBackup vault={makeVault()} />);
    expect(screen.getByRole("button", { name: /download backup/i })).toBeDisabled();
  });

  it("shows error when password is shorter than 8 characters", async () => {
    render(<VaultBackup vault={makeVault()} />);
    fireEvent.change(screen.getByPlaceholderText("Min. 8 characters"), { target: { value: "short" } });
    fireEvent.change(screen.getByPlaceholderText("Repeat password"), { target: { value: "short" } });
    fireEvent.click(screen.getByRole("button", { name: /download backup/i }));
    await waitFor(() =>
      expect(screen.getByText(/at least 8 characters/i)).toBeInTheDocument(),
    );
  });

  it("shows error when passwords do not match", async () => {
    render(<VaultBackup vault={makeVault()} />);
    fireEvent.change(screen.getByPlaceholderText("Min. 8 characters"), { target: { value: "password1" } });
    fireEvent.change(screen.getByPlaceholderText("Repeat password"), { target: { value: "password2" } });
    fireEvent.click(screen.getByRole("button", { name: /download backup/i }));
    await waitFor(() =>
      expect(screen.getByText(/passwords do not match/i)).toBeInTheDocument(),
    );
  });

  it("calls exportBackup and triggers download on valid input", async () => {
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    const vault = makeVault();
    render(<VaultBackup vault={vault} />);

    fireEvent.change(screen.getByPlaceholderText("Min. 8 characters"), { target: { value: "strongpass1" } });
    fireEvent.change(screen.getByPlaceholderText("Repeat password"), { target: { value: "strongpass1" } });
    fireEvent.click(screen.getByRole("button", { name: /download backup/i }));

    await waitFor(() => expect(vault.exportBackup).toHaveBeenCalledWith("strongpass1"));
    expect(clickSpy).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(screen.getByText(/downloaded/i)).toBeInTheDocument());
    clickSpy.mockRestore();
  });

  it("shows error message when exportBackup rejects", async () => {
    const vault = makeVault({
      exportBackup: vi.fn().mockRejectedValue(new Error("Vault is locked")),
    });
    render(<VaultBackup vault={vault} />);
    fireEvent.change(screen.getByPlaceholderText("Min. 8 characters"), { target: { value: "strongpass1" } });
    fireEvent.change(screen.getByPlaceholderText("Repeat password"), { target: { value: "strongpass1" } });
    fireEvent.click(screen.getByRole("button", { name: /download backup/i }));
    await waitFor(() =>
      expect(screen.getByText(/vault is locked/i)).toBeInTheDocument(),
    );
  });
});

// ── Import panel ──────────────────────────────────────────────────────────────

describe("VaultBackup — Import panel", () => {
  it("renders import section heading and file/password inputs", () => {
    const { container } = render(<VaultBackup vault={makeVault()} />);
    expect(screen.getByText(/import backup/i)).toBeInTheDocument();
    expect(container.querySelector('input[type="file"]')).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Password used when exporting")).toBeInTheDocument();
  });

  it("restore button is disabled when no file is selected", () => {
    render(<VaultBackup vault={makeVault()} />);
    expect(screen.getByRole("button", { name: /restore from backup/i })).toBeDisabled();
  });

  it("restore button is disabled when file is selected but password is empty", ({ container }: any) => {
    const result = render(<VaultBackup vault={makeVault()} />);
    const fileInput = result.container.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File(['{"version":1}'], "backup.json", { type: "application/json" });
    Object.defineProperty(fileInput, "files", { value: [file] });
    fireEvent.change(fileInput);
    expect(screen.getByRole("button", { name: /restore from backup/i })).toBeDisabled();
  });

  it("calls importBackup with file content and password", async () => {
    const vault = makeVault();
    const { container } = render(<VaultBackup vault={vault} />);

    const content = '{"version":1,"kdf":{},"iv":"abc","payload":"xyz"}';
    const file = new File([content], "backup.json", { type: "application/json" });
    const fileInput = container.querySelector('input[type="file"]') as HTMLInputElement;
    Object.defineProperty(fileInput, "files", { value: [file] });
    fireEvent.change(fileInput);

    fireEvent.change(screen.getByPlaceholderText("Password used when exporting"), {
      target: { value: "mybackuppass" },
    });
    fireEvent.click(screen.getByRole("button", { name: /restore from backup/i }));

    await waitFor(() =>
      expect(vault.importBackup).toHaveBeenCalledWith(content, "mybackuppass"),
    );
  });

  it("shows success message with key count after import", async () => {
    const vault = makeVault({ importBackup: vi.fn().mockResolvedValue({ keysImported: 3 }) });
    const { container } = render(<VaultBackup vault={vault} />);
    const file = new File(['{"version":1}'], "backup.json");
    const fileInput = container.querySelector('input[type="file"]') as HTMLInputElement;
    Object.defineProperty(fileInput, "files", { value: [file] });
    fireEvent.change(fileInput);
    fireEvent.change(screen.getByPlaceholderText("Password used when exporting"), {
      target: { value: "mybackuppass" },
    });
    fireEvent.click(screen.getByRole("button", { name: /restore from backup/i }));
    await waitFor(() =>
      expect(screen.getByText(/3 new keys imported/i)).toBeInTheDocument(),
    );
  });

  it("shows singular 'key' when exactly 1 key is imported", async () => {
    const vault = makeVault({ importBackup: vi.fn().mockResolvedValue({ keysImported: 1 }) });
    const { container } = render(<VaultBackup vault={vault} />);
    const file = new File(['{"version":1}'], "backup.json");
    const fileInput = container.querySelector('input[type="file"]') as HTMLInputElement;
    Object.defineProperty(fileInput, "files", { value: [file] });
    fireEvent.change(fileInput);
    fireEvent.change(screen.getByPlaceholderText("Password used when exporting"), {
      target: { value: "mybackuppass" },
    });
    fireEvent.click(screen.getByRole("button", { name: /restore from backup/i }));
    await waitFor(() =>
      expect(screen.getByText(/1 new key imported/i)).toBeInTheDocument(),
    );
  });

  it("shows error message when importBackup rejects", async () => {
    const vault = makeVault({
      importBackup: vi.fn().mockRejectedValue(
        new Error("Decryption failed — wrong password or corrupt backup file."),
      ),
    });
    const { container } = render(<VaultBackup vault={vault} />);
    const file = new File(['{"version":1}'], "backup.json");
    const fileInput = container.querySelector('input[type="file"]') as HTMLInputElement;
    Object.defineProperty(fileInput, "files", { value: [file] });
    fireEvent.change(fileInput);
    fireEvent.change(screen.getByPlaceholderText("Password used when exporting"), {
      target: { value: "wrong" },
    });
    fireEvent.click(screen.getByRole("button", { name: /restore from backup/i }));
    await waitFor(() =>
      expect(screen.getByText(/decryption failed/i)).toBeInTheDocument(),
    );
  });

  it("calls onImport callback after successful import", async () => {
    const onImport = vi.fn();
    const vault = makeVault();
    const { container } = render(<VaultBackup vault={vault} onImport={onImport} />);
    const file = new File(['{"version":1}'], "backup.json");
    const fileInput = container.querySelector('input[type="file"]') as HTMLInputElement;
    Object.defineProperty(fileInput, "files", { value: [file] });
    fireEvent.change(fileInput);
    fireEvent.change(screen.getByPlaceholderText("Password used when exporting"), {
      target: { value: "mybackuppass" },
    });
    fireEvent.click(screen.getByRole("button", { name: /restore from backup/i }));
    await waitFor(() => expect(onImport).toHaveBeenCalledTimes(1));
  });

  it("does not call onImport when importBackup fails", async () => {
    const onImport = vi.fn();
    const vault = makeVault({
      importBackup: vi.fn().mockRejectedValue(new Error("fail")),
    });
    const { container } = render(<VaultBackup vault={vault} onImport={onImport} />);
    const file = new File(['{"version":1}'], "backup.json");
    const fileInput = container.querySelector('input[type="file"]') as HTMLInputElement;
    Object.defineProperty(fileInput, "files", { value: [file] });
    fireEvent.change(fileInput);
    fireEvent.change(screen.getByPlaceholderText("Password used when exporting"), {
      target: { value: "pw" },
    });
    fireEvent.click(screen.getByRole("button", { name: /restore from backup/i }));
    await waitFor(() => expect(vault.importBackup).toHaveBeenCalled());
    expect(onImport).not.toHaveBeenCalled();
  });
});
