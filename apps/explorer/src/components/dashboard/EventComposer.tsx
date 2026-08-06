import { useState } from 'react';
import { ChevronDown, Send, Sparkles } from 'lucide-react';
import { useApi, useSettings } from '../../app/apiContext';
import { EVENT_PRESETS, sourceMeta, type EventPreset } from '../../lib/samples';
import { shortId } from '../../lib/format';
import { CopyButton } from '../shared/CopyButton';
import { ErrorState } from '../shared/States';

interface SuccessInfo {
  eventId: string;
  matched: number;
  duplicate: boolean;
}

/** Polished "Send test event" composer with presets and inline JSON validation. */
export function EventComposer({ onIngested }: { onIngested: () => void }) {
  const api = useApi();
  const { producerToken } = useSettings();

  const [presetId, setPresetId] = useState<string>(EVENT_PRESETS[2].id);
  const [source, setSource] = useState(EVENT_PRESETS[2].source);
  const [eventType, setEventType] = useState(EVENT_PRESETS[2].eventType);
  const [subject, setSubject] = useState(EVENT_PRESETS[2].subject);
  const [payload, setPayload] = useState(JSON.stringify(EVENT_PRESETS[2].payload, null, 2));
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [idempotencyKey, setIdempotencyKey] = useState('');
  const [metadata, setMetadata] = useState('');

  const [jsonError, setJsonError] = useState<string | null>(null);
  const [apiError, setApiError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [success, setSuccess] = useState<SuccessInfo | null>(null);

  const hasProducer = Boolean(producerToken);

  function applyPreset(p: EventPreset) {
    setPresetId(p.id);
    setSource(p.source);
    setEventType(p.eventType);
    setSubject(p.subject);
    setPayload(JSON.stringify(p.payload, null, 2));
    setJsonError(null);
    setSuccess(null);
  }

  function validateJson(text: string, label: string): Record<string, unknown> | null | 'error' {
    if (!text.trim()) return label === 'metadata' ? null : {};
    try {
      const parsed = JSON.parse(text);
      if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
        setJsonError(`${label} must be a JSON object`);
        return 'error';
      }
      return parsed as Record<string, unknown>;
    } catch (e) {
      setJsonError(`${label}: ${e instanceof Error ? e.message : 'invalid JSON'}`);
      return 'error';
    }
  }

  async function submit() {
    setJsonError(null);
    setApiError(null);

    const parsedPayload = validateJson(payload, 'payload');
    if (parsedPayload === 'error') return;
    const parsedMeta = validateJson(metadata, 'metadata');
    if (parsedMeta === 'error') return;

    setBusy(true);
    try {
      const res = await api.ingest(
        {
          source,
          eventType,
          subject: subject || undefined,
          payload: parsedPayload ?? {},
          metadata: parsedMeta ?? undefined,
        },
        idempotencyKey || undefined,
      );
      setSuccess({
        eventId: res.eventId,
        matched: res.matchedSubscriptions,
        duplicate: res.duplicate,
      });
      onIngested();
    } catch (e) {
      setApiError(e instanceof Error ? e.message : 'Failed to send event');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="panel panel-pad">
      <div className="mb-3 flex items-center gap-2">
        <Sparkles size={15} className="text-accent" aria-hidden />
        <h2 className="text-sm font-semibold text-text">Send test event</h2>
      </div>

      {!hasProducer && (
        <p className="mb-3 rounded-lg border border-leased/30 bg-leased/10 px-3 py-2 text-xs text-leased">
          Add a PRODUCER token in Settings to ingest events.
        </p>
      )}

      {/* presets */}
      <div className="mb-3 flex flex-wrap gap-1.5">
        {EVENT_PRESETS.map((p) => (
          <button
            key={p.id}
            type="button"
            onClick={() => applyPreset(p)}
            className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs transition ${
              presetId === p.id
                ? 'border-accent/50 bg-accent-soft text-accent'
                : 'border-border bg-surface-2/60 text-muted hover:text-text'
            }`}
          >
            <span aria-hidden>{sourceMeta(p.source).glyph}</span>
            {p.label}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-2">
        <label className="block">
          <span className="field-label">Source</span>
          <input
            className="input mt-1"
            value={source}
            onChange={(e) => setSource(e.target.value)}
          />
        </label>
        <label className="block">
          <span className="field-label">Event type</span>
          <input
            className="input mt-1"
            value={eventType}
            onChange={(e) => setEventType(e.target.value)}
          />
        </label>
      </div>
      <label className="mt-2 block">
        <span className="field-label">Subject / routing key</span>
        <input
          className="input mt-1"
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
        />
      </label>

      <label className="mt-2 block">
        <span className="field-label">Payload (JSON)</span>
        <textarea
          className="input mt-1 min-h-[110px] resize-y font-mono text-[0.78rem] leading-relaxed"
          spellCheck={false}
          value={payload}
          onChange={(e) => {
            setPayload(e.target.value);
            setJsonError(null);
          }}
        />
      </label>

      <button
        type="button"
        onClick={() => setAdvancedOpen((v) => !v)}
        className="mt-2 inline-flex items-center gap-1 text-xs text-muted hover:text-text"
        aria-expanded={advancedOpen}
      >
        <ChevronDown
          size={13}
          className={`transition ${advancedOpen ? 'rotate-180' : ''}`}
          aria-hidden
        />
        Advanced
      </button>
      {advancedOpen && (
        <div className="mt-2 space-y-2 rounded-lg border border-border bg-bg/40 p-3">
          <label className="block">
            <span className="field-label">Idempotency key</span>
            <input
              className="input mt-1 font-mono"
              placeholder="optional — dedupes repeat sends"
              value={idempotencyKey}
              onChange={(e) => setIdempotencyKey(e.target.value)}
            />
          </label>
          <label className="block">
            <span className="field-label">Metadata (JSON)</span>
            <textarea
              className="input mt-1 min-h-[60px] resize-y font-mono text-[0.78rem]"
              spellCheck={false}
              placeholder='{"traceId": "…"}'
              value={metadata}
              onChange={(e) => {
                setMetadata(e.target.value);
                setJsonError(null);
              }}
            />
          </label>
        </div>
      )}

      {jsonError && <div className="mt-2 text-xs text-dead">{jsonError}</div>}
      {apiError && (
        <div className="mt-2">
          <ErrorState message={apiError} />
        </div>
      )}

      {success && (
        <div className="mt-3 flex flex-wrap items-center gap-2 rounded-lg border border-ack/30 bg-ack/10 px-3 py-2 text-xs text-ack animate-fade-up">
          <span className="font-medium">
            {success.duplicate ? 'Duplicate (idempotent)' : 'Accepted'}
          </span>
          <span className="mono text-ack/90">{shortId(success.eventId)}</span>
          <CopyButton value={success.eventId} label="id" />
          <span className="text-ack/80">
            · {success.matched} subscription{success.matched === 1 ? '' : 's'} matched
          </span>
        </div>
      )}

      <button
        type="button"
        onClick={submit}
        disabled={busy || !hasProducer}
        className="btn btn-primary mt-3 w-full"
      >
        <Send size={14} aria-hidden />
        {busy ? 'Sending…' : 'Send event'}
      </button>
    </div>
  );
}
