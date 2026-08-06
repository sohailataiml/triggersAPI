/** Short id for display (first segment of a UUID). */
export function shortId(id?: string | null): string {
  return id ? id.slice(0, 8) : '';
}

/** Absolute wall-clock time, e.g. 10:39:32. */
export function clockTime(iso?: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleTimeString();
}

/** Absolute time with millis, e.g. 10:39:32.140. */
export function preciseTime(iso?: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return `${d.toLocaleTimeString()}.${String(d.getMilliseconds()).padStart(3, '0')}`;
}

/** Compact relative time, e.g. "just now", "12s ago", "3m ago". */
export function relativeTime(iso?: string | null, now = Date.now()): string {
  if (!iso) return '';
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return '';
  const secs = Math.round((now - t) / 1000);
  if (secs < 3) return 'just now';
  if (secs < 60) return `${secs}s ago`;
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

/** Signed countdown in seconds, e.g. "58s left" / "expired 4s ago". */
export function countdown(
  iso?: string | null,
  now = Date.now(),
): {
  seconds: number;
  label: string;
  expired: boolean;
} {
  if (!iso) return { seconds: 0, label: '—', expired: false };
  const t = new Date(iso).getTime();
  const seconds = Math.round((t - now) / 1000);
  if (seconds <= 0) return { seconds, label: `expired ${Math.abs(seconds)}s ago`, expired: true };
  return { seconds, label: `${seconds}s left`, expired: false };
}

/** Human duration between two ISO timestamps, e.g. "1.8s". */
export function durationBetween(startIso?: string | null, endIso?: string | null): string | null {
  if (!startIso || !endIso) return null;
  const ms = new Date(endIso).getTime() - new Date(startIso).getTime();
  if (Number.isNaN(ms) || ms < 0) return null;
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}
