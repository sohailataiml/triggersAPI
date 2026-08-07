import type { Capabilities } from '../../types';

interface Suggestion {
  label: string;
  prompt: string;
  /** Tool that must exist for this suggestion to be offerable. */
  requires: string;
}

/**
 * Demo-relevant starters. Each is filtered against the tools the MCP server
 * actually registered, so a producer-only credential never offers "Acknowledge
 * the current delivery" — the UI must not advertise what it cannot do.
 */
const SUGGESTIONS: Suggestion[] = [
  {
    label: 'Create a GitHub PR subscription',
    prompt: 'Create a subscription for GitHub pull request opened events.',
    requires: 'create_subscription',
  },
  {
    label: 'Send a sample GitHub event',
    prompt:
      'Send a GitHub pull_request.opened event for repository acme/widgets with pull request 431.',
    requires: 'ingest_event',
  },
  {
    label: "What's waiting?",
    prompt: 'What deliveries are pending right now?',
    requires: 'list_deliveries',
  },
  {
    label: 'Check the inbox',
    prompt: 'Check the inbox and lease the next delivery.',
    requires: 'lease_deliveries',
  },
  {
    label: 'Acknowledge the delivery',
    prompt: 'Acknowledge the current delivery.',
    requires: 'ack_delivery',
  },
  {
    label: 'Simulate a failure',
    prompt: 'Reject the current delivery — the downstream CRM returned a 503 — and retry it later.',
    requires: 'nack_delivery',
  },
  {
    label: 'Show dead-letter deliveries',
    prompt: 'Show me any dead-letter deliveries.',
    requires: 'list_deliveries',
  },
  {
    label: 'Replay the failed delivery',
    prompt: 'Replay the failed delivery.',
    requires: 'replay_delivery',
  },
  {
    label: 'System overview',
    prompt: "What's going on in the system?",
    requires: 'get_overview',
  },
];

export function SuggestedPrompts({
  capabilities,
  onPick,
  disabled,
}: {
  capabilities: Capabilities | null;
  onPick: (prompt: string) => void;
  disabled: boolean;
}) {
  const available = capabilities?.mcp.toolNames ?? [];
  const usable = SUGGESTIONS.filter((suggestion) => available.includes(suggestion.requires));

  if (usable.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-1.5">
      {usable.map((suggestion) => (
        <button
          key={suggestion.label}
          type="button"
          disabled={disabled}
          onClick={() => onPick(suggestion.prompt)}
          className="rounded-full border border-border bg-surface-2/60 px-3 py-1 text-xs font-medium text-muted transition hover:border-accent/50 hover:text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {suggestion.label}
        </button>
      ))}
    </div>
  );
}
