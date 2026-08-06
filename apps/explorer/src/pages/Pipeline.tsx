import { useState } from 'react';
import { Maximize2 } from 'lucide-react';
import { LivePipeline } from '../components/dashboard/LivePipeline';
import { EventFocusCard } from '../components/pipeline/EventFocusCard';
import { DemoMode } from '../components/pipeline/DemoMode';
import { PIPELINE_STAGES } from '../hooks/useRecentEvents';
import { colorClasses } from '../lib/status';

const BRANCHES: Array<{ label: string; color: Parameters<typeof colorClasses>[0] }> = [
  { label: 'Retry', color: 'retry' },
  { label: 'Dead letter', color: 'dead' },
  { label: 'Replayed', color: 'replay' },
];

/** Detailed real-time pipeline view + full-screen Demo Mode for presentations. */
export function Pipeline() {
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const [demoOpen, setDemoOpen] = useState(false);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold text-text">Pipeline</h2>
          <p className="text-xs text-muted">Real-time event journey across delivery stages</p>
        </div>
        <button type="button" className="btn" onClick={() => setDemoOpen(true)}>
          <Maximize2 size={15} aria-hidden />
          Demo mode
        </button>
      </div>

      <LivePipeline selectedId={selectedEventId} onSelect={setSelectedEventId} />

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="panel panel-pad">
          <h2 className="mb-3 text-sm font-semibold text-text">Focused event</h2>
          <EventFocusCard eventId={selectedEventId} />
        </div>

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
            Tokens move live as SSE lifecycle frames arrive. Click any token to focus it, or open{' '}
            <strong className="text-muted">Demo mode</strong> for a full-screen presentation.
          </p>
        </div>
      </div>

      <DemoMode
        open={demoOpen}
        onClose={() => setDemoOpen(false)}
        selectedId={selectedEventId}
        onSelect={setSelectedEventId}
      />
    </div>
  );
}
