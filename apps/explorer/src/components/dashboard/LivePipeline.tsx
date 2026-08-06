import { LayoutGroup, motion, useReducedMotion } from 'framer-motion';
import { Skull } from 'lucide-react';
import { PIPELINE_STAGES, useRecentEvents, type EventToken } from '../../hooks/useRecentEvents';
import { colorClasses } from '../../lib/status';
import { sourceMeta } from '../../lib/samples';
import { shortId } from '../../lib/format';
import { EmptyState } from '../shared/States';

const BRANCH_RING: Record<'retry' | 'replay', string> = {
  retry: 'ring-retry',
  replay: 'ring-replay',
};

/**
 * The centerpiece: a live view of events flowing through the delivery pipeline.
 * Each recent event is a token that slides between stages as SSE frames arrive
 * (shared layoutId → framer-motion animates the move). Dead-lettered events
 * drop into a separate lane. Fully readable with motion disabled.
 */
export function LivePipeline({
  selectedId,
  onSelect,
}: {
  selectedId: string | null;
  onSelect: (eventId: string) => void;
}) {
  const events = useRecentEvents();
  const reduce = useReducedMotion();

  const dead = events.filter((e) => e.branch === 'dead');
  const live = events.filter((e) => e.branch !== 'dead');

  return (
    <div className="panel panel-pad">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold text-text">Live event pipeline</h2>
          <p className="text-xs text-muted">Recent events moving through delivery, in real time</p>
        </div>
        <span className="rounded-md border border-border bg-surface-2/70 px-2 py-0.5 text-xs tabular-nums text-muted">
          {events.length} tracked
        </span>
      </div>

      {events.length === 0 ? (
        <EmptyState
          title="No events yet"
          hint="Send a test event from the composer — it will appear here and flow through the stages."
        />
      ) : (
        <LayoutGroup>
          <div className="overflow-x-auto pb-2">
            <div className="flex min-w-[720px] items-stretch gap-1">
              {PIPELINE_STAGES.map((stage, idx) => {
                const here = live.filter((e) => e.currentIndex === idx);
                const reachedCount = live.filter((e) => e.reachedIndex >= idx).length;
                const c = colorClasses(stage.color);
                const active = reachedCount > 0;
                return (
                  <div key={stage.key} className="flex-1">
                    {/* stage node */}
                    <div className="flex items-center gap-1">
                      <div
                        className={`h-1.5 flex-1 rounded-full ${
                          idx === 0 ? 'opacity-0' : active ? c.dot : 'bg-border'
                        }`}
                      />
                      <span
                        className={`h-2 w-2 shrink-0 rounded-full ${active ? c.dot : 'bg-border'}`}
                      />
                      <div
                        className={`h-1.5 flex-1 rounded-full ${
                          idx === PIPELINE_STAGES.length - 1
                            ? 'opacity-0'
                            : active
                              ? c.dot
                              : 'bg-border'
                        }`}
                      />
                    </div>
                    <div className="mt-1.5 text-center">
                      <div
                        className={`text-[0.7rem] font-medium ${active ? c.text : 'text-faint'}`}
                      >
                        {stage.label}
                      </div>
                    </div>
                    {/* token lane for this stage */}
                    <div className="mt-2 flex min-h-[52px] flex-wrap content-start justify-center gap-1.5">
                      {here.map((e) => (
                        <Token
                          key={e.eventId}
                          token={e}
                          selected={e.eventId === selectedId}
                          reduce={!!reduce}
                          onSelect={onSelect}
                        />
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {dead.length > 0 && (
            <div className="mt-3 flex items-center gap-3 rounded-lg border border-dead/30 bg-dead/5 px-3 py-2">
              <span className="inline-flex items-center gap-1.5 text-xs font-medium text-dead">
                <Skull size={14} aria-hidden /> Dead letter
              </span>
              <div className="flex flex-wrap gap-1.5">
                {dead.map((e) => (
                  <Token
                    key={e.eventId}
                    token={e}
                    selected={e.eventId === selectedId}
                    reduce={!!reduce}
                    onSelect={onSelect}
                  />
                ))}
              </div>
            </div>
          )}
        </LayoutGroup>
      )}
    </div>
  );
}

function Token({
  token,
  selected,
  reduce,
  onSelect,
}: {
  token: EventToken;
  selected: boolean;
  reduce: boolean;
  onSelect: (id: string) => void;
}) {
  const src = sourceMeta(token.source);
  const ring =
    token.branch === 'retry' || token.branch === 'replay'
      ? BRANCH_RING[token.branch]
      : selected
        ? 'ring-accent'
        : 'ring-border-strong';

  return (
    <motion.button
      type="button"
      layoutId={token.eventId}
      layout={!reduce}
      transition={reduce ? { duration: 0 } : { type: 'spring', stiffness: 500, damping: 34 }}
      onClick={() => onSelect(token.eventId)}
      title={`${src.label} · ${token.eventType} · ${shortId(token.eventId)}`}
      aria-label={`${src.label} ${token.eventType} event ${shortId(token.eventId)}`}
      className={`grid h-7 w-7 place-items-center rounded-full bg-surface-2 text-sm ring-2 ${ring} transition hover:scale-110 focus-visible:outline-none focus-visible:ring-accent ${
        selected ? 'scale-110' : ''
      }`}
    >
      <span aria-hidden>{src.glyph}</span>
    </motion.button>
  );
}
