import Anthropic from '@anthropic-ai/sdk';
import type { Tool as McpTool } from '@modelcontextprotocol/sdk/types.js';
import type { Logger } from '@triggers/observability';
import type { CopilotConfig } from './config.js';
import { applyContext, contextFromToolResult, type SessionContext } from './context.js';
import { CopilotError, toCopilotError, type CopilotErrorShape } from './errors.js';
import { LeaseRegistry, redactLeaseTokens } from './leaseRegistry.js';
import { maskSensitive } from './masking.js';
import { CONFIRM_REQUIRED_TOOLS, MUTATING_TOOLS, type TriggersMcpClient } from './mcpClient.js';

/** Events streamed to the browser as the agent works. */
export type AgentEvent =
  | { type: 'status'; status: 'thinking' | 'responding' | 'calling_tool' }
  | { type: 'text_delta'; text: string }
  | {
      type: 'tool_call';
      id: string;
      name: string;
      /** Masked before it leaves this process. */
      args: unknown;
      mutating: boolean;
    }
  | {
      type: 'tool_result';
      id: string;
      ok: boolean;
      durationMs: number;
      /** Masked before it leaves this process. */
      result: unknown;
      error?: string;
    }
  | {
      type: 'tool_confirmation_required';
      id: string;
      name: string;
      args: unknown;
      fingerprint: string;
    }
  | { type: 'context'; context: SessionContext }
  | { type: 'error'; error: CopilotErrorShape }
  | { type: 'done'; stopReason: string | null };

export interface ChatTurn {
  role: 'user' | 'assistant';
  content: string;
}

export interface RunRequest {
  turns: ChatTurn[];
  context: SessionContext;
  /** Fingerprints of confirm-required tool calls the user explicitly approved. */
  confirmations: string[];
  signal: AbortSignal;
}

/**
 * Stable identity for one tool call, so a user's confirmation applies to
 * exactly the action they were shown and not to a later, different one.
 */
export function toolFingerprint(name: string, args: Record<string, unknown>): string {
  const sorted = Object.keys(args)
    .sort()
    .reduce<Record<string, unknown>>((acc, key) => {
      acc[key] = args[key];
      return acc;
    }, {});
  return `${name}:${JSON.stringify(sorted)}`;
}

/** MCP tool definitions map 1:1 onto Anthropic tool definitions. */
function toAnthropicTools(tools: McpTool[]): Anthropic.Tool[] {
  return tools.map((tool) => ({
    name: tool.name,
    description: tool.description ?? '',
    input_schema: tool.inputSchema as Anthropic.Tool.InputSchema,
  }));
}

/** Truncate an oversized tool result so one big list can't blow the budget. */
const MAX_TOOL_RESULT_CHARS = 24_000;

function clampToolText(text: string): string {
  if (text.length <= MAX_TOOL_RESULT_CHARS) return text;
  return `${text.slice(0, MAX_TOOL_RESULT_CHARS)}\n…[result truncated; narrow the query with filters or a smaller limit]`;
}

export class CopilotAgent {
  private readonly anthropic: Anthropic;
  /** Server-side custody of lease tokens; see leaseRegistry.ts. */
  private readonly leases: LeaseRegistry;

  constructor(
    private readonly config: CopilotConfig,
    private readonly mcp: TriggersMcpClient,
    private readonly log: Logger,
    anthropic?: Anthropic,
    leases?: LeaseRegistry,
  ) {
    this.leases = leases ?? new LeaseRegistry();
    this.anthropic =
      anthropic ??
      new Anthropic({
        apiKey: config.ANTHROPIC_API_KEY,
        maxRetries: 2,
      });
  }

  /**
   * Run one user turn to completion, yielding events as they happen.
   *
   * A manual loop rather than the SDK tool runner: the UI needs each tool call
   * surfaced the moment it starts and again when it settles, interleaved with
   * text deltas, and mutations must be gated on user confirmation before they
   * execute.
   */
  async *run(request: RunRequest, systemPrompt: string): AsyncGenerator<AgentEvent> {
    const { turns, signal } = request;
    let context = request.context;

    let tools: Anthropic.Tool[];
    try {
      tools = toAnthropicTools(await this.mcp.listTools());
    } catch (cause) {
      yield { type: 'error', error: this.shape(toCopilotError(cause)) };
      yield { type: 'done', stopReason: null };
      return;
    }

    const messages: Anthropic.MessageParam[] = turns.map((turn) => ({
      role: turn.role,
      content: turn.content,
    }));

    for (let iteration = 0; iteration < this.config.COPILOT_MAX_ITERATIONS; iteration += 1) {
      if (signal.aborted) {
        yield { type: 'done', stopReason: 'cancelled' };
        return;
      }

      yield { type: 'status', status: 'thinking' };

      let message: Anthropic.Message;
      try {
        message = yield* this.streamOnce(messages, tools, systemPrompt, signal);
      } catch (cause) {
        const error = toCopilotError(cause);
        if (error.kind === 'cancelled') {
          yield { type: 'done', stopReason: 'cancelled' };
          return;
        }
        yield { type: 'error', error: this.shape(error) };
        yield { type: 'done', stopReason: null };
        return;
      }

      // Safety classifiers can decline a request; content is empty or partial.
      if (message.stop_reason === 'refusal') {
        yield {
          type: 'error',
          error: {
            kind: 'llm_refusal',
            message:
              'The model declined to answer that request. Try rephrasing, or ask about the platform directly.',
            retryable: false,
          },
        };
        yield { type: 'done', stopReason: 'refusal' };
        return;
      }

      messages.push({ role: 'assistant', content: message.content });

      // A server-tool pause resumes by re-sending; we register none, but a
      // paused turn would otherwise silently truncate the answer.
      if (message.stop_reason === 'pause_turn') continue;

      const toolUses = message.content.filter(
        (block): block is Anthropic.ToolUseBlock => block.type === 'tool_use',
      );

      if (toolUses.length === 0) {
        yield { type: 'done', stopReason: message.stop_reason ?? 'end_turn' };
        return;
      }

      const results: Anthropic.ToolResultBlockParam[] = [];

      for (const use of toolUses) {
        const args = (use.input ?? {}) as Record<string, unknown>;
        const fingerprint = toolFingerprint(use.name, args);
        const needsConfirmation =
          CONFIRM_REQUIRED_TOOLS.has(use.name) && !request.confirmations.includes(fingerprint);

        if (needsConfirmation) {
          yield {
            type: 'tool_confirmation_required',
            id: use.id,
            name: use.name,
            args: maskSensitive(args),
            fingerprint,
          };
          results.push({
            type: 'tool_result',
            tool_use_id: use.id,
            is_error: true,
            content:
              'Not executed: this action is destructive and needs explicit confirmation from the user. Tell the user what it would do and ask them to confirm.',
          });
          continue;
        }

        // Settling a delivery needs the real lease token, which the server
        // holds. Substituting it here means the model never has to carry an
        // opaque credential it would otherwise reconstruct incorrectly.
        const effectiveArgs = this.leases.applyTo(use.name, args);

        yield {
          type: 'tool_call',
          id: use.id,
          name: use.name,
          args: maskSensitive(effectiveArgs),
          mutating: MUTATING_TOOLS.has(use.name),
        };
        yield { type: 'status', status: 'calling_tool' };

        const startedAt = Date.now();
        try {
          const outcome = await this.mcp.callTool(use.name, effectiveArgs, signal);
          const durationMs = Date.now() - startedAt;

          // The browser gets a masked copy; lease tokens are additionally kept
          // out of the model's context entirely (see leaseRegistry).
          yield {
            type: 'tool_result',
            id: use.id,
            ok: !outcome.isError,
            durationMs,
            result: maskSensitive(outcome.raw),
            ...(outcome.isError ? { error: outcome.text } : {}),
          };

          let modelText = outcome.text;

          if (!outcome.isError) {
            if (use.name === 'lease_deliveries') {
              const tokens = this.leases.remember(outcome.raw);
              modelText = redactLeaseTokens(modelText, tokens);
            }
            // A settled delivery's token is spent.
            if (
              (use.name === 'ack_delivery' || use.name === 'nack_delivery') &&
              typeof effectiveArgs.deliveryId === 'string'
            ) {
              this.leases.forget(effectiveArgs.deliveryId);
            }

            const update = contextFromToolResult(use.name, outcome.raw);
            if (Object.keys(update).length > 0) {
              context = applyContext(context, update);
              yield { type: 'context', context };
            }
          }

          results.push({
            type: 'tool_result',
            tool_use_id: use.id,
            is_error: outcome.isError,
            content: clampToolText(modelText),
          });
        } catch (cause) {
          const error = toCopilotError(cause);
          const durationMs = Date.now() - startedAt;
          this.log.warn({ tool: use.name, kind: error.kind }, 'MCP tool call failed');

          yield {
            type: 'tool_result',
            id: use.id,
            ok: false,
            durationMs,
            result: null,
            error: error.message,
          };
          results.push({
            type: 'tool_result',
            tool_use_id: use.id,
            is_error: true,
            content: error.message,
          });
        }
      }

      messages.push({ role: 'user', content: results });
    }

    yield {
      type: 'error',
      error: {
        kind: 'internal',
        message: `Stopped after ${this.config.COPILOT_MAX_ITERATIONS} tool rounds without finishing. Try a narrower request.`,
        retryable: true,
      },
    };
    yield { type: 'done', stopReason: 'max_iterations' };
  }

  /** One streamed model turn. Yields text deltas, returns the final message. */
  private async *streamOnce(
    messages: Anthropic.MessageParam[],
    tools: Anthropic.Tool[],
    systemPrompt: string,
    signal: AbortSignal,
  ): AsyncGenerator<AgentEvent, Anthropic.Message> {
    const stream = this.anthropic.beta.messages.stream(
      {
        model: this.config.COPILOT_MODEL,
        max_tokens: this.config.COPILOT_MAX_TOKENS,
        system: systemPrompt,
        messages,
        tools,
        thinking: { type: 'adaptive' },
        output_config: { effort: this.config.COPILOT_EFFORT },
        // Safety classifiers occasionally decline benign operational requests;
        // routing the refusal to Anthropic's recommended fallback recovers it
        // server-side instead of surfacing a dead end to the user.
        betas: ['server-side-fallback-2026-07-01'],
        fallbacks: 'default',
      } as Anthropic.Beta.Messages.MessageCreateParamsStreaming,
      { signal },
    );

    let responding = false;
    for await (const event of stream) {
      if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
        if (!responding) {
          responding = true;
          yield { type: 'status', status: 'responding' };
        }
        yield { type: 'text_delta', text: event.delta.text };
      }
    }

    return (await stream.finalMessage()) as Anthropic.Message;
  }

  private shape(error: CopilotError): CopilotErrorShape {
    return error.toJSON(this.config.NODE_ENV !== 'production');
  }
}
