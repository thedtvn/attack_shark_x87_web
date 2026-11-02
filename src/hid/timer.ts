// Chromium throttles main-thread timers in background/occluded pages (and in
// many automation windows) to ~1 s. HID pacing needs 15–120 ms delays, so a
// throttled sleep turns a 20 s 2.4G macro save into minutes. Dedicated worker
// timers are not subject to that throttling; their messages wake us on time.
let worker: Worker | null | undefined;
const pending = new Map<number, () => void>();
let nextId = 0;

function timerWorker(): Worker | null {
  if (worker !== undefined) return worker;
  worker = null;
  try {
    if (typeof Worker === 'undefined' || typeof Blob === 'undefined' || typeof URL.createObjectURL !== 'function') return null;
    const source = 'onmessage=e=>setTimeout(()=>postMessage(e.data[0]),e.data[1])';
    const w = new Worker(URL.createObjectURL(new Blob([source], { type: 'text/javascript' })));
    w.onmessage = (e: MessageEvent<number>) => {
      const fn = pending.get(e.data);
      pending.delete(e.data);
      fn?.();
    };
    worker = w;
  } catch {
    worker = null; // e.g. CSP forbids blob workers: fall back to normal timers.
  }
  return worker;
}

/** setTimeout that keeps its timing when the tab is in the background. Returns a cancel function. */
export function preciseTimeout(fn: () => void, ms: number): () => void {
  const w = timerWorker();
  if (!w) {
    const t = setTimeout(fn, ms);
    return () => clearTimeout(t);
  }
  const id = ++nextId;
  pending.set(id, fn);
  w.postMessage([id, ms]);
  return () => { pending.delete(id); };
}

export const sleep = (ms: number) => new Promise<void>((resolve) => { preciseTimeout(resolve, ms); });
