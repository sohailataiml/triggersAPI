import { Activity, LayoutDashboard, ListTree, ServerCog } from 'lucide-react';

export type Section = 'dashboard' | 'pipeline' | 'events' | 'system';

const ITEMS: Array<{ id: Section; label: string; icon: typeof Activity }> = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'pipeline', label: 'Pipeline', icon: Activity },
  { id: 'events', label: 'Subscriptions', icon: ListTree },
  { id: 'system', label: 'System', icon: ServerCog },
];

export function Navigation({
  active,
  onChange,
}: {
  active: Section;
  onChange: (s: Section) => void;
}) {
  return (
    <nav
      aria-label="Primary"
      className="flex items-center gap-1 rounded-xl border border-border bg-surface/60 p-1"
    >
      {ITEMS.map((item) => {
        const Icon = item.icon;
        const isActive = active === item.id;
        return (
          <button
            key={item.id}
            type="button"
            onClick={() => onChange(item.id)}
            aria-current={isActive ? 'page' : undefined}
            className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/70 ${
              isActive
                ? 'bg-surface-2 text-text shadow-card'
                : 'text-muted hover:bg-surface-2/60 hover:text-text'
            }`}
          >
            <Icon size={15} aria-hidden />
            {item.label}
          </button>
        );
      })}
    </nav>
  );
}
