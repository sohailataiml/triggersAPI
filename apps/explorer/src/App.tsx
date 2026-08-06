import { useCallback, useMemo, useRef, useState } from 'react';
import { KeyRound } from 'lucide-react';
import { ApiClient } from './api';
import { useSSE } from './useSSE';
import { ApiProvider } from './app/apiContext';
import { useInvalidateAll } from './hooks/queries';
import { Header } from './components/layout/Header';
import type { Section } from './components/layout/Navigation';
import { SettingsDrawer } from './components/layout/SettingsDrawer';
import { Dashboard } from './pages/Dashboard';
import { Pipeline } from './pages/Pipeline';
import { Events } from './pages/Events';
import { System } from './pages/System';
import type { Settings } from './types';

const STORAGE_KEY = 'triggers-explorer-settings';

function loadSettings(): Settings {
  const defaults: Settings = { apiBase: '', adminToken: '', producerToken: '', consumerToken: '' };
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return { ...defaults, ...(JSON.parse(raw) as Partial<Settings>) };
  } catch {
    // ignore
  }
  return defaults;
}

export function App() {
  const [settings, setSettings] = useState<Settings>(loadSettings);
  const [section, setSection] = useState<Section>('dashboard');
  const [settingsOpen, setSettingsOpen] = useState(!loadSettings().adminToken);

  const api = useMemo(() => new ApiClient(settings), [settings]);
  const invalidate = useInvalidateAll();

  // Coalesce bursts of SSE frames into one refetch; reconcile fully on reconnect.
  const debounceRef = useRef<number | undefined>(undefined);
  const debouncedInvalidate = useCallback(() => {
    window.clearTimeout(debounceRef.current);
    debounceRef.current = window.setTimeout(invalidate, 300);
  }, [invalidate]);

  useSSE(settings.apiBase, settings.adminToken, {
    onFresh: debouncedInvalidate,
    onReconnect: invalidate,
  });

  const saveSettings = (s: Settings) => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
    setSettings(s);
  };

  const configured = Boolean(settings.adminToken);

  return (
    <ApiProvider api={api} settings={settings}>
      <Header
        active={section}
        onNavigate={setSection}
        onOpenSettings={() => setSettingsOpen(true)}
        configured={configured}
      />

      <main className="mx-auto max-w-7xl px-4 py-5 sm:px-6">
        {!configured ? (
          <SetupHero onOpenSettings={() => setSettingsOpen(true)} />
        ) : section === 'dashboard' ? (
          <Dashboard />
        ) : section === 'pipeline' ? (
          <Pipeline />
        ) : section === 'events' ? (
          <Events />
        ) : (
          <System />
        )}
      </main>

      <SettingsDrawer
        open={settingsOpen}
        settings={settings}
        onClose={() => setSettingsOpen(false)}
        onSave={saveSettings}
      />
    </ApiProvider>
  );
}

function SetupHero({ onOpenSettings }: { onOpenSettings: () => void }) {
  return (
    <div className="mx-auto mt-16 max-w-lg text-center">
      <span className="mx-auto grid h-14 w-14 place-items-center rounded-2xl border border-accent/30 bg-accent-soft text-accent shadow-glow">
        <KeyRound size={24} aria-hidden />
      </span>
      <h2 className="mt-5 text-lg font-semibold text-text">Connect to your workspace</h2>
      <p className="mt-2 text-sm text-muted">
        Paste the ADMIN and PRODUCER tokens printed by{' '}
        <code className="rounded bg-surface-2 px-1.5 py-0.5 font-mono text-xs">pnpm db:seed</code>{' '}
        to start ingesting events and watching them flow through the pipeline.
      </p>
      <button type="button" className="btn btn-primary mx-auto mt-5" onClick={onOpenSettings}>
        Open connection settings
      </button>
    </div>
  );
}
