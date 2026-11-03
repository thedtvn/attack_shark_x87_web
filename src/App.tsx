import { useEffect, useState } from 'react';
import { AlertCircle, Check, Grid3x3, Keyboard, Loader2, Moon, Plus, Settings2, Sun, Sunrise, Unplug, Workflow } from 'lucide-react';
import { X87, webHidSupported } from './hid/keyboard';
import { LightingPanel } from './components/LightingPanel';
import { PerKeyPanel } from './components/PerKeyPanel';
import { RemapPanel } from './components/RemapPanel';
import { MacroPanel } from './components/MacroPanel';
import { SettingsPanel } from './components/SettingsPanel';
import { AppearancePopover } from './components/AppearanceControls';
import { KeyboardSvg } from './components/KeyboardGraphic';
import { AppearanceProvider } from './theme/AppearanceContext';
import { useBusy } from './components/useBusy';
import { PopupProvider } from './components/PopupProvider';
import { UnsavedChangesProvider, useUnsavedNavigation } from './components/UnsavedChanges';
import './app.css';

type Tab = 'lighting' | 'perkey' | 'remap' | 'macro' | 'settings';

const NAV = [
  { id: 'lighting', label: 'Lighting', icon: Sunrise },
  { id: 'perkey', label: 'Per-key RGB', icon: Grid3x3 },
  { id: 'remap', label: 'Key remap', icon: Keyboard },
  { id: 'macro', label: 'Macros', icon: Workflow },
  { id: 'settings', label: 'Settings', icon: Settings2 },
] as const;

function useTheme() {
  const [theme, setTheme] = useState<'light' | 'dark'>(
    () => (localStorage.getItem('theme') as 'light' | 'dark') ?? 'light',
  );
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem('theme', theme);
  }, [theme]);
  return [theme, () => setTheme((t) => (t === 'light' ? 'dark' : 'light'))] as const;
}

function AppContent() {
  const allowLeave = useUnsavedNavigation();
  const [kb, setKb] = useState<X87 | null>(null);
  const [tab, setTab] = useState<Tab>('lighting');
  const [epoch, setEpoch] = useState(0);
  const [theme, toggleTheme] = useTheme();
  const { busy, error, done, setError, run } = useBusy();

  useEffect(() => {
    if (!webHidSupported) return;
    let active = true;
    X87.reconnect()
      .then((k) => active && k && setKb(k))
      .catch((e) => active && setError(e instanceof Error ? e.message : String(e)));
    const onDisconnect = (e: HIDConnectionEvent) => setKb((cur) => (cur && cur.device === e.device ? null : cur));
    navigator.hid.addEventListener('disconnect', onDisconnect);
    return () => {
      active = false;
      navigator.hid.removeEventListener('disconnect', onDisconnect);
    };
  }, []);

  // Background prefetch: transport serializes requests, so start after the
  // visible panel's first reads have been queued; panels later get the cache.
  useEffect(() => {
    if (!kb) return;
    const timer = setTimeout(() => { kb.getMacros().catch(() => undefined); }, 1500);
    return () => clearTimeout(timer);
  }, [kb]);

  const connect = async () => {
    if (!allowLeave()) return;
    setError(null);
    try {
      const k = await X87.request();
      if (k) {
        if (kb && kb !== k) await kb.close();
        setKb(k);
        setEpoch((n) => n + 1);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const disconnect = async () => {
    if (!allowLeave()) return;
    await kb?.close();
    setKb(null);
  };

  return (
    <>
      <header className="topbar">
        <div className="logo">
          <Keyboard size={20} /> ATTACK SHARK
        </div>
        <span className="spacer" />
        {kb && (
          <div className="device-pill">
            <span className="conn-dot" />
            X87
            <span className="tag">{kb.connection === 'wired' ? 'USB' : '2.4G'}</span>
            <button className="icon-btn" onClick={connect} title="Choose device" aria-label="Choose device" disabled={!!busy}>
              <Plus size={16} />
            </button>
            <button className="icon-btn" onClick={disconnect} title="Disconnect">
              <Unplug size={16} />
            </button>
          </div>
        )}
        <AppearancePopover />
        <button className="icon-btn" onClick={toggleTheme} title="Toggle theme">
          {theme === 'light' ? <Moon size={18} /> : <Sun size={18} />}
        </button>
      </header>

      {!kb && (
        <div className="empty" style={{ minHeight: 'calc(100vh - 56px)' }}>
          <KeyboardSvg className="empty-img" />
          {webHidSupported ? (
            <>
              <button className="btn ink lg" onClick={connect}>
                <Plus size={16} /> Connect device
              </button>
              <h2>Connect your X87</h2>
              <p>Use the USB cable or the 2.4G receiver. Bluetooth mode can’t be configured.</p>
              <p className="hint">Close the vendor app (OemDrv.exe) first; it holds the same interface.</p>
            </>
          ) : (
            <>
              <h2>Browser not supported</h2>
              <p>WebHID is needed. Open this page in Chrome, Edge or Opera on desktop.</p>
            </>
          )}
        </div>
      )}

      {kb && (
        <div className="layout">
          <nav className="sidenav">
            {NAV.map(({ id, label, icon: Icon }) => (
              <button key={id} className={tab === id ? 'nav-item active' : 'nav-item'} onClick={() => { if (id === tab || allowLeave()) setTab(id); }}>
                <Icon size={18} /> {label}
              </button>
            ))}
            <div className="nav-foot">
              Changes in Lighting apply instantly. Per-key and remap changes are saved with the bar at the bottom.
            </div>
          </nav>
          <main className="content" key={epoch}>
            <fieldset disabled={!!busy} style={{ border: 0, padding: 0, margin: 0, minWidth: 0, display: 'contents' }}>
            {tab === 'lighting' && <LightingPanel kb={kb} run={run} />}
            {tab === 'perkey' && <PerKeyPanel kb={kb} run={run} />}
            {tab === 'remap' && <RemapPanel kb={kb} run={run} />}
            {tab === 'macro' && <MacroPanel kb={kb} run={run} />}
            {tab === 'settings' && <SettingsPanel kb={kb} run={run} onReset={() => setEpoch((e) => e + 1)} />}
            </fieldset>
          </main>
        </div>
      )}

      <div className="toasts">
        {busy && busy !== 'Saving macros' && (
          <div className="toast">
            <Loader2 size={16} className="spin" /> {busy}…
          </div>
        )}
        {!busy && done && (
          <div className="toast">
            <Check size={16} color="var(--ok)" /> {done}
          </div>
        )}
        {error && (
          <div className="toast error" onClick={() => setError(null)} title="Dismiss">
            <AlertCircle size={16} /> <span>{error}</span>
            <button className="btn" aria-label="Retry" onClick={(e) => {
              e.stopPropagation();
              setError(null);
              if (kb) setEpoch((n) => n + 1);
              else void connect();
            }}>Retry</button>
          </div>
        )}
      </div>
    </>
  );
}

export default function App() {
  return (
    <AppearanceProvider>
      <PopupProvider><UnsavedChangesProvider><AppContent /></UnsavedChangesProvider></PopupProvider>
    </AppearanceProvider>
  );
}
