// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { CopilotAgent, toolFingerprint, type AgentEvent } from '../src/agent.js';
import { emptyContext } from '../src/context.js';
import { buildSystemPrompt } from '../src/systemPrompt.js';
import {
  DEFAULT_TOOLS,
  silentLogger,
  stubAnthropic,
  stubMcpClient,
  testConfig,
} from './helpers/stubs.js';

const SYSTEM = 'test system prompt';

async function collect(generator: AsyncGenerator<AgentEvent>): Promise<AgentEvent[]> {
  const events: AgentEvent[] = [];
  for await (const event of generator) events.push(event);
  return events;
}

function run(
  agent: CopilotAgent,
  prompt: string,
  confirmations: string[] = [],
): Promise<AgentEvent[]> {
  return collect(
    agent.run(
      {
        turns: [{ role: 'user', content: prompt }],
        context: emptyContext(),
        confirmations,
        signal: new AbortController().signal,
      },
      SYSTEM,
    ),
  );
}

describe('agent tool loop', () => {
  it('streams assistant text and finishes without tools', async () => {
    const mcp = stubMcpClient();
    const { client } = stubAnthropic([{ text: 'Nothing is pending right now.' }]);
    const agent = new CopilotAgent(testConfig(), mcp.client, silentLogger, client);

    const events = await run(agent, 'anything pending?');

    expect(events.filter((e) => e.type === 'text_delta')).toHaveLength(1);
    expect(events.at(-1)).toEqual({ type: 'done', stopReason: 'end_turn' });
    expect(mcp.calls).toHaveLength(0);
  });

  it('executes a tool call and reports it running then succeeded', async () => {
    const mcp = stubMcpClient({
      respond: () => ({
        raw: { eventId: 'evt-1', matchedSubscriptions: 1 },
        isError: false,
        text: '{"eventId":"evt-1"}',
      }),
    });
    const { client } = stubAnthropic([
      {
        toolUses: [
          { id: 'tu_1', name: 'ingest_event', input: { source: 'github', eventType: 'x' } },
        ],
      },
      { text: 'Event accepted, one subscription matched.' },
    ]);
    const agent = new CopilotAgent(testConfig(), mcp.client, silentLogger, client);

    const events = await run(agent, 'send a github event');

    const call = events.find((e) => e.type === 'tool_call');
    const result = events.find((e) => e.type === 'tool_result');
    expect(call).toMatchObject({ name: 'ingest_event', mutating: true });
    expect(result).toMatchObject({ ok: true });
    expect(mcp.calls).toEqual([
      { name: 'ingest_event', args: { source: 'github', eventType: 'x' } },
    ]);
  });

  it('masks tool arguments and results before they leave the server', async () => {
    const mcp = stubMcpClient({
      respond: () => ({
        raw: { items: [{ deliveryId: 'd-1', leaseToken: 'lease_supersecret_value' }] },
        isError: false,
        text: 'ok',
      }),
    });
    const { client } = stubAnthropic([
      { toolUses: [{ id: 'tu_1', name: 'lease_deliveries', input: { subscriptionId: 's-1' } }] },
      { text: 'Leased one delivery.' },
    ]);
    const agent = new CopilotAgent(testConfig(), mcp.client, silentLogger, client);

    const events = await run(agent, 'check the inbox');

    const serialized = JSON.stringify(events);
    expect(serialized).not.toContain('lease_supersecret_value');
    expect(serialized).toContain('••••');
  });

  it('emits a context update when a tool identifies a single delivery', async () => {
    const mcp = stubMcpClient({
      respond: () => ({
        raw: { count: 1, items: [{ deliveryId: 'd-9', eventId: 'e-9', leaseToken: 't' }] },
        isError: false,
        text: 'ok',
      }),
    });
    const { client } = stubAnthropic([
      { toolUses: [{ id: 'tu_1', name: 'lease_deliveries', input: { subscriptionId: 's-1' } }] },
      { text: 'Leased.' },
    ]);
    const agent = new CopilotAgent(testConfig(), mcp.client, silentLogger, client);

    const events = await run(agent, 'lease one');
    const context = events.find((e) => e.type === 'context');

    expect(context).toMatchObject({
      context: { selectedDeliveryId: 'd-9', selectedEventId: 'e-9' },
    });
  });

  it('surfaces a tool failure without claiming success', async () => {
    const mcp = stubMcpClient({
      respond: () => ({
        raw: null,
        isError: true,
        text: 'LEASE_EXPIRED (HTTP 409): The delivery lease has expired.',
      }),
    });
    const { client } = stubAnthropic([
      {
        toolUses: [
          { id: 'tu_1', name: 'ack_delivery', input: { deliveryId: 'd', leaseToken: 't' } },
        ],
      },
      { text: 'That lease expired, so I could not acknowledge it.' },
    ]);
    const agent = new CopilotAgent(testConfig(), mcp.client, silentLogger, client);

    const events = await run(agent, 'ack it');
    const result = events.find((e) => e.type === 'tool_result');

    expect(result).toMatchObject({ ok: false });
    expect((result as { error?: string }).error).toContain('LEASE_EXPIRED');
  });

  it('reports a thrown MCP error as a failed tool result and keeps going', async () => {
    const mcp = stubMcpClient({
      respond: () => {
        throw new Error('ECONNREFUSED 127.0.0.1:3100');
      },
    });
    const { client } = stubAnthropic([
      { toolUses: [{ id: 'tu_1', name: 'get_overview', input: {} }] },
      { text: 'I could not reach the platform.' },
    ]);
    const agent = new CopilotAgent(testConfig(), mcp.client, silentLogger, client);

    const events = await run(agent, 'overview');
    const result = events.find((e) => e.type === 'tool_result');

    expect(result).toMatchObject({ ok: false });
    expect((result as { error?: string }).error).toMatch(/MCP server is unreachable/);
    expect(events.at(-1)).toMatchObject({ type: 'done' });
  });

  describe('destructive-action gating', () => {
    it('does not execute delete_subscription without confirmation', async () => {
      const mcp = stubMcpClient();
      const { client } = stubAnthropic([
        {
          toolUses: [{ id: 'tu_1', name: 'delete_subscription', input: { subscriptionId: 's-1' } }],
        },
        { text: 'That would permanently delete the subscription. Confirm?' },
      ]);
      const agent = new CopilotAgent(testConfig(), mcp.client, silentLogger, client);

      const events = await run(agent, 'delete the subscription');

      expect(events.find((e) => e.type === 'tool_confirmation_required')).toMatchObject({
        name: 'delete_subscription',
      });
      expect(mcp.calls).toHaveLength(0);
    });

    it('executes once the matching fingerprint is approved', async () => {
      const mcp = stubMcpClient();
      const fingerprint = toolFingerprint('delete_subscription', { subscriptionId: 's-1' });
      const { client } = stubAnthropic([
        {
          toolUses: [{ id: 'tu_1', name: 'delete_subscription', input: { subscriptionId: 's-1' } }],
        },
        { text: 'Deleted.' },
      ]);
      const agent = new CopilotAgent(testConfig(), mcp.client, silentLogger, client);

      await run(agent, 'delete it', [fingerprint]);

      expect(mcp.calls).toEqual([{ name: 'delete_subscription', args: { subscriptionId: 's-1' } }]);
    });

    it('does not let approval of one action authorise a different one', async () => {
      const mcp = stubMcpClient();
      const approvedElsewhere = toolFingerprint('delete_subscription', { subscriptionId: 'OTHER' });
      const { client } = stubAnthropic([
        {
          toolUses: [{ id: 'tu_1', name: 'delete_subscription', input: { subscriptionId: 's-1' } }],
        },
        { text: 'Confirm?' },
      ]);
      const agent = new CopilotAgent(testConfig(), mcp.client, silentLogger, client);

      const events = await run(agent, 'delete it', [approvedElsewhere]);

      expect(events.some((e) => e.type === 'tool_confirmation_required')).toBe(true);
      expect(mcp.calls).toHaveLength(0);
    });

    it('runs routine demo mutations with no confirmation step', async () => {
      const mcp = stubMcpClient();
      const { client } = stubAnthropic([
        {
          toolUses: [
            { id: 'tu_1', name: 'ack_delivery', input: { deliveryId: 'd', leaseToken: 't' } },
          ],
        },
        { text: 'Acknowledged.' },
      ]);
      const agent = new CopilotAgent(testConfig(), mcp.client, silentLogger, client);

      const events = await run(agent, 'ack it');

      expect(events.some((e) => e.type === 'tool_confirmation_required')).toBe(false);
      expect(mcp.calls).toHaveLength(1);
    });
  });

  it('reports a model refusal as a non-retryable error', async () => {
    const mcp = stubMcpClient();
    const { client } = stubAnthropic([{ stopReason: 'refusal' as never }]);
    const agent = new CopilotAgent(testConfig(), mcp.client, silentLogger, client);

    const events = await run(agent, 'something declined');
    const error = events.find((e) => e.type === 'error');

    expect(error).toMatchObject({ error: { kind: 'llm_refusal', retryable: false } });
  });

  it('stops after the configured iteration ceiling', async () => {
    const mcp = stubMcpClient();
    // Always asks for another tool — without a ceiling this never terminates.
    const { client } = stubAnthropic([
      { toolUses: [{ id: 'tu_loop', name: 'get_overview', input: {} }] },
    ]);
    const agent = new CopilotAgent(
      testConfig({ COPILOT_MAX_ITERATIONS: 3 }),
      mcp.client,
      silentLogger,
      client,
    );

    const events = await run(agent, 'loop forever');

    expect(mcp.calls).toHaveLength(3);
    expect(events.at(-1)).toEqual({ type: 'done', stopReason: 'max_iterations' });
  });

  it('stops promptly when the request is aborted', async () => {
    const mcp = stubMcpClient();
    const { client } = stubAnthropic([{ text: 'hello' }]);
    const agent = new CopilotAgent(testConfig(), mcp.client, silentLogger, client);
    const controller = new AbortController();
    controller.abort();

    const events = await collect(
      agent.run(
        {
          turns: [{ role: 'user', content: 'hi' }],
          context: emptyContext(),
          confirmations: [],
          signal: controller.signal,
        },
        SYSTEM,
      ),
    );

    expect(events).toEqual([{ type: 'done', stopReason: 'cancelled' }]);
  });

  it('offers the model exactly the tools MCP registered', async () => {
    const mcp = stubMcpClient();
    const { client, requests } = stubAnthropic([{ text: 'ok' }]);
    const agent = new CopilotAgent(testConfig(), mcp.client, silentLogger, client);

    await run(agent, 'hi');

    const tools = requests[0]?.tools as Array<{ name: string }>;
    expect(tools.map((tool) => tool.name)).toEqual(DEFAULT_TOOLS.map((tool) => tool.name));
  });

  it('sends the tuned model configuration', async () => {
    const mcp = stubMcpClient();
    const { client, requests } = stubAnthropic([{ text: 'ok' }]);
    const agent = new CopilotAgent(testConfig(), mcp.client, silentLogger, client);

    await run(agent, 'hi');

    expect(requests[0]).toMatchObject({
      model: 'claude-opus-5',
      thinking: { type: 'adaptive' },
      output_config: { effort: 'medium' },
      fallbacks: 'default',
    });
  });
});

describe('system prompt', () => {
  it('lists the discovered tools and forbids leasing for inspection', async () => {
    const mcp = stubMcpClient();
    const prompt = buildSystemPrompt(await mcp.client.capabilities());

    expect(prompt).toContain('lease_deliveries');
    expect(prompt).toMatch(/Never call lease_deliveries just to see whether work is waiting/);
    expect(prompt).toMatch(/list_deliveries with status PENDING/);
  });

  it('states which capabilities are unavailable', async () => {
    const mcp = stubMcpClient({
      capabilities: { roles: { producer: true, consumer: false, admin: false } },
    });
    const prompt = buildSystemPrompt(await mcp.client.capabilities());

    expect(prompt).toMatch(/cannot do the following/);
    expect(prompt).toContain('replaying deliveries');
  });

  it('says nothing about missing capabilities when all roles are present', async () => {
    const mcp = stubMcpClient();
    const prompt = buildSystemPrompt(await mcp.client.capabilities());

    expect(prompt).not.toMatch(/cannot do the following/);
  });
});
