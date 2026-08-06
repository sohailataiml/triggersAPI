import { useState } from 'react';
import { Check, Copy } from 'lucide-react';

/** Copies text to the clipboard with a brief confirmation. */
export function CopyButton({
  value,
  label,
  className = '',
}: {
  value: string;
  label?: string;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch {
      // Clipboard may be unavailable (insecure context) — fail quietly.
    }
  }

  return (
    <button
      type="button"
      onClick={copy}
      className={`inline-flex items-center gap-1 rounded-md border border-border-strong bg-surface-2 px-1.5 py-0.5 text-xs text-muted transition hover:text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60 ${className}`}
      aria-label={copied ? 'Copied' : `Copy ${label ?? 'value'}`}
      title={copied ? 'Copied' : `Copy ${label ?? 'value'}`}
    >
      {copied ? (
        <Check size={12} className="text-ack" aria-hidden />
      ) : (
        <Copy size={12} aria-hidden />
      )}
      {label ? <span>{copied ? 'Copied' : label}</span> : null}
    </button>
  );
}
