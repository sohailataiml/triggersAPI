import { useState } from 'react';
import { Check, Copy } from 'lucide-react';

export function CopyButton({ value, label = 'Copy' }: { value: string; label?: string }) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1400);
    } catch {
      // Clipboard access can be denied; failing silently is fine here.
    }
  };

  return (
    <button
      type="button"
      onClick={() => void copy()}
      className="btn btn-ghost h-7 px-2 text-xs text-muted"
      aria-label={copied ? 'Copied' : label}
    >
      {copied ? <Check size={13} aria-hidden /> : <Copy size={13} aria-hidden />}
      {copied ? 'Copied' : label}
    </button>
  );
}
