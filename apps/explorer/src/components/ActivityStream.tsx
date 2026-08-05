import type { Activity, ActivityType } from '../types';

const TYPE_CLASS: Record<ActivityType, string> = {
  'event.ingested': 'ing',
  'delivery.created': 'crt',
  'delivery.leased': 'lea',
  'delivery.acknowledged': 'ack',
  'delivery.retry_scheduled': 'ret',
  'delivery.dead_lettered': 'dead',
  'delivery.replayed': 'rep',
};

const TYPE_LABEL: Record<ActivityType, string> = {
  'event.ingested': 'INGESTED',
  'delivery.created': 'CREATED',
  'delivery.leased': 'LEASED',
  'delivery.acknowledged': 'ACKED',
  'delivery.retry_scheduled': 'RETRY',
  'delivery.dead_lettered': 'DEAD',
  'delivery.replayed': 'REPLAYED',
};

function shortId(id?: string): string {
  return id ? id.slice(0, 8) : '';
}

export function ActivityStream({
  activities,
  connected,
}: {
  activities: Activity[];
  connected: boolean;
}) {
  return (
    <div className="panel">
      <h2>
        Live stream{' '}
        <span className={`conn ${connected ? 'live' : ''}`}>
          <span className="dot" /> {connected ? 'connected' : 'offline'}
        </span>
      </h2>
      <div className="stream">
        {activities.length === 0 && <div className="dim">Waiting for activity…</div>}
        {activities.map((a, i) => (
          <div className="act" key={`${a.timestamp}-${i}`}>
            <span className="t">{new Date(a.timestamp).toLocaleTimeString()}</span>
            <span className={`type ${TYPE_CLASS[a.type] ?? ''}`}>
              {TYPE_LABEL[a.type] ?? a.type}
            </span>
            <span className="dim">
              {a.deliveryId ? `dlv ${shortId(a.deliveryId)}` : `evt ${shortId(a.eventId)}`}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
