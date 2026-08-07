// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { CopilotAgent, type AgentEvent } from '../src/agent.js';
import { emptyContext } from '../src/context.js';
import { LeaseRegistry, LEASE_TOKEN_PLACEHOLDER } from '../src/leaseRegistry.js';
import { silentLogger, stubAnthropic, stubMcpClient, testConfig } from './helpers/stubs.js';

/**
 * Regression cover for a failure seen against the live stack: rather than
 * copying the 64-character lease token from the lease result, the model
 * fabricated `lt_0…`, and the platform rejected the ACK with LEASE_CONFLICT,
 * stranding the delivery until its visibility timeout expired.
 *
 * The fix is custody, not persuasion — the server substitutes the real token
 * and keeps it out of the model's context entirely.
 */

const REAL_TOKEN = '8881a3f0c2d4e6b8a0c2e4f60819a2b4c6d8e0f21436587a9cbedf0123456789';
const DELIVERY_ID = '019fdcda-a3cf-7375-8f25-e9935120f447';

const LEASE_RESULT = {
  count: 1,
  items: [{ deliveryId: DELIVERY_ID, eventId: 'e-1', leaseToken: REAL_TOKEN, attempt: 1 }],
  nextPollAfterMs: 0,
};

function mcpWithLease() {
  return stubMcpClient({
    respond: (name) => {
      if (name === 'lease_deliveries') {
        return { raw: LEASE_RESULT, isError: false, text: JSON.stringify(LEASE_RESULT) };
      }
      return {
        raw: { deliveryId: DELIVERY_ID, status: 'acknowledged' },
        isError: false,
        text: 'ok',
      };
    },
  });
}

async function drain(generator: AsyncGenerator<AgentEvent>): Promise<AgentEvent[]> {
  const events: AgentEvent[] = [];
  for await (const event of generator) events.push(event);
  return events;
}

describe('lease token custody', () => {
  it('substitutes the real token when the model fabricates one', async () => {
    const mcp = mcpWithLease();
    const leases = new LeaseRegistry();
    const { client } = stubAnthropic([
      { toolUses: [{ id: 'tu_1', name: 'lease_deliveries', input: { subscriptionId: 's-1' } }] },
      {
        toolUses: [
          {
            id: 'tu_2',
            // Exactly what the live model produced.
            name: 'ack_delivery',
            input: { deliveryId: DELIVERY_ID, leaseToken: 'lt_0fabricated31' },
          },
        ],
      },
      { text: 'Acknowledged.' },
    ]);
    const agent = new CopilotAgent(testConfig(), mcp.client, silentLogger, client, leases);

    await drain(
      agent.run(
        {
          turns: [{ role: 'user', content: 'lease one and ack it' }],
          context: emptyContext(),
          confirmations: [],
          signal: new AbortController().signal,
        },
        'system',
      ),
    );

    const ack = mcp.calls.find((call) => call.name === 'ack_delivery');
    expect(ack?.args.leaseToken).toBe(REAL_TOKEN);
    expect(ack?.args.leaseToken).not.toBe('lt_0fabricated31');
  });

  it('keeps the real token out of the model context', async () => {
    const mcp = mcpWithLease();
    const leases = new LeaseRegistry();
    const { client, requests } = stubAnthropic([
      { toolUses: [{ id: 'tu_1', name: 'lease_deliveries', input: { subscriptionId: 's-1' } }] },
      { text: 'Leased one delivery.' },
    ]);
    const agent = new CopilotAgent(testConfig(), mcp.client, silentLogger, client, leases);

    await drain(
      agent.run(
        {
          turns: [{ role: 'user', content: 'lease one' }],
          context: emptyContext(),
          confirmations: [],
          signal: new AbortController().signal,
        },
        'system',
      ),
    );

    // The second request carries the tool result the model will read.
    const sentToModel = JSON.stringify(requests[1]?.messages ?? []);
    expect(sentToModel).not.toContain(REAL_TOKEN);
    expect(sentToModel).toContain(LEASE_TOKEN_PLACEHOLDER);
    // The delivery id it does need is still there.
    expect(sentToModel).toContain(DELIVERY_ID);
  });

  it('keeps the real token out of the browser stream', async () => {
    const mcp = mcpWithLease();
    const { client } = stubAnthropic([
      { toolUses: [{ id: 'tu_1', name: 'lease_deliveries', input: { subscriptionId: 's-1' } }] },
      { text: 'Leased.' },
    ]);
    const agent = new CopilotAgent(
      testConfig(),
      mcp.client,
      silentLogger,
      client,
      new LeaseRegistry(),
    );

    const events = await drain(
      agent.run(
        {
          turns: [{ role: 'user', content: 'lease one' }],
          context: emptyContext(),
          confirmations: [],
          signal: new AbortController().signal,
        },
        'system',
      ),
    );

    expect(JSON.stringify(events)).not.toContain(REAL_TOKEN);
  });

  it('carries custody across separate agent runs, as lease and ACK really are', async () => {
    // Lease and ACK arrive as two HTTP requests, so a per-request registry
    // would lose the token between them.
    const leases = new LeaseRegistry();
    const mcpLease = mcpWithLease();
    const { client: leaseClient } = stubAnthropic([
      { toolUses: [{ id: 'tu_1', name: 'lease_deliveries', input: { subscriptionId: 's-1' } }] },
      { text: 'Leased.' },
    ]);

    await drain(
      new CopilotAgent(testConfig(), mcpLease.client, silentLogger, leaseClient, leases).run(
        {
          turns: [{ role: 'user', content: 'lease one' }],
          context: emptyContext(),
          confirmations: [],
          signal: new AbortController().signal,
        },
        'system',
      ),
    );

    const mcpAck = mcpWithLease();
    const { client: ackClient } = stubAnthropic([
      {
        toolUses: [
          {
            id: 'tu_2',
            name: 'ack_delivery',
            input: { deliveryId: DELIVERY_ID, leaseToken: 'nope' },
          },
        ],
      },
      { text: 'Acknowledged.' },
    ]);

    await drain(
      new CopilotAgent(testConfig(), mcpAck.client, silentLogger, ackClient, leases).run(
        {
          turns: [{ role: 'user', content: 'ack it' }],
          context: emptyContext(),
          confirmations: [],
          signal: new AbortController().signal,
        },
        'system',
      ),
    );

    expect(mcpAck.calls[0]?.args.leaseToken).toBe(REAL_TOKEN);
  });

  it('releases custody once the delivery is settled', async () => {
    const leases = new LeaseRegistry();
    const mcp = mcpWithLease();
    const { client } = stubAnthropic([
      { toolUses: [{ id: 'tu_1', name: 'lease_deliveries', input: { subscriptionId: 's-1' } }] },
      {
        toolUses: [
          { id: 'tu_2', name: 'ack_delivery', input: { deliveryId: DELIVERY_ID, leaseToken: 'x' } },
        ],
      },
      { text: 'Done.' },
    ]);

    await drain(
      new CopilotAgent(testConfig(), mcp.client, silentLogger, client, leases).run(
        {
          turns: [{ role: 'user', content: 'lease and ack' }],
          context: emptyContext(),
          confirmations: [],
          signal: new AbortController().signal,
        },
        'system',
      ),
    );

    expect(leases.get(DELIVERY_ID)).toBeUndefined();
  });
});
