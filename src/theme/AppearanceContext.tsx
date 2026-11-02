import { createContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  DEFAULT_APPEARANCE,
  type KeyboardAppearance,
  loadAppearance,
  PRESET_CHARCOAL,
  PRESET_CREAM,
  saveAppearance,
  deriveKeyboardPalette,
  type DerivedKeyboardPalette,
  isValidHex,
  normalizeHex,
  type CustomizableColorKey,
} from './appearance';

export interface AppearanceContextValue {
  appearance: KeyboardAppearance;
  palette: DerivedKeyboardPalette;
  setPreset: (preset: 'charcoal' | 'cream') => void;
  setColor: (key: CustomizableColorKey, hex: string) => void;
  resetToPreset: (preset: 'charcoal' | 'cream') => void;
  resetToDefault: () => void;
  isCustom: boolean;
}

export const AppearanceContext = createContext<AppearanceContextValue | null>(null);

export function AppearanceProvider({ children }: { children: ReactNode }) {
  const [appearance, setAppearance] = useState<KeyboardAppearance>(() => loadAppearance());

  // Save changes to localStorage
  useEffect(() => {
    saveAppearance(appearance);
  }, [appearance]);

  const palette = useMemo(() => deriveKeyboardPalette(appearance), [appearance]);

  const setPreset = (preset: 'charcoal' | 'cream') => {
    const next = preset === 'cream' ? { ...PRESET_CREAM } : { ...PRESET_CHARCOAL };
    setAppearance(next);
  };

  const setColor = (key: CustomizableColorKey, hex: string) => {
    if (!isValidHex(hex)) return;
    const clean = normalizeHex(hex);
    setAppearance((prev) => {
      const next: KeyboardAppearance = {
        ...prev,
        preset: 'custom',
        [key]: clean,
      };
      return next;
    });
  };

  const resetToPreset = (preset: 'charcoal' | 'cream') => {
    setPreset(preset);
  };

  const resetToDefault = () => {
    setAppearance({ ...DEFAULT_APPEARANCE });
  };

  const isCustom = appearance.preset === 'custom';

  return (
    <AppearanceContext.Provider
      value={{
        appearance,
        palette,
        setPreset,
        setColor,
        resetToPreset,
        resetToDefault,
        isCustom,
      }}
    >
      {children}
    </AppearanceContext.Provider>
  );
}

export { useAppearance } from './useAppearance';
