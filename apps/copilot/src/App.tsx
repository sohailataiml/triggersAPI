import { useCallback, useState } from 'react';
import { ExternalLink, Loader2, Maximize2, Minimize2, Zap } from 'lucide-react';
import { CapabilityStrip } from './components/CapabilityStrip';
import { CommandPalette, type PaletteCommand } from './components/CommandPalette';
import { DemoScenarioPicker } from './components/DemoScenarioPicker';
import { SetupScreen } from './components/SetupScreen';
import { ChatPanel } from './components/chat/ChatPanel';
import { LiveContextPanel } from './components/context/LiveContextPanel';
import { useActivityStream } from './hooks/useActivityStream';
import { useCapabilities } from './hooks/useCapabilities';
import { useCopilot } from './hooks/useCopilot';

export function App() {
  const { capabilities, phase, reconnecting, reconnect } = useCapabilities();
  const [demoMode, setDemoMode] = useState(false);

  const copilot = useCopilot();
  useActivityStream();

  const send = useCallback((text: string) => void copilot.send(text), [copilot]);

  const commands: PaletteCommand[] = [
    { id: 'new', label: 'New conversation', run: copilot.clear },
    {
      id: 'overview',
      label: 'Show system overview',
      requires: 'get_overview',
      run: () => send("What's going on in the system?"),
    },
    {
      id: 'pending',
      label: 'Show pending deliveries',
      requires: 'list_deliveries',
      run: () => send('What deliveries are pending right now?'),
    },
    {
      id: 'demo-event',
      label: 'Send GitHub demo event',
      requires: 'ingest_event',
      run: () => send('Send a GitHub pull_request.opened event for repository acme/widgets.'),
    },
    {
      id: 'inbox',
      label: 'Check the inbox',
      requires: 'lease_deliveries',
      run: () => send('Check the inbox and lease the next delivery.'),
    },
    {
      id: 'dead',
      label: 'View dead letters',
      requires: 'list_deliveries',
      run: () => send('Show me any dead-letter deliveries.'),
    },
    {
      id: 'explorer',
      label: 'Open Explorer',
      run: () =>
        window.open(capabilities?.explorerUrl ?? 'http://localhost:5173', '_blank', 'noreferrer'),
    },
    {
      id: 'demo-mode',
      label: demoMode ? 'Exit presentation mode' : 'Enter presentation mode',
      run: () => setDemoMode((value) => !value),
    },
  ];

  const ready = phase === 'ready' && Boolean(capabilities?.llm.configured);

  return (
    <div className={`flex h-full flex-col ${demoMode ? 'demo-mode' : ''}`}>
      <header className="shrink-0 border-b border-border bg-bg/80 backdrop-blur-md">
        <div className="mx-auto flex max-w-[1600px] items-center gap-3 px-4 py-3 sm:px-6">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl border border-accent/30 bg-accent-soft text-accent shadow-glow">
            <Zap size={18} aria-hidden />
          </span>
          <div className="min-w-0">
            <h1 className="truncate text-[0.95rem] font-semibold leading-tight tracking-tight">
              Zapier <span className="text-accent">AI Automation</span> Copilot
            </h1>
            <p className="truncate text-xs text-muted">
              Agentic event operations powered by TriggersAPI + MCP
            </p>
          </div>

          <div className="ml-auto flex items-center gap-2">
            {!demoMode && (
              <a
                className="btn btn-ghost hidden h-8 px-2.5 text-xs text-muted sm:inline-flex"
                href={capabilities?.explorerUrl ?? 'http://localhost:5173'}
                target="_blank"
                rel="noreferrer noopener"
              >
                <ExternalLink size={13} aria-hidden />
                Explorer
              </a>
            )}
            <button
              type="button"
              onClick={() => setDemoMode((value) => !value)}
              className="btn btn-ghost h-8 px-2.5 text-xs text-muted"
              aria-pressed={demoMode}
            >
              {demoMode ? <Minimize2 size={13} aria-hidden /> : <Maximize2 size={13} aria-hidden />}
              <span className="hidden sm:inline">{demoMode ? 'Exit' : 'Present'}</span>
            </button>
          </div>
        </div>
      </header>

      {!demoMode && (
        <CapabilityStrip
          capabilities={capabilities}
          onReconnect={() => void reconnect()}
          reconnecting={reconnecting}
        />
      )}

      <main className="mx-auto min-h-0 w-full max-w-[1600px] flex-1 px-4 py-4 sm:px-6">
        {phase === 'connecting' ? (
          <ConnectingState />
        ) : !ready ? (
          <SetupScreen capabilities={capabilities} />
        ) : (
          <div className="grid h-full min-h-0 grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
            <ChatPanel
              items={copilot.items}
              status={copilot.status}
              busy={copilot.busy}
              capabilities={capabilities}
              demoMode={demoMode}
              onSend={send}
              onCancel={copilot.cancel}
              onRetry={() => void copilot.retry()}
              onApprove={(id) => void copilot.approveAndResume(id)}
              onDecline={copilot.decline}
              onClear={copilot.clear}
            />

            <aside className="min-h-0 space-y-3 overflow-y-auto lg:pb-2" aria-label="Live context">
              <LiveContextPanel context={copilot.context} capabilities={capabilities} />
              {!demoMode && (
                <DemoScenarioPicker
                  capabilities={capabilities}
                  onRun={send}
                  disabled={copilot.busy}
                />
              )}
            </aside>
          </div>
        )}
      </main>

      <footer className="shrink-0 border-t border-border px-4 py-2 text-center text-xs text-faint sm:px-6">
        Demo project for the GauntletAI × Zapier Partner Challenge. Not an official Zapier product.
        <span className="ml-2 hidden sm:inline">Press ⌘K / Ctrl+K for commands.</span>
      </footer>

      <CommandPalette commands={commands} capabilities={capabilities} />
    </div>
  );
}

/**
 * Shown while the backend is still coming up. A demo starts every process at
 * once, so this is the expected first second or two — not an error state.
 */
function ConnectingState() {
  return (
    <div className="mt-24 flex flex-col items-center text-center" role="status" aria-live="polite">
      <Loader2 size={22} className="animate-spin text-accent" aria-hidden />
      <p className="mt-3 text-sm text-muted">Connecting to the Triggers MCP server…</p>
      <p className="mt-1 text-xs text-faint">This retries automatically while the stack starts.</p>
    </div>
  );
}
