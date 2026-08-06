import { useRef, useState } from 'react';
import { CheckCircle2, CircleDashed, Loader2, PlayCircle, Wand2, XCircle } from 'lucide-react';
import { useApi, useSettings } from '../../app/apiContext';
import { useSubscriptions } from '../../hooks/queries';
import { SCENARIOS, type DemoStep, type Scenario } from './scenarios';

let stepSeq = 0;

/**
 * Guided three-step demo. Every scenario drives the REAL backend (ingest, lease,
 * ACK/NACK, replay) and narrates each step from actual responses — no hard-coded
 * final states. Scenario C restores the subscription's retry budget on finish.
 */
export function DemoRunner({ onChange }: { onChange: () => void }) {
  const api = useApi();
  const { consumerToken, adminToken, producerToken } = useSettings();
  const { data: subscriptions = [] } = useSubscriptions();

  const [subId, setSubId] = useState('');
  const [running, setRunning] = useState<Scenario['id'] | null>(null);
  const [steps, setSteps] = useState<DemoStep[]>([]);
  const [note, setNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const cancelled = useRef(false);

  const sub = subscriptions.find((s) => s.id === (subId || subscriptions[0]?.id));
  const canConsume = Boolean(consumerToken && producerToken);
  const canAdmin = Boolean(adminToken);

  async function step<T>(text: string, fn: () => Promise<T> | T, detail?: (r: T) => string) {
    const id = ++stepSeq;
    setSteps((prev) => [...prev, { id, text, state: 'run' }]);
    try {
      const r = await fn();
      const d = detail ? detail(r) : typeof r === 'string' ? r : undefined;
      setSteps((prev) => prev.map((s) => (s.id === id ? { ...s, state: 'done', detail: d } : s)));
      return r;
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'failed';
      setSteps((prev) => prev.map((s) => (s.id === id ? { ...s, state: 'fail', detail: msg } : s)));
      throw e;
    }
  }

  const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

  async function run(scenario: Scenario) {
    if (!sub || running) return;
    cancelled.current = false;
    setRunning(scenario.id);
    setSteps([]);
    setNote(null);
    setError(null);
    try {
      await scenario.run({
        api,
        sub,
        step,
        note: (t) => setNote(t),
        sleep,
        onChange,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Scenario failed');
    } finally {
      setRunning(null);
    }
  }

  return (
    <div className="panel panel-pad">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Wand2 size={15} className="text-accent" aria-hidden />
          <h2 className="text-sm font-semibold text-text">Guided demo</h2>
        </div>
        <select
          className="input h-8 max-w-[220px] py-0 text-xs"
          value={sub?.id ?? ''}
          onChange={(e) => setSubId(e.target.value)}
          aria-label="Subscription for the demo"
        >
          {subscriptions.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </div>

      {!canConsume && (
        <p className="mb-3 rounded-lg border border-leased/30 bg-leased/10 px-3 py-2 text-xs text-leased">
          Add PRODUCER and CONSUMER tokens in Settings to run the guided scenarios.
        </p>
      )}

      <div className="grid gap-2 sm:grid-cols-3">
        {SCENARIOS.map((s) => {
          const blocked = s.needsAdmin && !canAdmin;
          const disabled = !canConsume || blocked || Boolean(running) || !sub;
          return (
            <button
              key={s.id}
              type="button"
              onClick={() => run(s)}
              disabled={disabled}
              className="flex flex-col items-start gap-1 rounded-lg border border-border bg-surface-2/50 p-3 text-left transition hover:border-accent/50 hover:bg-surface-2 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <span className="flex items-center gap-1.5 text-sm font-medium text-text">
                {running === s.id ? (
                  <Loader2 size={14} className="animate-spin text-accent" aria-hidden />
                ) : (
                  <PlayCircle size={14} className="text-accent" aria-hidden />
                )}
                {s.id}. {s.label}
              </span>
              <span className="text-xs text-muted">{s.blurb}</span>
            </button>
          );
        })}
      </div>

      {steps.length > 0 && (
        <ol className="mt-4 space-y-1.5">
          {steps.map((s) => (
            <li key={s.id} className="flex items-start gap-2 text-sm">
              <span className="mt-0.5 shrink-0">
                {s.state === 'run' ? (
                  <Loader2 size={14} className="animate-spin text-accent" aria-hidden />
                ) : s.state === 'done' ? (
                  <CheckCircle2 size={14} className="text-ack" aria-hidden />
                ) : (
                  <XCircle size={14} className="text-dead" aria-hidden />
                )}
              </span>
              <span className="min-w-0">
                <span className={s.state === 'fail' ? 'text-dead' : 'text-text'}>{s.text}</span>
                {s.detail && <span className="ml-1.5 text-xs text-muted">— {s.detail}</span>}
              </span>
            </li>
          ))}
        </ol>
      )}

      {note && (
        <p className="mt-3 flex items-start gap-1.5 text-xs text-muted">
          <CircleDashed size={13} className="mt-0.5 shrink-0 text-accent" aria-hidden />
          {note}
        </p>
      )}
      {error && <p className="mt-2 text-xs text-dead">{error}</p>}
    </div>
  );
}
