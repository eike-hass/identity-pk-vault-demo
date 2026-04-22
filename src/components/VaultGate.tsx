/**
 * VaultGate — guards the main app content behind Passkey vault authentication.
 */

import { useRef, useState } from "react";
import type { VaultStatus } from "../hooks/usePasskeyVault";

// ── Refined fingerprint icon (4-arc design) ───────────────────────────────────
function FingerprintIcon({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      {/* Core dot */}
      <circle cx="12" cy="14.5" r="1.6" fill="white" />
      {/* Arc 1 — tightest */}
      <path d="M9.2 14.5C9.2 11.6 10.4 10 12 10C13.6 10 14.8 11.6 14.8 14.5"
        stroke="white" strokeWidth="1.45" strokeLinecap="round" />
      {/* Arc 2 */}
      <path d="M6.8 14.5C6.8 9.9 9.1 7.2 12 7.2C14.9 7.2 17.2 9.9 17.2 14.5C17.2 17 16.2 19 14.8 20.2"
        stroke="white" strokeWidth="1.35" strokeLinecap="round" />
      {/* Arc 3 */}
      <path d="M4.4 15.2C4.4 8.5 7.6 4.4 12 4.4C16.4 4.4 19.6 8.5 19.6 15.2C19.6 18.8 18.2 21.5 16.2 23"
        stroke="white" strokeWidth="1.25" strokeLinecap="round" />
      {/* Arc 4 — outermost, faded */}
      <path d="M2 16C2 7.2 6.3 1.8 12 1.8C17.7 1.8 22 7.2 22 16"
        stroke="white" strokeWidth="1.15" strokeLinecap="round" strokeOpacity="0.6" />
    </svg>
  );
}

// ── Biometric mark (idle + busy states) ───────────────────────────────────────
function BiometricMark({ size = 72, busy = false }: { size?: number; busy?: boolean }) {
  const br = Math.round(size * 0.28);
  const iconSize = Math.round(size * 0.58);

  return (
    <div style={{ position: "relative", width: size, height: size, flexShrink: 0 }}>
      {/* Pulse rings when busy */}
      {busy && ([0, 0.55, 1.1] as const).map((delay, i) => (
        <div key={i} style={{
          position: "absolute",
          inset: -(size * 0.14 + i * size * 0.1),
          borderRadius: br + (size * 0.14 + i * size * 0.1),
          border: `1.5px solid rgba(14,165,233,${0.55 - i * 0.15})`,
          animation: `bioPulse 1.6s ease-out ${delay}s infinite`,
          pointerEvents: "none",
        }} />
      ))}

      <div style={{
        width: size, height: size, borderRadius: br,
        background: busy
          ? "linear-gradient(145deg, #0c4a7c 0%, #0ea5e9 55%, #38bdf8 100%)"
          : "linear-gradient(145deg, #0c3d6a 0%, #0369a1 50%, #0ea5e9 100%)",
        display: "flex", alignItems: "center", justifyContent: "center",
        boxShadow: busy
          ? "0 8px 32px rgba(14,165,233,0.6), inset 0 1px 0 rgba(255,255,255,0.22)"
          : "0 8px 28px rgba(14,165,233,0.3), inset 0 1px 0 rgba(255,255,255,0.15)",
        transition: "background 0.35s, box-shadow 0.35s",
        position: "relative", overflow: "hidden",
      }}>
        {/* Sweep line */}
        {busy && (
          <div style={{
            position: "absolute", left: 0, right: 0, height: 2, top: "50%",
            background: "linear-gradient(90deg, transparent, rgba(255,255,255,0.55), transparent)",
            animation: "scanSweep 1.4s ease-in-out infinite",
            pointerEvents: "none",
          }} />
        )}
        <FingerprintIcon size={iconSize} />
      </div>
    </div>
  );
}

// ── Spinner ────────────────────────────────────────────────────────────────────
function Spinner() {
  return <span className="spinner" style={{ width: 14, height: 14 }} />;
}

// ── Shared vault panel layout ──────────────────────────────────────────────────
function VaultPanel({
  title, description, primaryLabel, onPrimary, primaryBusy,
  secondaryLabel, onSecondary, error,
}: {
  title: string;
  description: string;
  primaryLabel: string;
  onPrimary: () => void;
  primaryBusy: boolean;
  secondaryLabel?: string;
  onSecondary?: () => void;
  error: string | null;
}) {
  return (
    <div className="card fade-in" style={{ maxWidth: 420, margin: "0 auto", textAlign: "center" }}>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 24, padding: "8px 0 4px" }}>
        <BiometricMark busy={primaryBusy} />
        <div>
          <h2 style={{ fontSize: 20, fontWeight: 700, color: "var(--text-1)", marginBottom: 8 }}>{title}</h2>
          <p style={{ fontSize: 14, color: "var(--text-2)", lineHeight: 1.6, maxWidth: 300, margin: "0 auto" }}>
            {description}
          </p>
        </div>
        {error && <div className="banner-error">{error}</div>}
        <div style={{ display: "flex", flexDirection: "column", gap: 8, width: "100%", maxWidth: 280 }}>
          <button
            className="btn btn-primary"
            onClick={onPrimary}
            disabled={primaryBusy}
            style={{ width: "100%", padding: "11px 20px" }}
          >
            {primaryBusy ? <><Spinner /> Waiting for biometric…</> : primaryLabel}
          </button>
          {secondaryLabel && (
            <button
              className="btn btn-secondary"
              onClick={onSecondary}
              disabled={primaryBusy}
              style={{ width: "100%", padding: "10px 20px" }}
            >
              {secondaryLabel}
            </button>
          )}
        </div>
      </div>
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

  async function wrap(fn: () => Promise<void>) {
    setBusy(true);
    try { await fn(); } finally { setBusy(false); }
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

  // ── Checking ──
  if (status === "checking") {
    return (
      <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", minHeight: 280 }}>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12 }}>
          <BiometricMark size={56} />
          <p className="pulse" style={{ fontSize: 13, color: "var(--text-2)" }}>Checking key vault…</p>
        </div>
      </div>
    );
  }

  // ── Error ──
  if (status === "error") {
    return (
      <div className="card fade-in" style={{ maxWidth: 420, margin: "0 auto", textAlign: "center" }}>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 16, padding: "8px 0" }}>
          <div style={{
            width: 48, height: 48, borderRadius: 14,
            background: "rgba(248,113,113,0.12)",
            border: "1px solid rgba(248,113,113,0.25)",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            <span style={{ fontSize: 20 }}>⚠</span>
          </div>
          <div>
            <h2 style={{ fontSize: 18, fontWeight: 700, color: "#fca5a5", marginBottom: 6 }}>Key Vault Error</h2>
            <p style={{ fontSize: 13, color: "var(--text-2)", lineHeight: 1.6 }}>{error}</p>
          </div>
          <button className="btn btn-secondary" onClick={() => window.location.reload()}>Reload page</button>
        </div>
      </div>
    );
  }

  // ── Unregistered ──
  if (status === "unregistered") {
    if (showRestore) {
      return (
        <div className="card fade-in" style={{ maxWidth: 420, margin: "0 auto" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <BiometricMark size={48} busy={busy} />
              <div>
                <h2 style={{ fontSize: 18, fontWeight: 700, color: "var(--text-1)" }}>Restore from backup</h2>
                <p style={{ fontSize: 13, color: "var(--text-2)", marginTop: 2 }}>
                  Register a new passkey and restore your keys
                </p>
              </div>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <div>
                <label className="label">Backup file</label>
                <input
                  ref={fileRef}
                  type="file"
                  accept=".json"
                  className="file-input"
                  onChange={(e) => setRestoreFile(e.target.files?.[0] ?? null)}
                  disabled={busy}
                />
              </div>
              <div>
                <label className="label">Backup password</label>
                <input
                  type="password"
                  className="input"
                  placeholder="Password used when exporting"
                  value={restorePassword}
                  onChange={(e) => setRestorePassword(e.target.value)}
                  disabled={busy}
                />
              </div>
            </div>
            {restoreError && <div className="banner-error">{restoreError}</div>}
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <button
                className="btn btn-primary"
                onClick={handleRegisterAndRestore}
                disabled={busy || !restoreFile || !restorePassword}
                style={{ padding: "11px 20px" }}
              >
                {busy ? <><Spinner /> Waiting for biometric…</> : "Register passkey & restore"}
              </button>
              <button
                className="btn btn-secondary"
                onClick={() => { setShowRestore(false); setRestoreError(null); }}
                disabled={busy}
              >
                ← Back
              </button>
            </div>
          </div>
        </div>
      );
    }

    return (
      <VaultPanel
        title="Secure your identity keys"
        description={error
          ? "The stored vault credential is not accessible from this browser. Register a new vault — keys from another browser cannot be shared."
          : "Your DID signing keys are stored in a hardware-bound encrypted vault. Use Touch ID, Windows Hello, or a device PIN to create it."}
        primaryLabel={error ? "Register this browser" : "Create key vault"}
        onPrimary={() => wrap(onRegister)}
        primaryBusy={busy}
        secondaryLabel="Restore from backup"
        onSecondary={() => setShowRestore(true)}
        error={null}
      />
    );
  }

  // ── Locked ──
  if (status === "locked") {
    return (
      <VaultPanel
        title="Unlock your key vault"
        description="Authenticate with your device biometrics to unlock your encrypted identity keys for this session."
        primaryLabel="Unlock with biometrics"
        onPrimary={() => wrap(onUnlock)}
        primaryBusy={busy}
        error={error}
      />
    );
  }

  // ── Unsupported or Unlocked ──
  return (
    <>
      {status === "unsupported" && (
        <div className="banner-warn" style={{ maxWidth: 640, margin: "0 auto", display: "flex", gap: 8, alignItems: "flex-start" }}>
          <span style={{ flexShrink: 0 }}>⚠</span>
          <span>
            <strong>Key vault unavailable.</strong> Your browser does not support the WebAuthn PRF
            extension. Signing keys will be stored in memory only and lost on page reload.{" "}
            Use Chrome 116+, Edge 116+, or Safari 17.4+ for full support.
          </span>
        </div>
      )}
      {children}
    </>
  );
}
