import { useEffect, useId, useRef, type ReactNode } from 'react';

interface Props {
  title: string;
  children: ReactNode;
  confirmLabel: string;
  cancelLabel?: string | null;
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

/** Native modal focus/inert/Escape behavior, styled as part of the app. */
export function ConfirmDialog({ title, children, confirmLabel, cancelLabel = 'Cancel', danger = true, onConfirm, onCancel }: Props) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const bodyId = useId();
  useEffect(() => {
    const dialog = ref.current!;
    dialog.showModal();
    return () => { if (dialog.open) dialog.close(); };
  }, []);
  return <dialog ref={ref} className="confirm-dialog" aria-labelledby={titleId} aria-describedby={bodyId}
    onCancel={(e) => { e.preventDefault(); onCancel(); }}>
    <h2 id={titleId}>{title}</h2>
    <div id={bodyId}>{children}</div>
    <div className="confirm-dialog-actions">
      {cancelLabel && <button className="btn" autoFocus onClick={onCancel}>{cancelLabel}</button>}
      <button className={danger ? 'btn danger' : 'btn primary'} autoFocus={!cancelLabel} onClick={onConfirm}>{confirmLabel}</button>
    </div>
  </dialog>;
}
