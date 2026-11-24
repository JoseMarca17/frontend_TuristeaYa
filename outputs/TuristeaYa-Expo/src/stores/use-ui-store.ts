import { create } from 'zustand';

export type ToastTone = 'success' | 'error' | 'info';

export type ToastPayload = {
  id: number;
  message: string;
  tone: ToastTone;
};

type UiState = {
  toast: ToastPayload | null;
  showToast: (message: string, tone?: ToastTone) => void;
  clearToast: () => void;
};

let nextToastId = 1;
let hideTimer: ReturnType<typeof setTimeout> | undefined;

export const useUiStore = create<UiState>((set) => ({
  toast: null,
  showToast: (message, tone = 'info') => {
    const id = nextToastId++;
    if (hideTimer) clearTimeout(hideTimer);
    set({ toast: { id, message, tone } });
    hideTimer = setTimeout(() => {
      set((state) => (state.toast?.id === id ? { toast: null } : state));
    }, 4200);
  },
  clearToast: () => {
    if (hideTimer) clearTimeout(hideTimer);
    set({ toast: null });
  },
}));
