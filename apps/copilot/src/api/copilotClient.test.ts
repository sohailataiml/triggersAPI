import { afterEach, describe, expect, it, vi } from 'vitest';
import { streamChat } from './copilotClient';
import type { AgentEvent } from '../types';

/** Build a Response whose body streams the given SSE chunks. */
function sseResponse(chunks: string[]): Response {
  const encoder = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
      controller.close();
    },
  });
  return new Response(body, {
    status: 200,
    headers: { 'content-type': 'text/event-stream' },
  });
}

const baseArgs = {
  turns: [{ role: 'user' as const, content: 'hi' }],
  context: { selectedEventId: null, selectedDeliveryId: null, selectedSubscriptionId: null },
  confirmations: [],
};

afterEach(() => vi.unstubAllGlobals());

describe('streamChat', () => {
  it('parses complete SSE frames into agent events', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          sseResponse([
            'data: {"type":"status","status":"thinking"}\n\n',
            'data: {"type":"text_delta","text":"Hello"}\n\n',
            'data: {"type":"done","stopReason":"end_turn"}\n\n',
          ]),
        ),
    );

    const events: AgentEvent[] = [];
    await streamChat({
      ...baseArgs,
      signal: new AbortController().signal,
      onEvent: (e) => events.push(e),
    });

    expect(events).toEqual([
      { type: 'status', status: 'thinking' },
      { type: 'text_delta', text: 'Hello' },
      { type: 'done', stopReason: 'end_turn' },
    ]);
  });

  it('reassembles a frame split across chunk boundaries', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(sseResponse(['data: {"type":"text_', 'delta","text":"split"}\n', '\n'])),
    );

    const events: AgentEvent[] = [];
    await streamChat({
      ...baseArgs,
      signal: new AbortController().signal,
      onEvent: (e) => events.push(e),
    });

    expect(events).toEqual([{ type: 'text_delta', text: 'split' }]);
  });

  it('skips a malformed frame without dropping the rest of the stream', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          sseResponse(['data: {not json}\n\n', 'data: {"type":"done","stopReason":null}\n\n']),
        ),
    );

    const events: AgentEvent[] = [];
    await streamChat({
      ...baseArgs,
      signal: new AbortController().signal,
      onEvent: (e) => events.push(e),
    });

    expect(events).toEqual([{ type: 'done', stopReason: null }]);
  });

  it('turns a non-OK response into an error event', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            error: { kind: 'not_configured', message: 'No model credential.', retryable: false },
          }),
          { status: 503, headers: { 'content-type': 'application/json' } },
        ),
      ),
    );

    const events: AgentEvent[] = [];
    await streamChat({
      ...baseArgs,
      signal: new AbortController().signal,
      onEvent: (e) => events.push(e),
    });

    expect(events[0]).toMatchObject({ type: 'error', error: { kind: 'not_configured' } });
    expect(events.at(-1)).toMatchObject({ type: 'done' });
  });

  it('posts the conversation, context, and confirmations', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(sseResponse(['data: {"type":"done","stopReason":null}\n\n']));
    vi.stubGlobal('fetch', fetchMock);

    await streamChat({
      ...baseArgs,
      confirmations: ['fp-1'],
      signal: new AbortController().signal,
      onEvent: () => undefined,
    });

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/copilot/chat');
    expect(JSON.parse(String(init.body))).toMatchObject({
      turns: [{ role: 'user', content: 'hi' }],
      confirmations: ['fp-1'],
    });
  });
});
