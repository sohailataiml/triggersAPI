import { createContext, useContext } from 'react';
import { ApiClient } from '../api';
import type { Settings } from '../types';

interface ApiContextValue {
  api: ApiClient;
  settings: Settings;
}

const ApiContext = createContext<ApiContextValue | null>(null);

export function ApiProvider({
  api,
  settings,
  children,
}: {
  api: ApiClient;
  settings: Settings;
  children: React.ReactNode;
}) {
  return <ApiContext.Provider value={{ api, settings }}>{children}</ApiContext.Provider>;
}

export function useApi(): ApiClient {
  const ctx = useContext(ApiContext);
  if (!ctx) throw new Error('useApi must be used within ApiProvider');
  return ctx.api;
}

export function useSettings(): Settings {
  const ctx = useContext(ApiContext);
  if (!ctx) throw new Error('useSettings must be used within ApiProvider');
  return ctx.settings;
}
