import { create } from "zustand";
import { persist } from "zustand/middleware";
import { api } from "./api";
import type { User } from "./types";

type AuthState = {
  user: User | null;
  ready: boolean;
  setUser: (user: User | null) => void;
  refresh: () => Promise<void>;
  logout: () => Promise<void>;
};

export const useAuth = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      ready: false,
      setUser: (user) => set({ user, ready: true }),
      refresh: async () => {
        try {
          const result = await api<{ user: User }>("/auth/me");
          set({ user: result.user, ready: true });
        } catch {
          set({ user: null, ready: true });
        }
      },
      logout: async () => {
        await api("/auth/logout", { method: "POST" });
        set({ user: null, ready: true });
      },
    }),
    {
      name: "naturax-session",
      partialize: (state) => ({ user: state.user }),
      onRehydrateStorage: () => (state) => {
        void state?.refresh();
      },
    },
  ),
);
