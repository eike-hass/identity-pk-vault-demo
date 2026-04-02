/**
 * VaultBackup — export and import an encrypted vault backup.
 *
 * Export: decrypts all private keys from the vault and re-encrypts them with a
 * PBKDF2-derived password key, then triggers a file download.
 *
 * Import: uploads a backup file, decrypts it with the password, and re-encrypts
 * each key under the current vault key. Existing keys are not overwritten.
 */

import { useRef, useState } from "react";
import type { UsePasskeyVaultResult } from "../hooks/usePasskeyVault";

// ── Section wrapper ───────────────────────────────────────────────────────────

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="card space-y-4">
      <h3 className="text-sm font-semibold text-gray-200 uppercase tracking-wide">{title}</h3>
      {children}
    </div>
  );
}

// ── Export panel ──────────────────────────────────────────────────────────────

function ExportPanel({ vault }: { vault: UsePasskeyVaultResult }) {
  const [password, setPassword]   = useState("");
  const [confirm,  setConfirm]    = useState("");
  const [busy,     setBusy]       = useState(false);
  const [success,  setSuccess]    = useState<string | null>(null);
  const [error,    setError]      = useState<string | null>(null);

  async function handleExport() {
    setError(null);
    setSuccess(null);
    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    if (password !== confirm) {
      setError("Passwords do not match.");
      return;
    }
    setBusy(true);
    try {
      const json = await vault.exportBackup(password);
      const blob = new Blob([json], { type: "application/json" });
      const url  = URL.createObjectURL(blob);
      const ts   = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
      const filename = `iota-vault-backup-${ts}.json`;
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
      setSuccess(`Downloaded ${filename}`);
      setPassword("");
      setConfirm("");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Section title="Export backup">
      <p className="text-sm text-gray-400">
        Download an encrypted copy of your vault keys. Store it somewhere safe — you will need
        this file and the password to restore your keys on a new device.
      </p>

      <div className="space-y-3">
        <div>
          <label className="label">Backup password</label>
          <input
            type="password"
            className="input w-full"
            placeholder="Min. 8 characters"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            disabled={busy}
          />
        </div>
        <div>
          <label className="label">Confirm password</label>
          <input
            type="password"
            className="input w-full"
            placeholder="Repeat password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            disabled={busy}
          />
        </div>
      </div>

      {error   && <p className="text-sm text-red-400 bg-red-950/40 border border-red-800/50 rounded-lg px-3 py-2">{error}</p>}
      {success && <p className="text-sm text-green-400 bg-green-950/40 border border-green-800/50 rounded-lg px-3 py-2">✓ {success}</p>}

      <button className="btn-primary w-full" onClick={handleExport} disabled={busy || !password || !confirm}>
        {busy ? (
          <span className="flex items-center justify-center gap-2">
            <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            Encrypting…
          </span>
        ) : "Download backup"}
      </button>
    </Section>
  );
}

// ── Import panel ──────────────────────────────────────────────────────────────

function ImportPanel({ vault, onImport }: { vault: UsePasskeyVaultResult; onImport?: () => void }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [file,    setFile]    = useState<File | null>(null);
  const [password, setPassword] = useState("");
  const [busy,    setBusy]    = useState(false);
  const [success, setSuccess] = useState<string | null>(null);
  const [error,   setError]   = useState<string | null>(null);

  async function handleImport() {
    if (!file) return;
    setError(null);
    setSuccess(null);
    setBusy(true);
    try {
      const json = await file.text();
      const { keysImported } = await vault.importBackup(json, password);
      setSuccess(`Restored successfully — ${keysImported} new key${keysImported !== 1 ? "s" : ""} imported.`);
      setFile(null);
      setPassword("");
      if (fileRef.current) fileRef.current.value = "";
      onImport?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Section title="Import backup">
      <p className="text-sm text-gray-400">
        Restore keys from a previously exported backup file. Existing keys are not overwritten.
      </p>

      <div className="space-y-3">
        <div>
          <label className="label">Backup file</label>
          <input
            ref={fileRef}
            type="file"
            accept=".json"
            className="input w-full text-sm file:mr-3 file:py-1 file:px-3 file:rounded file:border-0 file:text-xs file:bg-gray-700 file:text-gray-200 hover:file:bg-gray-600 cursor-pointer"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            disabled={busy}
          />
        </div>
        <div>
          <label className="label">Backup password</label>
          <input
            type="password"
            className="input w-full"
            placeholder="Password used when exporting"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            disabled={busy}
          />
        </div>
      </div>

      {error   && <p className="text-sm text-red-400 bg-red-950/40 border border-red-800/50 rounded-lg px-3 py-2">{error}</p>}
      {success && <p className="text-sm text-green-400 bg-green-950/40 border border-green-800/50 rounded-lg px-3 py-2">✓ {success}</p>}

      <button className="btn-primary w-full" onClick={handleImport} disabled={busy || !file || !password}>
        {busy ? (
          <span className="flex items-center justify-center gap-2">
            <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            Restoring…
          </span>
        ) : "Restore from backup"}
      </button>
    </Section>
  );
}

// ── VaultBackup ───────────────────────────────────────────────────────────────

export function VaultBackup({ vault, onImport }: { vault: UsePasskeyVaultResult; onImport?: () => void }) {
  return (
    <div className="space-y-4">
      <ExportPanel vault={vault} />
      <ImportPanel vault={vault} onImport={onImport} />
    </div>
  );
}
