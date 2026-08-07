import { useEffect, useRef, useState } from 'react';
import { ArrowUp, Square } from 'lucide-react';

export function ChatComposer({
  onSend,
  onCancel,
  busy,
  disabled,
  placeholder = 'Ask the Copilot to operate TriggersAPI…',
}: {
  onSend: (text: string) => void;
  onCancel: () => void;
  busy: boolean;
  disabled: boolean;
  placeholder?: string;
}) {
  const [value, setValue] = useState('');
  const ref = useRef<HTMLTextAreaElement>(null);

  // Grow with content instead of scrolling a two-line box.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  }, [value]);

  const submit = () => {
    const trimmed = value.trim();
    if (!trimmed || busy || disabled) return;
    setValue('');
    onSend(trimmed);
  };

  return (
    <form
      className="flex items-end gap-2"
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
    >
      <label className="sr-only" htmlFor="copilot-composer">
        Message the Copilot
      </label>
      <textarea
        id="copilot-composer"
        ref={ref}
        rows={1}
        value={value}
        disabled={disabled}
        placeholder={disabled ? 'Copilot unavailable' : placeholder}
        onChange={(event) => setValue(event.target.value)}
        onKeyDown={(event) => {
          // Enter sends; Shift+Enter inserts a newline.
          if (event.key === 'Enter' && !event.shiftKey) {
            event.preventDefault();
            submit();
          }
        }}
        className="input max-h-40 min-h-[2.5rem] resize-none py-2"
      />

      {busy ? (
        <button type="button" onClick={onCancel} className="btn h-10 shrink-0 px-3">
          <Square size={14} aria-hidden />
          Stop
        </button>
      ) : (
        <button
          type="submit"
          disabled={disabled || !value.trim()}
          className="btn btn-primary h-10 w-10 shrink-0 p-0"
          aria-label="Send message"
        >
          <ArrowUp size={16} aria-hidden />
        </button>
      )}
    </form>
  );
}
