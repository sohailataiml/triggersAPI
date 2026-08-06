import type { LucideIcon } from 'lucide-react';
import { colorClasses, type StageMeta } from '../../lib/status';

export interface MetricCardProps {
  icon: LucideIcon;
  label: string;
  value: number | string | null | undefined;
  context?: string;
  tooltip?: string;
  color?: StageMeta['color'] | 'accent';
  loading?: boolean;
}

/**
 * Polished KPI card. No fabricated trend arrows — this platform has no
 * historical time-series, so we show only the current value + static context.
 */
export function MetricCard({
  icon: Icon,
  label,
  value,
  context,
  tooltip,
  color = 'accent',
  loading,
}: MetricCardProps) {
  const tint =
    color === 'accent'
      ? { text: 'text-accent', bg: 'bg-accent-soft', border: 'border-accent/30' }
      : colorClasses(color);

  return (
    <div
      className="panel panel-pad group relative flex flex-col gap-2"
      title={tooltip}
      aria-label={tooltip ? `${label}: ${tooltip}` : label}
    >
      <div className="flex items-center justify-between">
        <span className="field-label">{label}</span>
        <span
          className={`grid h-7 w-7 place-items-center rounded-lg border ${tint.border} ${tint.bg}`}
        >
          <Icon size={15} className={tint.text} aria-hidden />
        </span>
      </div>
      {loading ? (
        <div className="h-8 w-16 animate-pulse rounded bg-surface-2" aria-hidden />
      ) : (
        <div className="text-2xl font-semibold tabular-nums tracking-tight text-text">
          {value ?? '—'}
        </div>
      )}
      {context && <div className="text-xs text-faint">{context}</div>}
    </div>
  );
}
