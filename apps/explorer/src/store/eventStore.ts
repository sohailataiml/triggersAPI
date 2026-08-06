import { create } from 'zustand';
import type { Activity } from '../types';

/** An SSE activity plus local receive metadata for dedup and ordering. */
export interface ActivityRecord extends Activity {
  /** Stable id — the Redis Stream id from the SSE frame (or a synthesized one). */
  id: string;
  receivedAt: number;
}

const MAX_ACTIVITIES = 300;

interface EventState {
  activities: ActivityRecord[];
  seen: Set<string>;
  connected: boolean;
  everConnected: boolean;
  /** Bumps whenever a fresh (non-duplicate) activity is applied. */
  revision: number;
  pushActivity: (record: ActivityRecord) => boolean;
  setConnected: (connected: boolean) => void;
  clear: () => void;
}

/**
 * Single source of truth for SSE-derived activity. Deduplicates by stream id so
 * out-of-order or replayed frames (e.g. after a reconnect with Last-Event-ID)
 * never double-count. PostgreSQL remains authoritative for entity state; this
 * store only holds the live lifecycle feed and the derived pipeline.
 */
export const useEventStore = create<EventState>((set, get) => ({
  activities: [],
  seen: new Set<string>(),
  connected: false,
  everConnected: false,
  revision: 0,

  pushActivity: (record) => {
    if (get().seen.has(record.id)) return false;
    set((s) => {
      const seen = new Set(s.seen);
      seen.add(record.id);
      const activities = [record, ...s.activities].slice(0, MAX_ACTIVITIES);
      // Keep the seen set bounded to what we still display, plus a little slack.
      if (seen.size > MAX_ACTIVITIES * 2) {
        const keep = new Set(activities.map((a) => a.id));
        return { activities, seen: keep, revision: s.revision + 1 };
      }
      return { activities, seen, revision: s.revision + 1 };
    });
    return true;
  },

  setConnected: (connected) =>
    set((s) => ({ connected, everConnected: s.everConnected || connected })),

  clear: () => set({ activities: [], seen: new Set<string>(), revision: 0 }),
}));
