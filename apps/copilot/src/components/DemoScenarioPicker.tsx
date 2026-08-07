import { useState } from 'react';
import { ChevronRight, PlayCircle } from 'lucide-react';
import type { Capabilities } from '../types';

export interface DemoScenario {
  id: string;
  title: string;
  summary: string;
  /** Real natural-language prompts, sent through the same agent path. */
  steps: string[];
  /** Tools that must exist for this scenario to be runnable. */
  requires: string[];
}

/**
 * Guided demos. These are *prompts*, not scripted outcomes — each step goes
 * through the same Copilot execution path a typed message does, so what the
 * judge sees is the real platform responding, not a replay.
 */
export const SCENARIOS: DemoScenario[] = [
  {
    id: 'success',
    title: 'A — Successful automation',
    summary: 'Subscribe, publish, lease, acknowledge. The happy path end to end.',
    requires: ['create_subscription', 'ingest_event', 'lease_deliveries', 'ack_delivery'],
    steps: [
      'Create a subscription for GitHub pull request opened events.',
      'Send a GitHub pull_request.opened event for repository acme/widgets.',
      'Check the inbox and lease the next delivery.',
      'Acknowledge it.',
      'Summarize what just happened to that event.',
    ],
  },
  {
    id: 'failure',
    title: 'B — Consumer failure and retry',
    summary: 'Reject a delivery, watch the backoff, then succeed on the retry.',
    requires: ['ingest_event', 'lease_deliveries', 'nack_delivery', 'ack_delivery'],
    steps: [
      'Send another GitHub pull_request.opened event for acme/widgets.',
      'Lease the next delivery.',
      'Reject it — the downstream CRM returned a 503 — and retry it later.',
      'What is the state of that delivery now, and when will it retry?',
    ],
  },
  {
    id: 'deadletter',
    title: 'C — Dead-letter recovery',
    summary: 'Exhaust the retry budget, find the dead letter, replay it.',
    requires: ['list_deliveries', 'replay_delivery'],
    steps: [
      'Show me any dead-letter deliveries.',
      'Replay the failed delivery.',
      'Confirm it is back in the delivery path.',
    ],
  },
  {
    id: 'overview',
    title: 'D — Natural-language overview',
    summary: 'Ask what is happening and get a plain-language read of the system.',
    requires: ['get_overview'],
    steps: ["What's going on in the system?"],
  },
];

export function DemoScenarioPicker({
  capabilities,
  onRun,
  disabled,
}: {
  capabilities: Capabilities | null;
  onRun: (prompt: string) => void;
  disabled: boolean;
}) {
  const [openId, setOpenId] = useState<string | null>(null);
  const available = capabilities?.mcp.toolNames ?? [];

  const runnable = SCENARIOS.filter((scenario) =>
    scenario.requires.every((tool) => available.includes(tool)),
  );

  if (runnable.length === 0) return null;

  return (
    <section className="panel">
      <div className="flex items-center gap-2 border-b border-border px-4 py-2.5">
        <PlayCircle size={14} className="text-accent" aria-hidden />
        <p className="text-sm font-medium text-text">Try a demo</p>
        <p className="ml-auto text-xs text-faint">Sends real prompts</p>
      </div>

      <ul className="divide-y divide-border">
        {runnable.map((scenario) => {
          const open = openId === scenario.id;
          return (
            <li key={scenario.id}>
              <button
                type="button"
                onClick={() => setOpenId(open ? null : scenario.id)}
                aria-expanded={open}
                className="flex w-full items-start gap-2 px-4 py-2.5 text-left transition hover:bg-surface-2/60"
              >
                <ChevronRight
                  size={14}
                  aria-hidden
                  className={`mt-0.5 shrink-0 text-faint transition-transform ${open ? 'rotate-90' : ''}`}
                />
                <span className="min-w-0">
                  <span className="block text-sm font-medium text-text">{scenario.title}</span>
                  <span className="mt-0.5 block text-xs text-faint">{scenario.summary}</span>
                </span>
              </button>

              {open && (
                <ol className="space-y-1 px-4 pb-3 pl-10">
                  {scenario.steps.map((step, index) => (
                    <li key={step} className="flex items-center gap-2">
                      <span className="mono w-4 shrink-0 text-right text-xs text-faint">
                        {index + 1}
                      </span>
                      <button
                        type="button"
                        disabled={disabled}
                        onClick={() => onRun(step)}
                        className="min-w-0 flex-1 truncate rounded border border-transparent px-2 py-1 text-left text-xs text-muted transition hover:border-border hover:bg-surface-2 hover:text-text disabled:cursor-not-allowed disabled:opacity-50"
                        title={step}
                      >
                        {step}
                      </button>
                    </li>
                  ))}
                </ol>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
