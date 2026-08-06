import { useEffect, useRef, type ReactNode } from 'react';
import { X } from 'lucide-react';

/**
 * Right-side drawer with overlay, Escape-to-close, and basic focus handling.
 * Motion is transform/opacity only and disabled under prefers-reduced-motion.
 */
export function Drawer({
  open,
  onClose,
  title,
  subtitle,
  children,
  width = 460,
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  subtitle?: ReactNode;
  children: ReactNode;
  width?: number;
}) {
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    // Move focus into the panel for keyboard users.
    panelRef.current?.focus();
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50" role="dialog" aria-modal="true">
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm animate-fade-up"
        onClick={onClose}
        aria-hidden
      />
      <div
        ref={panelRef}
        tabIndex={-1}
        className="absolute right-0 top-0 flex h-full max-w-[92vw] flex-col border-l border-border bg-surface shadow-pop outline-none"
        style={{ width }}
      >
        <div className="flex items-start justify-between gap-3 border-b border-border px-5 py-4">
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold text-text">{title}</div>
            {subtitle && <div className="mt-0.5 truncate text-xs text-muted">{subtitle}</div>}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="btn btn-ghost h-8 w-8 shrink-0 p-0"
            aria-label="Close"
          >
            <X size={16} aria-hidden />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-4">{children}</div>
      </div>
    </div>
  );
}
