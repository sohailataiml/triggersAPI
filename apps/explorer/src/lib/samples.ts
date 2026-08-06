/** Source visual identity for the composer + pipeline tokens. */
export interface SourceMeta {
  id: string;
  label: string;
  /** Single emoji glyph — cheap, dependency-free source icon. */
  glyph: string;
}

export const SOURCE_META: Record<string, SourceMeta> = {
  github: { id: 'github', label: 'GitHub', glyph: '🐙' },
  stripe: { id: 'stripe', label: 'Stripe', glyph: '💳' },
  demo: { id: 'demo', label: 'Demo', glyph: '⚡' },
};

export function sourceMeta(source: string): SourceMeta {
  return SOURCE_META[source] ?? { id: source, label: source, glyph: '📦' };
}

/** Composer presets — one click fills a realistic event. */
export interface EventPreset {
  id: string;
  label: string;
  source: string;
  eventType: string;
  subject: string;
  payload: Record<string, unknown>;
}

export const EVENT_PRESETS: EventPreset[] = [
  {
    id: 'stripe-succeeded',
    label: 'Stripe payment succeeded',
    source: 'stripe',
    eventType: 'payment_intent.succeeded',
    subject: 'cus_Nf3xamplE',
    payload: { amount: 4200, currency: 'usd', customer: 'cus_Nf3xamplE' },
  },
  {
    id: 'stripe-failed',
    label: 'Stripe payment failed',
    source: 'stripe',
    eventType: 'payment_intent.payment_failed',
    subject: 'cus_Nf3xamplE',
    payload: { amount: 4200, currency: 'usd', failure_code: 'card_declined' },
  },
  {
    id: 'github-pr',
    label: 'GitHub pull request opened',
    source: 'github',
    eventType: 'pull_request.opened',
    subject: 'repo:acme/widgets',
    payload: { pullRequestId: 431, title: 'Add retry backoff', author: 'octocat' },
  },
  {
    id: 'github-issue',
    label: 'GitHub issue closed',
    source: 'github',
    eventType: 'issues.closed',
    subject: 'repo:acme/widgets',
    payload: { issueId: 128, closedBy: 'octocat' },
  },
  {
    id: 'custom',
    label: 'Custom event',
    source: 'demo',
    eventType: 'demo.event',
    subject: '',
    payload: { hello: 'world' },
  },
];
