'use client';
import { create } from 'zustand';

export type DraftPredictions = Record<string, string>; // matchId → predictedOutcome

const DRAFT_KEY = 'predictions_draft';

interface DraftState {
  drafts: DraftPredictions;
  dirty: Record<string, boolean>;
  conflictMatches: string[];
  setDraft: (matchId: string, outcome: string) => void;
  loadFromStorage: (dbPredictions: Record<string, { outcome: string; updatedAt: string }>) => void;
  clearDraft: (matchId: string) => void;
  clearAllDrafts: () => void;
  resolveConflict: (keep: boolean) => void;
}

interface StoredDraft {
  predictions: DraftPredictions;
  timestamps: Record<string, number>;
}

export const usePredictions = create<DraftState>((set, get) => ({
  drafts: {},
  dirty: {},
  conflictMatches: [],

  setDraft: (matchId, outcome) => {
    set((s) => ({
      drafts: { ...s.drafts, [matchId]: outcome },
      dirty: { ...s.dirty, [matchId]: true },
    }));
  },

  loadFromStorage: (dbPredictions) => {
    try {
      const raw = localStorage.getItem(DRAFT_KEY);
      if (!raw) return;

      const stored: StoredDraft = JSON.parse(raw);
      const conflicts: string[] = [];
      const mergedDrafts: DraftPredictions = {};

      for (const [matchId, localOutcome] of Object.entries(stored.predictions)) {
        const dbEntry = dbPredictions[matchId];
        const localTs = stored.timestamps[matchId] || 0;

        if (!dbEntry || localTs > new Date(dbEntry.updatedAt).getTime()) {
          mergedDrafts[matchId] = localOutcome;
          conflicts.push(matchId);
        }
      }

      if (conflicts.length > 0) {
        set({ drafts: mergedDrafts, conflictMatches: conflicts });
      } else {
        localStorage.removeItem(DRAFT_KEY);
      }
    } catch {
      // ignore corrupt storage
    }
  },

  clearDraft: (matchId) => {
    set((s) => {
      const newDrafts = { ...s.drafts };
      const newDirty = { ...s.dirty };
      delete newDrafts[matchId];
      delete newDirty[matchId];

      try {
        const raw = localStorage.getItem(DRAFT_KEY);
        if (raw) {
          const stored: StoredDraft = JSON.parse(raw);
          delete stored.predictions[matchId];
          delete stored.timestamps[matchId];
          if (Object.keys(stored.predictions).length === 0) {
            localStorage.removeItem(DRAFT_KEY);
          } else {
            localStorage.setItem(DRAFT_KEY, JSON.stringify(stored));
          }
        }
      } catch { /* ignore */ }

      return { drafts: newDrafts, dirty: newDirty };
    });
  },

  clearAllDrafts: () => {
    localStorage.removeItem(DRAFT_KEY);
    set({ drafts: {}, dirty: {}, conflictMatches: [] });
  },

  resolveConflict: (keep) => {
    if (!keep) {
      get().clearAllDrafts();
    } else {
      set({ conflictMatches: [] });
    }
  },
}));

export function saveDraftToStorage(matchId: string, outcome: string) {
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    const stored: StoredDraft = raw ? JSON.parse(raw) : { predictions: {}, timestamps: {} };
    stored.predictions[matchId] = outcome;
    stored.timestamps[matchId] = Date.now();
    localStorage.setItem(DRAFT_KEY, JSON.stringify(stored));
  } catch { /* ignore */ }
}
