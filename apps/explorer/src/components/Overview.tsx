import type { Overview } from '../types';

const CARDS: Array<{ key: keyof Overview; label: string; cls: string }> = [
  { key: 'totalEvents', label: 'Events', cls: '' },
  { key: 'pending', label: 'Pending', cls: 'p' },
  { key: 'activeLeases', label: 'Active leases', cls: 'l' },
  { key: 'retryScheduled', label: 'Retry queue', cls: 'r' },
  { key: 'deadLetter', label: 'Dead letter', cls: 'd' },
  { key: 'acknowledged', label: 'Acknowledged', cls: 'a' },
];

export function OverviewCards({ data }: { data: Overview | null }) {
  return (
    <div className="stats">
      {CARDS.map((c) => (
        <div key={c.key} className={`stat ${c.cls}`}>
          <div className="num">{data ? data[c.key] : '—'}</div>
          <div className="label">{c.label}</div>
        </div>
      ))}
    </div>
  );
}
