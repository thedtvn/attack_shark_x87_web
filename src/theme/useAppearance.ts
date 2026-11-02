import { useContext } from 'react';
import { AppearanceContext, type AppearanceContextValue } from './AppearanceContext';

export function useAppearance(): AppearanceContextValue {
  const ctx = useContext(AppearanceContext);
  if (!ctx) {
    throw new Error('useAppearance must be used within an AppearanceProvider');
  }
  return ctx;
}
