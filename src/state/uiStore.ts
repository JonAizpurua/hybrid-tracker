import { create } from 'zustand';

type Toast = { id: string; message: string; tone: 'success' | 'info' | 'error' };
type UIStore = {
  toasts: Toast[];
  pushToast: (message: string, tone?: Toast['tone']) => void;
  removeToast: (id: string) => void;
};

export const useUIStore = create<UIStore>((set) => ({
  toasts: [],
  pushToast: (message, tone = 'info') => {
    const id = crypto.randomUUID();
    set((state) => ({ toasts: [...state.toasts, { id, message, tone }] }));
    window.setTimeout(() => set((state) => ({ toasts: state.toasts.filter((toast) => toast.id !== id) })), 3500);
  },
  removeToast: (id) => set((state) => ({ toasts: state.toasts.filter((toast) => toast.id !== id) }))
}));
