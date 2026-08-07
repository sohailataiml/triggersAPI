import { TONE_CLASSES, type StatusMeta } from '../../lib/status';

export function StatusBadge({
  label,
  tone,
  pulse = false,
}: {
  label: string;
  tone: StatusMeta['tone'];
  pulse?: boolean;
}) {
  const classes = TONE_CLASSES[tone];
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs font-medium ${classes.border} ${classes.bg} ${classes.text}`}
    >
      <span
        className={`h-1.5 w-1.5 rounded-full ${classes.dot} ${pulse ? 'animate-pulse' : ''}`}
        aria-hidden
      />
      {label}
    </span>
  );
}
