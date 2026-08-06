import { CopyButton } from './CopyButton';

/** Pretty-prints a JSON value in a scrollable, copyable mono block. */
export function JsonViewer({ value, maxHeight = 320 }: { value: unknown; maxHeight?: number }) {
  const text = safeStringify(value);
  return (
    <div className="relative rounded-lg border border-border bg-bg/70">
      <div className="absolute right-2 top-2 z-10">
        <CopyButton value={text} label="Copy" />
      </div>
      <pre
        className="overflow-auto p-3 pr-16 font-mono text-[0.78rem] leading-relaxed text-text/90"
        style={{ maxHeight }}
      >
        {text}
      </pre>
    </div>
  );
}

function safeStringify(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}
