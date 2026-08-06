import { Settings2, Zap } from 'lucide-react';
import { ConnectionIndicator } from './ConnectionIndicator';
import { Navigation, type Section } from './Navigation';
import { ResetButton } from './ResetButton';

export function Header({
  active,
  onNavigate,
  onOpenSettings,
  configured,
}: {
  active: Section;
  onNavigate: (s: Section) => void;
  onOpenSettings: () => void;
  configured: boolean;
}) {
  return (
    <header className="sticky top-0 z-30 border-b border-border bg-bg/80 backdrop-blur-md">
      <div className="mx-auto flex max-w-7xl flex-col gap-3 px-4 py-3 sm:px-6 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-center gap-3">
          <span className="grid h-9 w-9 place-items-center rounded-xl border border-accent/30 bg-accent-soft text-accent shadow-glow">
            <Zap size={18} aria-hidden />
          </span>
          <div>
            <h1 className="text-[0.95rem] font-semibold leading-tight tracking-tight">
              Triggers<span className="text-accent">API</span> Explorer
            </h1>
            <p className="text-xs text-muted">
              Reliable event delivery for workflows, agents, and Zapier
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 lg:gap-3">
          <Navigation active={active} onChange={onNavigate} />
          <span className="hidden items-center gap-1.5 rounded-full border border-border bg-surface-2/70 px-2.5 py-1 text-xs font-medium text-muted sm:inline-flex">
            <span className="h-1.5 w-1.5 rounded-full bg-ingested" aria-hidden />
            local
          </span>
          <ConnectionIndicator />
          {configured && <ResetButton />}
          <button
            type="button"
            onClick={onOpenSettings}
            className="btn btn-ghost h-8 px-2.5"
            aria-label="Connection settings"
          >
            <Settings2 size={15} aria-hidden />
            <span className={configured ? 'hidden sm:inline' : ''}>Settings</span>
          </button>
        </div>
      </div>
    </header>
  );
}
