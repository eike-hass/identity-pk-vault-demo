import { useState } from "react";

export function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  function handleCopy() {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }

  return (
    <button
      onClick={handleCopy}
      title={copied ? "Copied!" : "Copy to clipboard"}
      style={{
        background: "none",
        border: "none",
        padding: "2px 4px",
        cursor: "pointer",
        color: copied ? "#4ade80" : "var(--text-3)",
        flexShrink: 0,
        display: "inline-flex",
        alignItems: "center",
        borderRadius: 4,
        transition: "color 0.15s",
      }}
    >
      {copied ? (
        // Checkmark
        <svg width={13} height={13} viewBox="0 0 13 13" fill="none" aria-hidden="true">
          <path d="M2.5 6.5L5.5 9.5L10.5 3.5" stroke="currentColor" strokeWidth="1.4"
            strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      ) : (
        // Clipboard
        <svg width={13} height={13} viewBox="0 0 13 13" fill="none" aria-hidden="true">
          <rect x="4" y="2" width="7" height="9" rx="1.2" stroke="currentColor" strokeWidth="1.2" />
          <path d="M4 4H3C2.45 4 2 4.45 2 5V11C2 11.55 2.45 12 3 12H8C8.55 12 9 11.55 9 11V10"
            stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
        </svg>
      )}
    </button>
  );
}
