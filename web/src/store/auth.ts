'use client';
import { create } from 'zustand';
import { User, getMe, logout as apiLogout } from '../lib/api';

interface AuthState {
  user: User | null;
  loading: boolean;
  initialized: boolean;
  initialize: () => Promise<void>;
  logout: () => Promise<void>;
}

export const useAuth = create<AuthState>((set) => ({
  user: null,
  loading: false,
  initialized: false,

  initialize: async () => {
    set({ loading: true });
    try {
      const user = await getMe();
      set({ user, loading: false, initialized: true });
    } catch {
      set({ user: null, loading: false, initialized: true });
    }
  },

  logout: async () => {
    try {
      await apiLogout();
    } finally {
      set({ user: null });
      window.location.href = '/';
    }
  },
}));
