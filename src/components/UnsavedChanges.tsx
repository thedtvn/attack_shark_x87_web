import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';

interface Guard {
  register: (dirty: boolean) => void;
  allowLeave: () => boolean;
  pulse: number;
}
const Context = createContext<Guard>({ register: () => {}, allowLeave: () => true, pulse: 0 });

/** One mounted editor owns unsaved state; navigation never silently discards it. */
export function UnsavedChangesProvider({ children }: { children: ReactNode }) {
  const dirty = useRef(false);
  const [pulse, setPulse] = useState(0);
  const register = useCallback((value: boolean) => { dirty.current = value; }, []);
  const allowLeave = useCallback(() => {
    if (!dirty.current) return true;
    setPulse(n => n + 1);
    return false;
  }, []);
  useEffect(() => {
    const beforeUnload = (e: BeforeUnloadEvent) => {
      if (!dirty.current) return;
      e.preventDefault();
      e.returnValue = ''; // Browser controls wording and whether the prompt is shown.
    };
    window.addEventListener('beforeunload', beforeUnload);
    return () => window.removeEventListener('beforeunload', beforeUnload);
  }, []);
  return <Context.Provider value={{ register, allowLeave, pulse }}>{children}</Context.Provider>;
}

export function useUnsavedNavigation() {
  return useContext(Context).allowLeave;
}

export function useUnsavedChanges(dirty: boolean) {
  const { register, allowLeave, pulse } = useContext(Context);
  const barRef = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    register(dirty);
    return () => register(false);
  }, [dirty, register]);
  useEffect(() => {
    if (!pulse || !dirty) return;
    const bar = barRef.current;
    bar?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    bar?.focus({ preventScroll: true });
    if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      bar?.animate([
        { transform: 'translateX(0)' }, { transform: 'translateX(-8px)' },
        { transform: 'translateX(8px)' }, { transform: 'translateX(-5px)' },
        { transform: 'translateX(5px)' }, { transform: 'translateX(0)' },
      ], { duration: 360 });
    }
  }, [pulse, dirty]);
  return { barRef, allowLeave };
}
