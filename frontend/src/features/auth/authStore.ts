import { create } from 'zustand';

type AuthUiState = { sessionVersion: number; identityChanged: () => void };
export const useAuthUiStore = create<AuthUiState>((set) => ({
  sessionVersion: 0,
  identityChanged: () => set((state) => ({ sessionVersion: state.sessionVersion + 1 })),
}));
