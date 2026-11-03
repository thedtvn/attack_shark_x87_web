import { useEffect, useId, useRef, useState } from 'react';
import { Battery, BatteryCharging, BatteryFull, BatteryLow, BatteryMedium, Cable, MoonStar } from 'lucide-react';
import type { KeyboardStatus, X87 } from '../hid/keyboard';

const IDLE: KeyboardStatus = { linked: true, battery: null };
const REFRESH_MS = 60_000;

/** Live link (sleep / wake) and battery state; refreshes gently over 2.4G. */
export function useKeyboardStatus(kb: X87 | null): KeyboardStatus {
  const [status, setStatus] = useState<KeyboardStatus>(kb?.status ?? IDLE);

  useEffect(() => {
    if (!kb) {
      setStatus(IDLE);
      return;
    }
    const off = kb.onStatus(setStatus);
    if (kb.connection !== 'wireless') return off;

    const refresh = () => {
      if (document.visibilityState === 'visible') void kb.refreshStatus();
    };
    const timer = setInterval(refresh, REFRESH_MS);
    document.addEventListener('visibilitychange', refresh);
    return () => {
      off();
      clearInterval(timer);
      document.removeEventListener('visibilitychange', refresh);
    };
  }, [kb]);

  return status;
}

export const isAsleep = (kb: X87, status: KeyboardStatus) => kb.connection === 'wireless' && !status.linked;

export const ASLEEP_TITLE = 'Keyboard asleep or off — press a key to wake it';

function BatteryIcon({ percent, charging }: { percent: number; charging: boolean }) {
  if (charging) return <BatteryCharging size={16} />;
  if (percent <= 20) return <BatteryLow size={16} />;
  if (percent < 45) return <Battery size={16} />;
  if (percent < 75) return <BatteryMedium size={16} />;
  return <BatteryFull size={16} />;
}

/** Small status chip shown inside the device pill, next to the USB / 2.4G tag. */
export function ConnectionStatus({ kb, status }: { kb: X87; status: KeyboardStatus }) {
  if (kb.connection === 'wired') {
    return (
      <span className="conn-status" title="Connected by USB cable — always awake" aria-label="Connected by USB cable">
        <Cable size={14} />
      </span>
    );
  }

  if (!status.linked) {
    return (
      <span className="conn-status asleep" title={ASLEEP_TITLE}>
        <MoonStar size={15} /> Asleep
      </span>
    );
  }

  const b = status.battery;
  if (!b) return null;
  const tone = b.charging ? 'charging' : b.percent <= 20 ? 'low' : '';
  const label = `Battery ${b.percent}%${b.charging ? ', charging' : ''}`;
  return (
    <span className={`conn-status ${tone}`.trim()} title={label} aria-label={label}>
      <BatteryIcon percent={b.percent} charging={b.charging} />
      {b.percent}%
    </span>
  );
}

/**
 * Blocking modal overlay shown while connected over 2.4G and asleep.
 * Disappears automatically when the keyboard wakes or switches to USB cable.
 */
export function AsleepModal({
  onConnect,
  onDisconnect,
}: {
  onConnect: () => void;
  onDisconnect: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const descId = useId();

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (!dialog.open) {
      dialog.showModal();
    }
    return () => {
      if (dialog.open) dialog.close();
    };
  }, []);

  return (
    <dialog
      ref={ref}
      className="confirm-dialog asleep-dialog"
      aria-labelledby={titleId}
      aria-describedby={descId}
      onCancel={(e) => e.preventDefault()}
    >
      <div className="asleep-dialog-header">
        <div className="asleep-dialog-icon">
          <MoonStar size={22} />
        </div>
        <h2 id={titleId}>Keyboard is asleep</h2>
      </div>
      <div id={descId} className="asleep-dialog-body">
        <p>Press any key on the keyboard to wake it, or connect another device.</p>
      </div>
      <div className="confirm-dialog-actions">
        <button type="button" className="btn" onClick={onDisconnect}>
          Disconnect
        </button>
        <button type="button" className="btn primary" autoFocus onClick={onConnect}>
          Connect other device
        </button>
      </div>
    </dialog>
  );
}
