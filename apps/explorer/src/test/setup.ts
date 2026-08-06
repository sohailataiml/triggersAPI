import '@testing-library/jest-dom/vitest';
import { afterEach, vi } from 'vitest';
import { cleanup, configure } from '@testing-library/react';

// The default 1000ms async timeout is tight when the suite runs alongside a
// build/dev server on a loaded machine; give findBy*/waitFor more headroom.
configure({ asyncUtilTimeout: 5000 });

afterEach(() => cleanup());

// jsdom lacks matchMedia (framer-motion's useReducedMotion needs it).
if (!window.matchMedia) {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }));
}

// jsdom lacks EventSource; provide a no-op so useSSE can construct one in tests.
if (!('EventSource' in globalThis)) {
  class FakeEventSource {
    close() {}
    addEventListener() {}
    onopen: (() => void) | null = null;
    onerror: (() => void) | null = null;
  }
  (globalThis as unknown as { EventSource: unknown }).EventSource = FakeEventSource;
}
