import { create } from "zustand";

interface SettingsState {
  preferredLanguages: string[];
  setPreferredLanguages: (langs: string[]) => void;
}

export const useSettingsStore = create<SettingsState>((set) => ({
  preferredLanguages: ["en"],
  setPreferredLanguages: (preferredLanguages) => set({ preferredLanguages }),
})); 