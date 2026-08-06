import { colorClasses, DELIVERY_STATUS_META } from '../../lib/status';
import type { DeliveryStatus } from '../../types';

/** Status pill with icon + label — never color-only (icon + text always shown). */
export function StatusBadge({
  status,
  size = 'md',
}: {
  status: DeliveryStatus;
  size?: 'sm' | 'md';
}) {
  const meta = DELIVERY_STATUS_META[status];
  const c = colorClasses(meta.color);
  const Icon = meta.icon;
  const pad = size === 'sm' ? 'px-1.5 py-0.5 text-[0.68rem]' : 'px-2 py-0.5 text-xs';
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-md border ${c.border} ${c.bg} ${c.text} ${pad} font-medium`}
    >
      <Icon size={size === 'sm' ? 11 : 13} aria-hidden />
      {meta.label}
    </span>
  );
}
