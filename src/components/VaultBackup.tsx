/**
 * VaultBackup — export and import an encrypted vault backup.
 */

import { useRef, useState } from "react";
import type { UsePasskeyVaultResult } from "../hooks/usePasskeyVault";

function Spinner() {
  return <span className="spinner" style={{ width: 14, height: 14 }} />;
}

// ── Export panel ──────────────────────────────────────────────────────────────
function ExportPanel({ vault }: { vault: UsePasskeyVaultResult }) {
  const [password, setPassword] = useState("");
  const [confirm,  setConfirm]  = useState("");
  const [busy,     setBusy]     = useState(false);
  const [success,  setSuccess]  = useState<string | null>(null);
  const [error,    setError]    = useState<string | null>(null);

  async function handleExport() {
    setError(null);
    setSuccess(null);
    if (password.length < 8) { setError("Password must be at least 8 characters."); return; }
    if (password !== confirm) { setError("Passwords do not match."); return; }
    setBusy(true);
    try {
      const json = await vault.exportBackup(password);
      const blob = new Blob([json], { type: "application/json" });
      const url  = URL.createObjectURL(blob);
      const ts   = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
      const filename = `iota-vault-backup-${ts}.json`;
      const a = document.createElement("a");
      a.href = url; a.download = filename; a.click();
      URL.revokeObjectURL(url);
      setSuccess(`Downloaded ${filename}`);
      setPassword(""); setConfirm("");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card card-lift" style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div>
        <h3 style={{ fontSize: 13, fontWeight: 700, color: "var(--text-1)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 6 }}>
          Export backup
        </h3>
        <p style={{ fontSize: 13, color: "var(--text-2)", lineHeight: 1.6 }}>
          Download an encrypted copy of your vault keys. You'll need this file and the password to restore on a new device.
        </p>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <div>
          <label className="label">Backup password</label>
          <input type="password" className="input" placeholder="Min. 8 characters"
            value={password} onChange={(e) => setPassword(e.target.value)} disabled={busy} />
        </div>
        <div>
          <label className="label">Confirm password</label>
          <input type="password" className="input" placeholder="Repeat password"
            value={confirm} onChange={(e) => setConfirm(e.target.value)} disabled={busy} />
        </div>
      </div>

      {error   && <div className="banner-error">{error}</div>}
      {success && <div className="banner-success">✓ {success}</div>}

      <button
        className="btn btn-primary"
        onClick={handleExport}
        disabled={busy || !password || !confirm}
        style={{ padding: "10px 18px" }}
      >
        {busy ? <><Spinner /> Encrypting…</> : "Download backup"}
      </button>
    </div>
  );
}

// ── Import panel ──────────────────────────────────────────────────────────────
function ImportPanel({ vault, onImport }: { vault: UsePasskeyVaultResult; onImport?: () => void }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [file,     setFile]     = useState<File | null>(null);
  const [password, setPassword] = useState("");
  const [busy,     setBusy]     = useState(false);
  const [success,  setSuccess]  = useState<string | null>(null);
  const [error,    setError]    = useState<string | null>(null);

  async function handleImport() {
    if (!file) return;
    setError(null); setSuccess(null);
    setBusy(true);
    try {
      const json = await file.text();
      const { keysImported } = await vault.importBackup(json, password);
      setSuccess(`Restored successfully — ${keysImported} new key${keysImported !== 1 ? "s" : ""} imported.`);
      setFile(null); setPassword("");
      if (fileRef.current) fileRef.current.value = "";
      onImport?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card card-lift" style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div>
        <h3 style={{ fontSize: 13, fontWeight: 700, color: "var(--text-1)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 6 }}>
          Import backup
        </h3>
        <p style={{ fontSize: 13, color: "var(--text-2)", lineHeight: 1.6 }}>
          Restore keys from a previously exported backup file. Existing keys are not overwritten.
        </p>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <div>
          <label className="label">Backup file</label>
          <input
            ref={fileRef}
            type="file"
            accept=".json"
            className="file-input"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            disabled={busy}
          />
        </div>
        <div>
          <label className="label">Backup password</label>
          <input type="password" className="input" placeholder="Password used when exporting"
            value={password} onChange={(e) => setPassword(e.target.value)} disabled={busy} />
        </div>
      </div>

      {error   && <div className="banner-error">{error}</div>}
      {success && <div className="banner-success">✓ {success}</div>}

      <button
        className="btn btn-primary"
        onClick={handleImport}
        disabled={busy || !file || !password}
        style={{ padding: "10px 18px" }}
      >
        {busy ? <><Spinner /> Restoring…</> : "Restore from backup"}
      </button>
    </div>
  );
}

// ── VaultBackup ───────────────────────────────────────────────────────────────
export function VaultBackup({ vault, onImport }: { vault: UsePasskeyVaultResult; onImport?: () => void }) {
  return (
    <div className="fade-in" style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <ExportPanel vault={vault} />
      <ImportPanel vault={vault} onImport={onImport} />
    </div>
  );
}
