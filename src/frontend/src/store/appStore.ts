import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Client } from '@/types';

export interface CurrentUser {
  id: number;
  email: string;
  firstName: string;
  lastName: string;
  profile: { id: number; code: string; label: string; level?: number };
}

interface AppState {
  // Utilisateur connecté (mode dev)
  currentUser: CurrentUser | null;
  setCurrentUser: (user: CurrentUser | null) => void;

  // Client sélectionné
  selectedClientId: number | null;
  setSelectedClientId: (id: number | null) => void;

  // Période sélectionnée (YYYY-MM)
  selectedPeriod: string;
  setSelectedPeriod: (period: string) => void;

  // Sidebar collapsed
  sidebarCollapsed: boolean;
  toggleSidebar: () => void;

  // Cache des clients
  clients: Client[];
  setClients: (clients: Client[]) => void;
}

const defaultPeriod = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
};

export const useAppStore = create<AppState>()(
  persist(
    (set) => ({
      currentUser: null,
      setCurrentUser: (user) => set({ currentUser: user }),

      selectedClientId: null,
      setSelectedClientId: (id) => set({ selectedClientId: id }),

      selectedPeriod: defaultPeriod(),
      setSelectedPeriod: (period) => set({ selectedPeriod: period }),

      sidebarCollapsed: false,
      toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),

      clients: [],
      setClients: (clients) => set({ clients }),
    }),
    {
      name: 'portail-kpi-app',
      partialize: (state) => ({
        currentUser: state.currentUser,
        selectedClientId: state.selectedClientId,
        selectedPeriod: state.selectedPeriod,
        sidebarCollapsed: state.sidebarCollapsed,
      }),
    },
  ),
);
