import { useState } from 'react';
import { LivePipeline } from '../components/dashboard/LivePipeline';
import { EventDetailDrawer } from '../components/events/EventDetailDrawer';
import { PIPELINE_STAGES } from '../hooks/useRecentEvents';
import { colorClasses } from '../lib/status';

const BRANCHES: Array<{ label: string; color: Parameters<typeof colorClasses>[0] }> = [
  { label: 'Retry', color: 'retry' },
  { label: 'Dead letter', color: 'dead' },
  { label: 'Replayed', color: 'replay' },
];

/**
 * Detailed real-time pipeline view. Shares the same SSE projection as the
 * Dashboard; deeper controls (per-event delivery attempt timelines, demo mode)
 * expand here in the next pass.
 */
export function Pipeline() {
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);

  return (
    <div className="space-y-4">
      <LivePipeline selectedId={selectedEventId} onSelect={setSelectedEventId} />

      <div className="panel panel-pad">
        <h2 className="mb-3 text-sm font-semibold text-text">Status legend</h2>
        <div className="flex flex-wrap gap-2">
          {[
            ...PIPELINE_STAGES.slice(1),
            ...BRANCHES.map((b) => ({ label: b.label, color: b.color })),
          ].map((s) => {
            const c = colorClasses(s.color as Parameters<typeof colorClasses>[0]);
            return (
              <span
                key={s.label}
                className={`inline-flex items-center gap-1.5 rounded-md border ${c.border} ${c.bg} px-2 py-1 text-xs ${c.text}`}
              >
                <span className={`h-2 w-2 rounded-full ${c.dot}`} aria-hidden />
                {s.label}
              </span>
            );
          })}
        </div>
        <p className="mt-3 text-xs text-faint">
          Tokens move live as SSE lifecycle frames arrive. Click any token to open its journey.
        </p>
      </div>

      <EventDetailDrawer eventId={selectedEventId} onClose={() => setSelectedEventId(null)} />
    </div>
  );
}
