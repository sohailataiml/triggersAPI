import { KeyRound, Plug, TriangleAlert } from 'lucide-react';
import type { Capabilities } from '../types';

/**
 * Shown when the Copilot genuinely cannot run — no model credential, or no MCP
 * connection. It states what is missing rather than degrading into a chat box
 * that fails on first use.
 */
export function SetupScreen({ capabilities }: { capabilities: Capabilities | null }) {
  const llmMissing = !capabilities?.llm.configured;
  const mcpMissing = !capabilities?.mcp.connected;

  return (
    <div className="mx-auto mt-12 max-w-xl">
      <div className="panel panel-pad text-center">
        <span className="mx-auto grid h-14 w-14 place-items-center rounded-2xl border border-accent/30 bg-accent-soft text-accent shadow-glow">
          {llmMissing ? <KeyRound size={24} aria-hidden /> : <Plug size={24} aria-hidden />}
        </span>

        <h2 className="mt-5 text-lg font-semibold text-text">
          {llmMissing ? 'Add a model credential' : 'Connect the MCP server'}
        </h2>

        <p className="mt-2 text-sm text-muted">
          {llmMissing
            ? 'The Copilot runs its agent server-side, so the model key is read from the Copilot server environment and never reaches the browser.'
            : 'The Copilot reached its own server, but could not open a session with the TriggersAPI MCP server.'}
        </p>

        <div className="mt-5 space-y-3 text-left">
          {llmMissing && (
            <SetupStep
              title="Set ANTHROPIC_API_KEY"
              body="Add it to the repository .env, then restart the Copilot server."
              code={'ANTHROPIC_API_KEY=sk-ant-…'}
            />
          )}

          {mcpMissing && (
            <SetupStep
              title="Start the MCP server"
              body={
                capabilities?.mcp.error ??
                'Run the Triggers MCP server and point MCP_SERVER_URL at its /mcp endpoint.'
              }
              code={'pnpm dev:mcp'}
            />
          )}

          {mcpMissing && (
            <SetupStep
              title="Provide Triggers role tokens"
              body="Seed the workspace and set the tokens the Copilot forwards to MCP. Any subset works — the UI only offers what the tokens grant."
              code={'pnpm db:seed  →  TRIGGERS_{ADMIN,PRODUCER,CONSUMER}_TOKEN'}
            />
          )}
        </div>

        <p className="mt-5 flex items-start gap-2 rounded-lg border border-border bg-surface-2/50 px-3 py-2 text-left text-xs text-faint">
          <TriangleAlert size={14} className="mt-px shrink-0" aria-hidden />
          <span>
            Credentials are read from the Copilot server&apos;s environment only. Nothing is stored
            in the browser, and no token is ever sent to the page.
          </span>
        </p>
      </div>
    </div>
  );
}

function SetupStep({ title, body, code }: { title: string; body: string; code: string }) {
  return (
    <div className="rounded-lg border border-border bg-surface-2/40 p-3">
      <p className="text-sm font-medium text-text">{title}</p>
      <p className="mt-1 text-xs text-muted">{body}</p>
      <pre className="mono mt-2 overflow-x-auto rounded bg-bg/70 px-2.5 py-1.5 text-faint">
        {code}
      </pre>
    </div>
  );
}
