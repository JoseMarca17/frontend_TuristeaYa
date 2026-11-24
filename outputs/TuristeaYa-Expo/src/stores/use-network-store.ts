import { create } from 'zustand';

type PendingEntry = {
  id: string;
  label: string;
  isMutation: boolean;
  startedAt: number;
  slow: boolean;
};

type NetworkState = {
  pending: Record<string, PendingEntry>;
  activeCount: number;
  mutationCount: number;
  activeLabel: string;
  isSlow: boolean;
  begin: (id: string, label: string, isMutation: boolean) => void;
  markSlow: (id: string) => void;
  finish: (id: string) => void;
};

function computeStats(pending: Record<string, PendingEntry>) {
  const entries = Object.values(pending).sort((a, b) => b.startedAt - a.startedAt);
  const mutationEntry = entries.find((item) => item.isMutation);
  return {
    activeCount: entries.length,
    mutationCount: entries.filter((item) => item.isMutation).length,
    activeLabel: (mutationEntry ?? entries[0])?.label ?? '',
    isSlow: entries.some((item) => item.slow),
  };
}

export const useNetworkStore = create<NetworkState>((set) => ({
  pending: {},
  activeCount: 0,
  mutationCount: 0,
  activeLabel: '',
  isSlow: false,
  begin: (id, label, isMutation) =>
    set((state) => {
      const pending = {
        ...state.pending,
        [id]: { id, label, isMutation, startedAt: Date.now(), slow: false },
      };
      return { pending, ...computeStats(pending) };
    }),
  markSlow: (id) =>
    set((state) => {
      const current = state.pending[id];
      if (!current || current.slow) return state;
      const pending = { ...state.pending, [id]: { ...current, slow: true } };
      return { pending, ...computeStats(pending) };
    }),
  finish: (id) =>
    set((state) => {
      if (!(id in state.pending)) return state;
      const pending = { ...state.pending };
      delete pending[id];
      return { pending, ...computeStats(pending) };
    }),
}));
