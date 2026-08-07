import { Radio } from 'lucide-react';
import { ACTIVITY_META, TONE_CLASSES } from '../../lib/status';
import { relativeTime, shortId } from '../../lib/format';
import { useActivityStore } from '../../store/activityStore';

/**
 * The live lifecycle feed, straight from the platform's SSE stream. This is
 * what makes the Copilot's tool calls visibly real: an ACK in chat shows up
 * here as `delivery.acknowledged` a moment later, from the database.
 */
export function RecentActivity({ limit = 8 }: { limit?: number }) {
  const activities = useActivityStore((state) => state.activities);
  const connected = useActivityStore((state) => state.connected);

  return (
    <section className="panel panel-pad">
      <div className="mb-2.5 flex items-center justify-between">
        <p className="field-label">Live activity</p>
        <span
          className={`inline-flex items-center gap-1.5 text-xs ${connected ? 'text-ack' : 'text-faint'}`}
        >
          <Radio size={12} aria-hidden className={connected ? 'animate-pulse' : ''} />
          {connected ? 'streaming' : 'offline'}
        </span>
      </div>

      {activities.length === 0 ? (
        <p className="py-3 text-center text-xs text-faint">
          No activity yet. Publish an event to see the pipeline move.
        </p>
      ) : (
        <ol className="space-y-1.5">
          {activities.slice(0, limit).map((activity) => {
            const meta = ACTIVITY_META[activity.type];
            const classes = TONE_CLASSES[meta?.tone ?? 'pending'];
            return (
              <li key={activity.id} className="flex items-center gap-2 text-xs">
                <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${classes.dot}`} aria-hidden />
                <span className={`shrink-0 font-medium ${classes.text}`}>
                  {meta?.label ?? activity.type}
                </span>
                <span className="mono truncate text-faint">
                  {shortId(activity.deliveryId ?? activity.eventId)}
                </span>
                <span className="ml-auto shrink-0 text-faint">
                  {relativeTime(activity.timestamp)}
                </span>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
