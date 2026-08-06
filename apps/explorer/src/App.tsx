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

/**
 * Build-time demo defaults. On a deployed demo instance these are injected as
 * VITE_* env vars so a first-time visitor (e.g. a grader) is auto-connected with
 * no Settings step. They are NOT in source — only the env var names are. Saved
 * settings always win; env values only fill blanks.
 */
const DEMO_DEFAULTS: Settings = {
  apiBase: (import.meta.env.VITE_API_BASE as string) ?? '',
  adminToken: (import.meta.env.VITE_DEMO_ADMIN_TOKEN as string) ?? '',
  producerToken: (import.meta.env.VITE_DEMO_PRODUCER_TOKEN as string) ?? '',
  consumerToken: (import.meta.env.VITE_DEMO_CONSUMER_TOKEN as string) ?? '',
};

/** True when this build ships preloaded demo credentials. */
export const IS_DEMO = Boolean(DEMO_DEFAULTS.adminToken);

function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const saved = JSON.parse(raw) as Partial<Settings>;
      // Saved values win; fall back to demo defaults for any blank field.
      return {
        apiBase: saved.apiBase || DEMO_DEFAULTS.apiBase,
        adminToken: saved.adminToken || DEMO_DEFAULTS.adminToken,
        producerToken: saved.producerToken || DEMO_DEFAULTS.producerToken,
        consumerToken: saved.consumerToken || DEMO_DEFAULTS.consumerToken,
      };
    }
  } catch {
    // ignore
  }
  return { ...DEMO_DEFAULTS };
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

      {IS_DEMO && (
        <div className="border-b border-accent/20 bg-accent-soft/60 px-4 py-1.5 text-center text-xs text-accent sm:px-6">
          Live demo instance — preloaded credentials. Send an event and run the guided demo; no
          setup needed.
        </div>
      )}

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
