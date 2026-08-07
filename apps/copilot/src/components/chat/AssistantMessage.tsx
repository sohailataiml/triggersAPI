import { Fragment, type ReactNode } from 'react';

/**
 * Renders assistant text with light inline formatting.
 *
 * Deliberately not a Markdown renderer: model output can quote event payloads
 * that a third party controls, so everything goes through React's escaping as
 * text nodes. There is no `dangerouslySetInnerHTML` anywhere in this app, which
 * makes HTML injection structurally impossible rather than filtered.
 */

const INLINE = /(`[^`\n]+`|\*\*[^*\n]+\*\*)/g;

function renderInline(text: string, keyPrefix: string): ReactNode[] {
  return text.split(INLINE).map((chunk, index) => {
    const key = `${keyPrefix}-${index}`;
    if (chunk.startsWith('`') && chunk.endsWith('`') && chunk.length > 2) {
      return (
        <code key={key} className="mono rounded bg-surface-2 px-1 py-0.5 text-[0.8em] text-text">
          {chunk.slice(1, -1)}
        </code>
      );
    }
    if (chunk.startsWith('**') && chunk.endsWith('**') && chunk.length > 4) {
      return (
        <strong key={key} className="font-semibold text-text">
          {chunk.slice(2, -2)}
        </strong>
      );
    }
    return <Fragment key={key}>{chunk}</Fragment>;
  });
}

export function AssistantMessage({ text, streaming }: { text: string; streaming: boolean }) {
  const blocks = text
    .split('\n')
    .filter((line, index, all) => line.trim() || all[index - 1]?.trim());

  return (
    <div className="animate-fade-up text-sm leading-relaxed text-muted">
      {blocks.map((line, index) => {
        const bullet = /^\s*[-*]\s+/.exec(line);
        if (bullet) {
          return (
            <p key={index} className="flex gap-2 py-0.5 pl-1">
              <span className="mt-[0.45rem] h-1 w-1 shrink-0 rounded-full bg-faint" aria-hidden />
              <span>{renderInline(line.slice(bullet[0].length), `b${index}`)}</span>
            </p>
          );
        }
        return (
          <p key={index} className={line.trim() ? 'py-0.5' : 'h-2'}>
            {renderInline(line, `l${index}`)}
          </p>
        );
      })}
      {streaming && (
        <span
          className="ml-0.5 inline-block h-3.5 w-[2px] translate-y-0.5 animate-pulse bg-accent"
          aria-label="Assistant is still writing"
        />
      )}
    </div>
  );
}
