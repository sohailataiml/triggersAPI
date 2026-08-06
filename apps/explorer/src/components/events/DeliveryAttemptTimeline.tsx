import { useMemo } from 'react';
import { useEventStore } from '../../store/eventStore';
import { ACTIVITY_META, colorClasses } from '../../lib/status';
import { countdown, durationBetween, preciseTime } from '../../lib/format';
import type { DeliveryListItem } from '../../types';

interface Snapshot {
  status: DeliveryListItem['status'];
  attemptCount: number;
  leaseUntil: string | null;
  availableAt: string;
  deadLetteredAt: string | null;
  acknowledgedAt: string | null;
  lastErrorCode: string | null;
}

/**
 * Attempt-by-attempt timeline for one delivery, reconstructed from the live SSE
 * lifecycle feed (each frame carries attempt + reason + timestamp) and enriched
 * by the current delivery snapshot. It invents nothing the backend didn't emit:
 * frames not observed in this session simply aren't shown, and the snapshot
 * supplies the current lease/next-retry countdown.
 */
export function DeliveryAttemptTimeline({
  deliveryId,
  eventId,
  snapshot,
}: {
  deliveryId: string;
  eventId?: string;
  snapshot?: Snapshot | null;
}) {
  const activities = useEventStore((s) => s.activities);

  const frames = useMemo(() => {
    return activities
      .filter(
        (a) =>
          a.deliveryId === deliveryId ||
          (a.type === 'event.ingested' && eventId && a.eventId === eventId),
      )
      .slice()
      .sort((x, y) => new Date(x.timestamp).getTime() - new Date(y.timestamp).getTime());
  }, [activities, deliveryId, eventId]);

  // Pair each lease with the outcome that follows it, to compute durations.
  const rows = useMemo(() => {
    const out: Array<{
      id: string;
      color: ReturnType<typeof colorClasses>;
      label: string;
      sub: string | null;
      timestamp: string;
      icon: (typeof ACTIVITY_META)['delivery.leased']['icon'];
    }> = [];
    let lastLeaseAt: string | null = null;
    for (const a of frames) {
      const meta = ACTIVITY_META[a.type];
      if (!meta) continue;
      const attempt = a.summary?.attempt as number | undefined;
      const reason = (a.summary?.reason as string | undefined)?.replace(/_/g, ' ');
      let label = meta.action;
      let sub: string | null = null;

      switch (a.type) {
        case 'delivery.leased':
          lastLeaseAt = a.timestamp;
          label = `Attempt ${attempt ?? '?'} — leased`;
          break;
        case 'delivery.acknowledged':
          label = 'Acknowledged';
          sub = durationBetween(lastLeaseAt, a.timestamp)
            ? `completed in ${durationBetween(lastLeaseAt, a.timestamp)}`
            : null;
          break;
        case 'delivery.retry_scheduled':
          label = `Attempt ${attempt ?? '?'} failed`;
          sub = [reason, 'retry scheduled'].filter(Boolean).join(' · ');
          break;
        case 'delivery.dead_lettered':
          label = `Attempt ${attempt ?? '?'} failed`;
          sub = [reason, 'moved to dead letter'].filter(Boolean).join(' · ');
          break;
        case 'delivery.replayed':
          label = 'Replayed → pending';
          sub = reason ?? null;
          break;
        case 'event.ingested':
          label = 'Event received';
          break;
        default:
          break;
      }

      out.push({
        id: a.id,
        color: colorClasses(meta.color),
        label,
        sub,
        timestamp: a.timestamp,
        icon: meta.icon,
      });
    }
    return out;
  }, [frames]);

  // Live tail from the snapshot: current lease / next-retry countdowns.
  const tail = useMemo(() => {
    if (!snapshot) return null;
    if (snapshot.status === 'LEASED' && snapshot.leaseUntil) {
      const c = countdown(snapshot.leaseUntil);
      return {
        color: colorClasses('leased'),
        label: `Lease active (attempt ${snapshot.attemptCount})`,
        sub: `expires ${c.label}`,
      };
    }
    if (snapshot.status === 'RETRY_SCHEDULED') {
      const c = countdown(snapshot.availableAt);
      return {
        color: colorClasses('retry'),
        label: 'Retry scheduled',
        sub: c.expired ? 'available now' : `next attempt ${c.label}`,
      };
    }
    if (snapshot.status === 'DEAD_LETTER') {
      return {
        color: colorClasses('dead'),
        label: 'In dead letter',
        sub: snapshot.lastErrorCode
          ? `reason: ${snapshot.lastErrorCode.replace(/_/g, ' ')} · replay to recover`
          : 'replay to recover',
      };
    }
    return null;
  }, [snapshot]);

  if (rows.length === 0 && !tail) {
    return (
      <p className="text-sm text-muted">
        No attempt frames captured for this delivery in the current session. Lease or replay it and
        the attempts will stream in here.
      </p>
    );
  }

  return (
    <ol className="relative ml-2 space-y-3 border-l border-border pl-5">
      {rows.map((r) => {
        const Icon = r.icon;
        return (
          <li key={r.id} className="relative">
            <span
              className={`absolute -left-[27px] grid h-5 w-5 place-items-center rounded-full border ${r.color.border} ${r.color.bg}`}
            >
              <Icon size={11} className={r.color.text} aria-hidden />
            </span>
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-sm font-medium text-text">{r.label}</span>
              <time className="mono text-[0.7rem] text-faint">{preciseTime(r.timestamp)}</time>
            </div>
            {r.sub && <div className="mt-0.5 text-xs text-muted">{r.sub}</div>}
          </li>
        );
      })}
      {tail && (
        <li className="relative">
          <span
            className={`absolute -left-[27px] grid h-5 w-5 animate-pulse place-items-center rounded-full border ${tail.color.border} ${tail.color.bg}`}
          >
            <span className={`h-2 w-2 rounded-full ${tail.color.dot}`} aria-hidden />
          </span>
          <div className={`text-sm font-medium ${tail.color.text}`}>{tail.label}</div>
          <div className="mt-0.5 text-xs text-muted">{tail.sub}</div>
        </li>
      )}
    </ol>
  );
}
