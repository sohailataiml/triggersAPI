import type { ApiClient } from '../../api';
import type { LeasedItem, Subscription } from '../../types';

export type StepState = 'run' | 'done' | 'fail';
export interface DemoStep {
  id: number;
  text: string;
  state: StepState;
  detail?: string;
}

export interface ScenarioContext {
  api: ApiClient;
  sub: Subscription;
  /**
   * Push a step, run `fn`, record its result. `detail` optionally maps the
   * result to a human narration line (falls back to the result if it's a string).
   */
  step: <T>(text: string, fn: () => Promise<T> | T, detail?: (r: T) => string) => Promise<T>;
  note: (text: string) => void;
  sleep: (ms: number) => Promise<void>;
  onChange: () => void;
}

export interface Scenario {
  id: 'A' | 'B' | 'C';
  label: string;
  blurb: string;
  needsConsumer: boolean;
  needsAdmin: boolean;
  run: (ctx: ScenarioContext) => Promise<void>;
}

/** Build an event that matches the subscription's filters. */
function matchingEvent(sub: Subscription) {
  return {
    source: sub.filters.source ?? 'demo',
    eventType: sub.filters.eventType ?? 'demo.event',
    subject: sub.filters.subject ?? undefined,
    payload: { demo: true, at: 'guided-scenario' },
  };
}

async function leaseFor(
  api: ApiClient,
  sub: Subscription,
  eventId: string,
  opts: { wait?: number; visibilityTimeout?: number } = {},
): Promise<LeasedItem> {
  const { items } = await api.lease(sub.id, opts.wait ?? 2, opts.visibilityTimeout);
  const item = items.find((i) => i.eventId === eventId) ?? items[0];
  if (!item) throw new Error('Nothing leasable — the delivery may already be held.');
  return item;
}

export const SCENARIOS: Scenario[] = [
  {
    id: 'A',
    label: 'Successful delivery',
    blurb: 'Ingest → match → lease → acknowledge.',
    needsConsumer: true,
    needsAdmin: false,
    run: async ({ api, sub, step, onChange }) => {
      const eventId = await step(
        'Ingest a matching event',
        async () => {
          const res = await api.ingest(matchingEvent(sub));
          onChange();
          return res.eventId;
        },
        (id) => `event ${id.slice(0, 8)}`,
      );
      const leased = await step(
        'Consumer leases the delivery',
        async () => {
          const item = await leaseFor(api, sub, eventId, { wait: 3 });
          onChange();
          return item;
        },
        (i) => `attempt ${i.attempt} · lease held`,
      );
      await step(
        'Consumer acknowledges',
        async () => {
          const res = (await api.ack(
            leased.deliveryId,
            leased.leaseToken,
            `demo-${leased.deliveryId}`,
          )) as { duplicateAck?: boolean };
          onChange();
          return res;
        },
        (r) => (r.duplicateAck ? 'acknowledged (idempotent)' : 'acknowledged ✓'),
      );
    },
  },
  {
    id: 'B',
    label: 'Consumer crash & redelivery',
    blurb: 'Lease with a short visibility timeout, "crash", let it expire, re-lease, ack.',
    needsConsumer: true,
    needsAdmin: false,
    run: async ({ api, sub, step, note, sleep, onChange }) => {
      const eventId = await step(
        'Ingest a matching event',
        async () => {
          const res = await api.ingest(matchingEvent(sub));
          onChange();
          return res.eventId;
        },
        (id) => `event ${id.slice(0, 8)}`,
      );
      const first = await step(
        'Lease with a 3s visibility timeout',
        async () => {
          const item = await leaseFor(api, sub, eventId, { wait: 3, visibilityTimeout: 3 });
          onChange();
          return item;
        },
        (i) => `leased · attempt ${i.attempt}`,
      );
      note(`Consumer "crashes" holding delivery ${first.deliveryId.slice(0, 8)} — no ACK is sent.`);
      await step('Wait for the lease to expire', async () => {
        await sleep(4000);
        onChange();
        return 'visibility timeout elapsed';
      });
      const second = await step(
        'Re-lease — the same delivery is redelivered',
        async () => {
          const item = await leaseFor(api, sub, eventId, { wait: 3 });
          onChange();
          return item;
        },
        (i) => `redelivered as attempt ${i.attempt}`,
      );
      await step(
        'Acknowledge the redelivery',
        async () => {
          await api.ack(second.deliveryId, second.leaseToken, `demo-${second.deliveryId}`);
          onChange();
          return 'ok';
        },
        () => 'acknowledged ✓',
      );
    },
  },
  {
    id: 'C',
    label: 'Dead-letter & replay',
    blurb: 'Force a failure to exhaust attempts, then replay to recover.',
    needsConsumer: true,
    needsAdmin: true,
    run: async ({ api, sub, step, note, onChange }) => {
      const originalMaxAttempts = sub.maxAttempts;
      try {
        await step('Set max attempts to 1', async () => {
          await api.updateSubscription(sub.id, { maxAttempts: 1 });
          onChange();
          return 'a single failure will now dead-letter';
        });
        const eventId = await step(
          'Ingest a matching event',
          async () => {
            const res = await api.ingest(matchingEvent(sub));
            onChange();
            return res.eventId;
          },
          (id) => `event ${id.slice(0, 8)}`,
        );
        const leased = await step(
          'Lease it',
          async () => {
            const item = await leaseFor(api, sub, eventId, { wait: 3 });
            onChange();
            return item;
          },
          (i) => `attempt ${i.attempt}`,
        );
        await step(
          'NACK → dead-letter',
          async () => {
            const res = (await api.nack(leased.deliveryId, leased.leaseToken, 'demo_failure')) as {
              status?: string;
            };
            onChange();
            return res;
          },
          (r) => `status: ${r.status ?? 'DEAD_LETTER'}`,
        );
        await step('Replay the dead-letter', async () => {
          await api.replay(leased.deliveryId, 'Guided demo replay');
          onChange();
          return 'delivery returned to PENDING';
        });
        note(
          'Replayed delivery is pending again — lease + ACK it (or run scenario A) to complete.',
        );
      } finally {
        // Cleanup: restore the original retry budget so later demos behave normally.
        await api.updateSubscription(sub.id, { maxAttempts: originalMaxAttempts }).catch(() => {});
        onChange();
      }
    },
  },
];
