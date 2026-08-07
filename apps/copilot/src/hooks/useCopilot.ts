import { useCallback, useEffect, useRef } from 'react';
import { streamChat } from '../api/copilotClient';
import { useCopilotStore } from '../store/copilotStore';
import type { AgentEvent } from '../types';

/**
 * Drives one conversation: send, cancel, retry, confirm-and-resume.
 *
 * The agent runs server-side; this hook only owns the request lifecycle and
 * folds streamed events into the store.
 */
export function useCopilot() {
  const store = useCopilotStore();
  const abortRef = useRef<AbortController | null>(null);

  // A live request must not outlive the component.
  useEffect(() => () => abortRef.current?.abort(), []);

  const run = useCallback(async (confirmations: string[]) => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    const { turns, context } = useCopilotStore.getState();
    const apply = useCopilotStore.getState().apply;

    useCopilotStore.getState().setStatus('thinking');
    try {
      await streamChat({
        turns: turns(),
        context,
        confirmations,
        signal: controller.signal,
        onEvent: (event: AgentEvent) => apply(event),
      });
    } catch (cause) {
      if (controller.signal.aborted) {
        useCopilotStore.getState().setStatus('idle');
        return;
      }
      useCopilotStore.getState().pushError({
        kind: 'internal',
        message:
          cause instanceof Error
            ? `Could not reach the Copilot server: ${cause.message}`
            : 'Could not reach the Copilot server.',
        retryable: true,
      });
    } finally {
      if (abortRef.current === controller) abortRef.current = null;
      useCopilotStore.getState().setStatus('idle');
    }
  }, []);

  const send = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed) return;
      useCopilotStore.getState().appendUser(trimmed);
      await run(useCopilotStore.getState().confirmations);
    },
    [run],
  );

  const cancel = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    useCopilotStore.getState().setStatus('idle');
  }, []);

  /** Re-run the last user prompt, e.g. after a transient failure. */
  const retry = useCallback(async () => {
    const { lastPrompt } = useCopilotStore.getState();
    if (!lastPrompt) return;
    await run(useCopilotStore.getState().confirmations);
  }, [run]);

  /**
   * Approve a destructive action and re-run the turn. The agent refused to
   * execute it the first time; with the fingerprint approved it now will.
   */
  const approveAndResume = useCallback(
    async (itemId: string) => {
      const fingerprint = useCopilotStore.getState().approveConfirmation(itemId);
      if (!fingerprint) return;
      await run(useCopilotStore.getState().confirmations);
    },
    [run],
  );

  const decline = useCallback((itemId: string) => {
    useCopilotStore.getState().declineConfirmation(itemId);
  }, []);

  return {
    items: store.items,
    status: store.status,
    context: store.context,
    busy: store.status !== 'idle',
    send,
    cancel,
    retry,
    approveAndResume,
    decline,
    clear: store.clear,
  };
}
