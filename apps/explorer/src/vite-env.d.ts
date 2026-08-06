/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Base URL of the API (e.g. https://triggers-api.onrender.com). Blank = same origin. */
  readonly VITE_API_BASE?: string;
  /** Preloaded demo credentials for a public demo instance (never committed to source). */
  readonly VITE_DEMO_ADMIN_TOKEN?: string;
  readonly VITE_DEMO_PRODUCER_TOKEN?: string;
  readonly VITE_DEMO_CONSUMER_TOKEN?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
