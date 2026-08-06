import { useQuery } from '@tanstack/react-query';
import { Database, Radio, Server } from 'lucide-react';
import { useSettings } from '../app/apiContext';
import { useOverview } from '../hooks/queries';
import { useEventStore } from '../store/eventStore';

type Health = 'ok' | 'error';
interface Readiness {
  status: string;
  checks: { postgres: Health; redis: Health };
}

function ServiceCard({
  icon: Icon,
  name,
  state,
  detail,
}: {
  icon: typeof Server;
  name: string;
  state: 'healthy' | 'offline' | 'unknown';
  detail: string;
}) {
  const tint = {
    healthy: { text: 'text-ack', dot: 'bg-ack', label: 'Healthy' },
    offline: { text: 'text-dead', dot: 'bg-dead', label: 'Offline' },
    unknown: { text: 'text-muted', dot: 'bg-faint', label: 'Unknown' },
  }[state];
  return (
    <div className="panel panel-pad flex items-center gap-3">
      <span className="grid h-9 w-9 place-items-center rounded-lg border border-border bg-surface-2">
        <Icon size={16} className="text-muted" aria-hidden />
      </span>
      <div className="flex-1">
        <div className="text-sm font-medium text-text">{name}</div>
        <div className="text-xs text-faint">{detail}</div>
      </div>
      <span className={`inline-flex items-center gap-1.5 text-xs font-medium ${tint.text}`}>
        <span className={`h-2 w-2 rounded-full ${tint.dot}`} aria-hidden />
        {tint.label}
      </span>
    </div>
  );
}

/** Real service health from /health/ready + the live SSE connection state. */
export function System() {
  const { apiBase } = useSettings();
  const connected = useEventStore((s) => s.connected);
  const { data: overview } = useOverview();

  const { data, isError, isLoading } = useQuery<Readiness>({
    queryKey: ['readiness', apiBase],
    queryFn: async () => {
      const res = await fetch(`${apiBase}/health/ready`);
      return (await res.json()) as Readiness;
    },
    refetchInterval: 5000,
  });

  const apiState = isLoading ? 'unknown' : isError ? 'offline' : 'healthy';
  const pg = data?.checks.postgres;
  const redis = data?.checks.redis;

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <ServiceCard
          icon={Server}
          name="API"
          state={apiState}
          detail={`GET ${apiBase || ''}/health/ready`}
        />
        <ServiceCard
          icon={Database}
          name="PostgreSQL"
          state={pg === 'ok' ? 'healthy' : pg === 'error' ? 'offline' : 'unknown'}
          detail="Source of truth"
        />
        <ServiceCard
          icon={Server}
          name="Redis"
          state={redis === 'ok' ? 'healthy' : redis === 'error' ? 'offline' : 'unknown'}
          detail="Streams · Pub/Sub coordination"
        />
        <ServiceCard
          icon={Radio}
          name="SSE stream"
          state={connected ? 'healthy' : 'offline'}
          detail="Explorer live activity"
        />
      </div>

      <div className="panel panel-pad">
        <h2 className="mb-3 text-sm font-semibold text-text">Live counts</h2>
        <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-3">
          {[
            ['Events', overview?.totalEvents],
            ['Pending', overview?.pending],
            ['Active leases', overview?.activeLeases],
            ['Retry queue', overview?.retryScheduled],
            ['Dead letters', overview?.deadLetter],
            ['Acknowledged', overview?.acknowledged],
          ].map(([label, value]) => (
            <div
              key={label as string}
              className="rounded-lg border border-border bg-bg/40 px-3 py-2"
            >
              <div className="text-xs text-muted">{label}</div>
              <div className="text-lg font-semibold tabular-nums text-text">{value ?? '—'}</div>
            </div>
          ))}
        </div>
        <p className="mt-3 text-xs text-faint">
          Time-series charts require a metrics history store, which this prototype does not keep —
          Prometheus scrapes <code className="font-mono">/metrics</code> for that. Values above are
          point-in-time.
        </p>
      </div>
    </div>
  );
}
