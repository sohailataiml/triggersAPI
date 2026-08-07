import { create } from 'zustand';
import type { Activity } from '../types';

/** An SSE activity plus local metadata for dedup and ordering. */
export interface ActivityRecord extends Activity {
  /** Redis Stream id from the SSE frame, or a synthesized fallback. */
  id: string;
  receivedAt: number;
}

const MAX_ACTIVITIES = 100;

interface ActivityState {
  activities: ActivityRecord[];
  seen: Set<string>;
  connected: boolean;
  /** Bumps on each genuinely new frame, so consumers can refetch. */
  revision: number;
  push: (record: ActivityRecord) => boolean;
  setConnected: (connected: boolean) => void;
  clear: () => void;
}

/**
 * Live lifecycle feed for the context panel. Deduplicates by stream id so a
 * reconnect replay never double-counts. Postgres stays authoritative for entity
 * state; this is a hint layer only.
 */
export const useActivityStore = create<ActivityState>((set, get) => ({
  activities: [],
  seen: new Set<string>(),
  connected: false,
  revision: 0,

  push: (record) => {
    if (get().seen.has(record.id)) return false;
    set((state) => {
      const seen = new Set(state.seen);
      seen.add(record.id);
      const activities = [record, ...state.activities].slice(0, MAX_ACTIVITIES);
      if (seen.size > MAX_ACTIVITIES * 2) {
        return {
          activities,
          seen: new Set(activities.map((a) => a.id)),
          revision: state.revision + 1,
        };
      }
      return { activities, seen, revision: state.revision + 1 };
    });
    return true;
  },

  setConnected: (connected) => set({ connected }),
  clear: () => set({ activities: [], seen: new Set<string>(), revision: 0 }),
}));
