import type { ReactElement } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render } from '@testing-library/react';
import { ApiProvider } from '../app/apiContext';
import type { ApiClient } from '../api';
import type { Settings } from '../types';

const FULL_SETTINGS: Settings = {
  apiBase: '',
  adminToken: 'trg_admin',
  producerToken: 'trg_producer',
  consumerToken: 'trg_consumer',
};

/** Render a component inside the Query + Api providers with a stub client. */
export function renderWithProviders(
  ui: ReactElement,
  opts: { api?: Partial<ApiClient>; settings?: Partial<Settings> } = {},
) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  const api = (opts.api ?? {}) as ApiClient;
  const settings = { ...FULL_SETTINGS, ...opts.settings };
  return render(
    <QueryClientProvider client={queryClient}>
      <ApiProvider api={api} settings={settings}>
        {ui}
      </ApiProvider>
    </QueryClientProvider>,
  );
}
