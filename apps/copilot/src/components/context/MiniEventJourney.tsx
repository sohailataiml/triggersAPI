import { Check } from 'lucide-react';
import { TONE_CLASSES, type StatusMeta } from '../../lib/status';
import type { DeliveryStatus } from '../../types';

type Stage = { key: string; label: string; tone: StatusMeta['tone'] };

const MAIN_PATH: Stage[] = [
  { key: 'ingested', label: 'Ingested', tone: 'ingested' },
  { key: 'pending', label: 'Pending', tone: 'pending' },
  { key: 'leased', label: 'Leased', tone: 'leased' },
  { key: 'acknowledged', label: 'Acknowledged', tone: 'ack' },
];

/** Which main-path stage a delivery status corresponds to. */
const STAGE_INDEX: Record<DeliveryStatus, number> = {
  PENDING: 1,
  RETRY_SCHEDULED: 1,
  LEASED: 2,
  ACKNOWLEDGED: 3,
  DEAD_LETTER: 2,
};

/**
 * The reliability story in one column: the happy path, plus the branches that
 * make this platform interesting. Branch chips light up only when the delivery
 * has actually taken them, so the diagram never implies state that isn't real.
 */
export function MiniEventJourney({
  status,
  attemptCount,
  replayCount,
}: {
  status: DeliveryStatus | null;
  attemptCount: number;
  replayCount: number;
}) {
  const activeIndex = status ? STAGE_INDEX[status] : -1;
  const retried = status === 'RETRY_SCHEDULED' || attemptCount > 1;
  const deadLettered = status === 'DEAD_LETTER';
  const replayed = replayCount > 0;

  return (
    <ol className="space-y-0">
      {MAIN_PATH.map((stage, index) => {
        const classes = TONE_CLASSES[stage.tone];
        const isActive = index === activeIndex && !deadLettered;
        const isDone = index < activeIndex || (index === activeIndex && status === 'ACKNOWLEDGED');

        return (
          <li key={stage.key}>
            <div className="flex items-center gap-2.5">
              <span
                className={`grid h-5 w-5 shrink-0 place-items-center rounded-full border transition ${
                  isActive || isDone
                    ? `${classes.border} ${classes.bg} ${classes.text}`
                    : 'border-border bg-surface-2 text-faint'
                } ${isActive ? 'animate-pulse-ring' : ''}`}
                style={
                  isActive
                    ? ({ ['--tw-ring-color' as string]: 'var(--st-leased)' } as never)
                    : undefined
                }
              >
                {isDone ? (
                  <Check size={11} aria-hidden />
                ) : (
                  <span
                    className={`h-1.5 w-1.5 rounded-full ${isActive ? classes.dot : 'bg-faint'}`}
                  />
                )}
              </span>
              <span
                className={`text-sm ${isActive ? `font-medium ${classes.text}` : isDone ? 'text-muted' : 'text-faint'}`}
              >
                {stage.label}
              </span>
            </div>
            {index < MAIN_PATH.length - 1 && (
              <span
                className={`ml-[0.6rem] block h-4 w-px ${index < activeIndex ? 'bg-border-strong' : 'bg-border'}`}
                aria-hidden
              />
            )}
          </li>
        );
      })}

      {(retried || deadLettered || replayed) && (
        <li className="mt-3 flex flex-wrap gap-1.5 border-t border-border pt-3">
          {retried && (
            <Branch tone="retry" label={`Retried · attempt ${Math.max(attemptCount, 1)}`} />
          )}
          {deadLettered && <Branch tone="dead" label="Dead letter" />}
          {replayed && <Branch tone="replay" label={`Replayed ×${replayCount}`} />}
        </li>
      )}
    </ol>
  );
}

function Branch({ tone, label }: { tone: StatusMeta['tone']; label: string }) {
  const classes = TONE_CLASSES[tone];
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs font-medium ${classes.border} ${classes.bg} ${classes.text}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${classes.dot}`} aria-hidden />
      {label}
    </span>
  );
}
