/**
 * VaultGate — guards the main app content behind Passkey vault authentication.
 *
 * Renders one of four states based on `VaultStatus`:
 *  - "checking"     → loading spinner
 *  - "unsupported"  → amber notice; children are rendered normally (JwkMemStore fallback)
 *  - "unregistered" → "Create key vault" panel
 *  - "locked"       → "Unlock vault" panel
 *  - "unlocked"     → children rendered directly
 *  - "error"        → error panel with retry option
 */

import { useRef, useState } from "react";
import type { VaultStatus } from "../hooks/usePasskeyVault";

// ── Fingerprint SVG (reused from Header / App) ────────────────────────────────

function FingerprintIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <circle cx="10" cy="13.5" r="1.4" fill="white" />
      <path
        d="M7.8 13.5C7.8 10.8 8.7 9 10 9C11.3 9 12.2 10.8 12.2 13.5"
        stroke="white" strokeWidth="1.4" strokeLinecap="round"
      />
      <path
        d="M5.5 13.5C5.5 8.5 7.4 5.5 10 5.5C12.6 5.5 14.5 8.5 14.5 13.5C14.5 15.5 13.8 17 12.5 18"
        stroke="white" strokeWidth="1.4" strokeLinecap="round"
      />
      <path
        d="M3 14C3 6.5 6.1 2.5 10 2.5C13.9 2.5 17 6.5 17 14C17 16.5 16 18.5 14.5 19.5"
        stroke="white" strokeWidth="1.4" strokeLinecap="round"
      />
    </svg>
  );
}

// ── Shared vault panel layout ─────────────────────────────────────────────────

function VaultPanel({
  title,
  description,
  action,
  actionLabel,
  busy,
  error,
}: {
  title: string;
  description: string;
  action: () => void;
  actionLabel: string;
  busy: boolean;
  error: string | null;
}) {
  return (
    <div className="card text-center space-y-6 py-10 max-w-md mx-auto">
      <div className="mx-auto w-16 h-16 rounded-2xl bg-gradient-to-br from-iota-500 to-iota-700 flex items-center justify-center select-none shadow-xl shadow-iota-900/60">
        <FingerprintIcon className="w-10 h-10" />
      </div>

      <div>
        <h2 className="text-xl font-bold text-gray-100">{title}</h2>
        <p className="mt-2 text-sm text-gray-400 max-w-xs mx-auto">{description}</p>
      </div>

      {error && (
        <p className="text-sm text-red-400 bg-red-950/40 border border-red-800/50 rounded-lg px-4 py-2">
          {error}
        </p>
      )}

      <button className="btn-primary w-full max-w-xs mx-auto" onClick={action} disabled={busy}>
        {busy ? (
          <span className="flex items-center justify-center gap-2">
            <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            Waiting for biometric…
          </span>
        ) : (
          actionLabel
        )}
      </button>
    </div>
  );
}

// ── VaultGate ─────────────────────────────────────────────────────────────────

interface VaultGateProps {
  status: VaultStatus;
  onRegister: () => Promise<void>;
  onUnlock: () => Promise<void>;
  onRegisterAndRestore: (json: string, password: string) => Promise<unknown>;
  error: string | null;
  children: React.ReactNode;
}

export function VaultGate({ status, onRegister, onUnlock, onRegisterAndRestore, error, children }: VaultGateProps) {
  const [busy, setBusy] = useState(false);
  const [showRestore, setShowRestore] = useState(false);
  const [restoreFile, setRestoreFile] = useState<File | null>(null);
  const [restorePassword, setRestorePassword] = useState("");
  const [restoreError, setRestoreError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  async function handleAction(fn: () => Promise<void>) {
    setBusy(true);
    try {
      await fn();
    } finally {
      setBusy(false);
    }
  }

  async function handleRegisterAndRestore() {
    if (!restoreFile) return;
    setRestoreError(null);
    setBusy(true);
    try {
      const json = await restoreFile.text();
      await onRegisterAndRestore(json, restorePassword);
    } catch (err) {
      setRestoreError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  if (status === "checking") {
    return (
      <div className="flex-1 flex items-center justify-center">
        <span className="text-sm text-gray-500 animate-pulse">Loading key vault…</span>
      </div>
    );
  }

  if (status === "error") {
    return (
      <div className="card max-w-md mx-auto text-center py-8 space-y-3">
        <p className="text-sm font-medium text-red-400">Key vault error</p>
        <p className="text-sm text-gray-400">{error}</p>
        <button className="btn-secondary text-sm" onClick={() => window.location.reload()}>
          Reload page
        </button>
      </div>
    );
  }

  if (status === "unregistered") {
    return (
      <div className="card text-center space-y-6 py-10 max-w-md mx-auto">
        <div className="mx-auto w-16 h-16 rounded-2xl bg-gradient-to-br from-iota-500 to-iota-700 flex items-center justify-center select-none shadow-xl shadow-iota-900/60">
          <FingerprintIcon className="w-10 h-10" />
        </div>

        <div>
          <h2 className="text-xl font-bold text-gray-100">Secure your identity keys</h2>
          <p className="mt-2 text-sm text-gray-400 max-w-xs mx-auto">
            {error
              ? "The stored vault credential is not accessible from this browser. Register a new vault for this browser — note that keys created in another browser cannot be shared."
              : "Your DID signing keys are stored in an encrypted vault. Use your device biometrics (Face ID, fingerprint, or PIN) to create and unlock it."}
          </p>
        </div>

        {!showRestore ? (
          <div className="space-y-3 max-w-xs mx-auto w-full">
            <button className="btn-primary w-full" onClick={() => handleAction(onRegister)} disabled={busy}>
              {busy ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Waiting for biometric…
                </span>
              ) : (error ? "Register this browser" : "Create key vault")}
            </button>
            <button className="btn-secondary w-full text-sm" onClick={() => setShowRestore(true)} disabled={busy}>
              Restore from backup
            </button>
          </div>
        ) : (
          <div className="space-y-3 max-w-xs mx-auto w-full text-left">
            <div>
              <label className="label">Backup file</label>
              <input
                ref={fileRef}
                type="file"
                accept=".json"
                className="input w-full text-sm file:mr-3 file:py-1 file:px-3 file:rounded file:border-0 file:text-xs file:bg-gray-700 file:text-gray-200 hover:file:bg-gray-600 cursor-pointer"
                onChange={(e) => setRestoreFile(e.target.files?.[0] ?? null)}
                disabled={busy}
              />
            </div>
            <div>
              <label className="label">Backup password</label>
              <input
                type="password"
                className="input w-full"
                placeholder="Password used when exporting"
                value={restorePassword}
                onChange={(e) => setRestorePassword(e.target.value)}
                disabled={busy}
              />
            </div>

            {restoreError && (
              <p className="text-sm text-red-400 bg-red-950/40 border border-red-800/50 rounded-lg px-3 py-2">
                {restoreError}
              </p>
            )}

            <button
              className="btn-primary w-full"
              onClick={handleRegisterAndRestore}
              disabled={busy || !restoreFile || !restorePassword}
            >
              {busy ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Waiting for biometric…
                </span>
              ) : "Register passkey & restore"}
            </button>
            <button className="btn-secondary w-full text-sm" onClick={() => { setShowRestore(false); setRestoreError(null); }} disabled={busy}>
              ← Back
            </button>
          </div>
        )}
      </div>
    );
  }

  if (status === "locked") {
    return (
      <VaultPanel
        title="Unlock your key vault"
        description="Authenticate with your device biometrics to unlock your encrypted identity keys."
        action={() => handleAction(onUnlock)}
        actionLabel="Unlock with biometrics"
        busy={busy}
        error={error}
      />
    );
  }

  // "unsupported" — show a non-blocking notice above the normal app content.
  // "unlocked"    — just render children.
  return (
    <>
      {status === "unsupported" && (
        <div className="bg-amber-950/50 border border-amber-800/50 rounded-xl px-4 py-3 text-sm text-amber-300 max-w-2xl mx-auto w-full px-4 mt-4 flex gap-2 items-start">
          <span className="shrink-0 mt-0.5">⚠</span>
          <span>
            <strong>Key vault unavailable.</strong> Your browser does not support the WebAuthn PRF
            extension. Signing keys will be stored in memory only and lost on page reload.
            {" "}Use Chrome 116+, Edge 116+, or Safari 17.4+ for full support. Firefox 139+ works with local authenticators (Windows Hello, Touch ID) but not cross-device (phone) passkeys.
          </span>
        </div>
      )}
      {children}
    </>
  );
}

