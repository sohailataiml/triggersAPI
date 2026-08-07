import '@testing-library/jest-dom/vitest';

/** jsdom has no EventSource; the activity stream hook needs a stub. */
class MockEventSource {
  static instances: MockEventSource[] = [];
  onopen: ((event: Event) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;
  readonly listeners = new Map<string, EventListener[]>();

  constructor(readonly url: string) {
    MockEventSource.instances.push(this);
  }

  addEventListener(type: string, listener: EventListener): void {
    this.listeners.set(type, [...(this.listeners.get(type) ?? []), listener]);
  }

  removeEventListener(): void {
    /* no-op */
  }

  close(): void {
    /* no-op */
  }

  /** Test helper: deliver a frame as the server would. */
  emit(type: string, data: unknown, id = `${Date.now()}`): void {
    const event = new MessageEvent(type, { data: JSON.stringify(data), lastEventId: id });
    for (const listener of this.listeners.get(type) ?? []) listener(event);
  }
}

Object.defineProperty(globalThis, 'EventSource', {
  writable: true,
  configurable: true,
  value: MockEventSource,
});

export { MockEventSource };
