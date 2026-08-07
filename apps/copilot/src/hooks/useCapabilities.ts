import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchCapabilities, reconnectMcp } from '../api/copilotClient';
import type { Capabilities } from '../types';

export type ConnectionPhase = 'connecting' | 'ready' | 'unavailable';

/** Backoff between connection attempts, then a steady slow poll. */
const RETRY_SCHEDULE_MS = [400, 800, 1500, 2500, 4000, 6000];
const STEADY_RETRY_MS = 8000;
/** How long to keep showing "connecting" before admitting something is wrong. */
const CONNECTING_GRACE_MS = 20_000;

/**
 * Resolve what this deployment can do, and keep trying until it can.
 *
 * A demo starts five processes at once, so the Copilot's first capability check
 * routinely lands before the MCP server is listening. A single fetch would
 * strand the viewer on a setup screen that a page reload would have fixed —
 * so this retries with backoff, then keeps polling slowly, and recovers on its
 * own the moment MCP comes up.
 *
 * A missing model key is treated differently: no amount of retrying creates an
 * environment variable, so that surfaces immediately.
 */
export function useCapabilities(): {
  capabilities: Capabilities | null;
  phase: ConnectionPhase;
  reconnecting: boolean;
  reconnect: () => Promise<void>;
} {
  const [capabilities, setCapabilities] = useState<Capabilities | null>(null);
  const [phase, setPhase] = useState<ConnectionPhase>('connecting');
  const [reconnecting, setReconnecting] = useState(false);

  const attemptRef = useRef(0);
  const startedAtRef = useRef(Date.now());
  const timerRef = useRef<number | undefined>(undefined);
  const cancelledRef = useRef(false);

  const poll = useCallback(async (): Promise<void> => {
    if (cancelledRef.current) return;

    let next: Capabilities | null = null;
    try {
      next = await fetchCapabilities();
    } catch {
      next = null;
    }
    if (cancelledRef.current) return;

    if (next) setCapabilities(next);

    const connected = Boolean(next?.mcp.connected);
    const llmMissing = next !== null && !next.llm.configured;

    if (next && connected) {
      setPhase('ready');
      return; // Settled — stop polling.
    }

    // A missing credential is a configuration fact, not a race.
    if (llmMissing) {
      setPhase('unavailable');
      return;
    }

    const elapsed = Date.now() - startedAtRef.current;
    setPhase(elapsed > CONNECTING_GRACE_MS ? 'unavailable' : 'connecting');

    const delay = RETRY_SCHEDULE_MS[attemptRef.current] ?? STEADY_RETRY_MS;
    attemptRef.current += 1;
    timerRef.current = window.setTimeout(() => void poll(), delay);
  }, []);

  useEffect(() => {
    cancelledRef.current = false;
    void poll();
    return () => {
      cancelledRef.current = true;
      window.clearTimeout(timerRef.current);
    };
  }, [poll]);

  /** Explicit user-triggered reconnect; resumes polling if it does not stick. */
  const reconnect = useCallback(async () => {
    setReconnecting(true);
    try {
      const { mcp } = await reconnectMcp();
      setCapabilities((current) => (current ? { ...current, mcp } : current));
      if (mcp.connected) {
        setPhase('ready');
        return;
      }
    } catch {
      // Fall through to a fresh poll cycle.
    } finally {
      setReconnecting(false);
    }

    window.clearTimeout(timerRef.current);
    attemptRef.current = 0;
    startedAtRef.current = Date.now();
    void poll();
  }, [poll]);

  return { capabilities, phase, reconnecting, reconnect };
}
