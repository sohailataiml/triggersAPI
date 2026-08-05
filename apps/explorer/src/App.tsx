import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ApiClient } from './api';
import { useSSE } from './useSSE';
import type { DeliveryListItem, Overview, Settings, Subscription } from './types';
import { SettingsBar } from './components/SettingsBar';
import { OverviewCards } from './components/Overview';
import { ActivityStream } from './components/ActivityStream';
import { IngestForm } from './components/IngestForm';
import { Subscriptions } from './components/Subscriptions';
import { Deliveries } from './components/Deliveries';

const STORAGE_KEY = 'triggers-explorer-settings';

function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw) as Settings;
  } catch {
    // ignore
  }
  return { apiBase: '', adminToken: '', producerToken: '' };
}

export function App() {
  const [settings, setSettings] = useState<Settings>(loadSettings);
  const [overview, setOverview] = useState<Overview | null>(null);
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
  const [deliveries, setDeliveries] = useState<DeliveryListItem[]>([]);
  const [filters, setFilters] = useState({ status: '', subscriptionId: '', source: '' });
  const [error, setError] = useState<string | null>(null);

  const api = useMemo(() => new ApiClient(settings), [settings]);
  const { activities, connected, bump } = useSSE(settings.apiBase, settings.adminToken);

  const saveSettings = (s: Settings) => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
    setSettings(s);
  };

  const refresh = useCallback(async () => {
    if (!settings.adminToken) return;
    setError(null);
    try {
      const [ov, subs, dels] = await Promise.all([
        api.overview(),
        api.subscriptions(),
        api.deliveries(filters),
      ]);
      setOverview(ov);
      setSubscriptions(subs);
      setDeliveries(dels);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load data');
    }
  }, [api, settings.adminToken, filters]);

  // Initial + filter-driven load.
  useEffect(() => {
    void refresh();
  }, [refresh]);

  // Refresh (debounced) whenever new activity arrives over SSE.
  const bumpTimer = useRef<number | undefined>(undefined);
  useEffect(() => {
    if (!bump) return;
    window.clearTimeout(bumpTimer.current);
    bumpTimer.current = window.setTimeout(() => void refresh(), 300);
    return () => window.clearTimeout(bumpTimer.current);
  }, [bump, refresh]);

  const configured = Boolean(settings.adminToken);

  return (
    <div className="app">
      <header className="masthead">
        <div>
          <h1>
            Triggers<span className="accent">API</span> Explorer
          </h1>
          <div className="tagline">event ingestion · lease delivery · retries · dead-letter</div>
        </div>
        <span className={`conn ${connected ? 'live' : ''}`}>
          <span className="dot" /> {connected ? 'stream live' : 'stream offline'}
        </span>
      </header>

      <SettingsBar settings={settings} onSave={saveSettings} />

      {!configured && (
        <div className="setup-note">
          Add your ADMIN and PRODUCER tokens in <b>Connection settings</b> to begin. Run{' '}
          <code>pnpm db:seed</code> to generate them.
        </div>
      )}

      {error && <div className="setup-note err">{error}</div>}

      {configured && (
        <>
          <div className="panel">
            <h2>Overview</h2>
            <OverviewCards data={overview} />
          </div>

          <div className="grid">
            <div>
              <IngestForm api={api} onIngested={refresh} />
              <Subscriptions api={api} subscriptions={subscriptions} onChange={refresh} />
              <Deliveries
                api={api}
                deliveries={deliveries}
                subscriptions={subscriptions}
                filters={filters}
                setFilters={setFilters}
                onChange={refresh}
              />
            </div>
            <div>
              <ActivityStream activities={activities} connected={connected} />
            </div>
          </div>
        </>
      )}
    </div>
  );
}
