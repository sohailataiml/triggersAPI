import { CheckCircle2, Clock, Inbox, Percent, RefreshCw, Skull, Waves } from 'lucide-react';
import { useOverview } from '../../hooks/queries';
import { MetricCard } from './MetricCard';

/**
 * KPI cards from the live overview. Only values the API actually reports —
 * no fabricated trends (this platform has no historical time-series).
 * Success rate is derived from acknowledged vs. dead-lettered terminal counts.
 */
export function KpiRow() {
  const { data, isLoading } = useOverview();

  const terminal = (data?.acknowledged ?? 0) + (data?.deadLetter ?? 0);
  const successRate =
    terminal > 0 ? Math.round(((data?.acknowledged ?? 0) / terminal) * 100) : null;

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-7">
      <MetricCard
        icon={Waves}
        label="Events"
        value={data?.totalEvents}
        color="ingested"
        loading={isLoading}
        context="received total"
        tooltip="Total events ingested in this workspace"
      />
      <MetricCard
        icon={Clock}
        label="Pending"
        value={data?.pending}
        color="pending"
        loading={isLoading}
        context="awaiting a consumer"
        tooltip="Deliveries waiting to be leased"
      />
      <MetricCard
        icon={Inbox}
        label="Active leases"
        value={data?.activeLeases}
        color="leased"
        loading={isLoading}
        context="in flight now"
        tooltip="Deliveries currently leased with an unexpired visibility timeout"
      />
      <MetricCard
        icon={RefreshCw}
        label="Retry queue"
        value={data?.retryScheduled}
        color="retry"
        loading={isLoading}
        context="backoff scheduled"
        tooltip="Deliveries scheduled for a retry after failure"
      />
      <MetricCard
        icon={Skull}
        label="Dead letters"
        value={data?.deadLetter}
        color="dead"
        loading={isLoading}
        context="need replay"
        tooltip="Deliveries that exhausted their retries"
      />
      <MetricCard
        icon={CheckCircle2}
        label="Acknowledged"
        value={data?.acknowledged}
        color="ack"
        loading={isLoading}
        context="completed"
        tooltip="Successfully acknowledged deliveries"
      />
      <MetricCard
        icon={Percent}
        label="Success rate"
        value={successRate === null ? '—' : `${successRate}%`}
        color="ack"
        loading={isLoading}
        context={successRate === null ? 'no terminal deliveries' : 'ack vs. dead-letter'}
        tooltip="Acknowledged ÷ (acknowledged + dead-lettered)"
      />
    </div>
  );
}
