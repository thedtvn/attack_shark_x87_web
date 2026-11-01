import { useCallback, useRef, useState } from 'react';

export type Run = <T>(label: string, fn: () => Promise<T>) => Promise<T | undefined>;

/** Serialises device operations and exposes status / errors for the UI. */
export function useBusy() {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const chain = useRef<Promise<unknown>>(Promise.resolve());
  const doneTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  const run: Run = useCallback((label, fn) => {
    const p = chain.current.then(async () => {
      setBusy(label);
      setError(null);
      try {
        const r = await fn();
        if (!label.startsWith('Reading')) {
          setDone('Saved to keyboard');
          clearTimeout(doneTimer.current);
          doneTimer.current = setTimeout(() => setDone(null), 1800);
        }
        return r;
      } catch (e) {
        console.error(e);
        setError(e instanceof Error ? e.message : String(e));
        return undefined;
      } finally {
        setBusy(null);
      }
    });
    chain.current = p;
    return p;
  }, []);

  return { busy, error, done, setError, run };
}
