import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { ConfirmDialog } from './ConfirmDialog';

interface Confirmation {
  title: string;
  message: string;
  confirmLabel?: string;
  danger?: boolean;
}
interface PopupApi {
  confirm: (options: Confirmation) => Promise<boolean>;
  alert: (message: string, title?: string) => void;
}
interface Request extends Confirmation {
  id: number;
  alertOnly?: boolean;
  resolve: (accepted: boolean) => void;
}
const Context = createContext<PopupApi | null>(null);

/** All app confirmations/notices share native dialog focus, Escape and styling. */
export function PopupProvider({ children }: { children: ReactNode }) {
  const [requests, setRequests] = useState<Request[]>([]);
  const pending = useRef(new Map<number, Request>());
  const nextId = useRef(0);
  const enqueue = useCallback((options: Confirmation, alertOnly = false) => new Promise<boolean>(resolve => {
    const request = { ...options, id: ++nextId.current, alertOnly, resolve };
    pending.current.set(request.id, request);
    setRequests(current => [...current, request]);
  }), []);
  const confirm = useCallback((options: Confirmation) => enqueue(options), [enqueue]);
  const alert = useCallback((message: string, title = 'Notice') => {
    void enqueue({ title, message, confirmLabel: 'OK' }, true);
  }, [enqueue]);
  useEffect(() => () => {
    for (const request of pending.current.values()) request.resolve(false);
    pending.current.clear();
  }, []);
  const finish = (id: number, accepted: boolean) => {
    const request = pending.current.get(id);
    if (!request) return;
    pending.current.delete(id);
    request.resolve(accepted);
    setRequests(current => current.filter(item => item.id !== id));
  };
  const active = requests[0];
  return <Context.Provider value={{ confirm, alert }}>
    {children}
    {active && <ConfirmDialog key={active.id} title={active.title}
      confirmLabel={active.confirmLabel ?? 'Confirm'} danger={active.danger ?? false}
      cancelLabel={active.alertOnly ? null : 'Cancel'}
      onCancel={() => finish(active.id, false)} onConfirm={() => finish(active.id, true)}>
      <p className="popup-message">{active.message}</p>
    </ConfirmDialog>}
  </Context.Provider>;
}

export function usePopup(): PopupApi {
  const popup = useContext(Context);
  if (!popup) throw new Error('usePopup requires PopupProvider');
  return popup;
}
