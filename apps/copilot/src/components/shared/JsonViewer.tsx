import { useMemo } from 'react';

/**
 * Renders a JSON value as escaped text inside a <pre>.
 *
 * React escapes interpolated strings, so tool output — which originates from
 * event payloads a third party controls — can never inject markup here.
 */
export function JsonViewer({ value, maxHeight = 260 }: { value: unknown; maxHeight?: number }) {
  const text = useMemo(() => {
    if (value === null || value === undefined) return 'null';
    if (typeof value === 'string') return value;
    try {
      return JSON.stringify(value, null, 2);
    } catch {
      return String(value);
    }
  }, [value]);

  return (
    <pre
      className="mono overflow-auto whitespace-pre-wrap break-words rounded-lg border border-border bg-bg/70 p-3 text-muted"
      style={{ maxHeight }}
    >
      {text}
    </pre>
  );
}
