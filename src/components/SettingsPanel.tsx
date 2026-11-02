import { useEffect, useState } from 'react';
import { AlertTriangle, RotateCcw } from 'lucide-react';
import type { X87 } from '../hid/keyboard';
import { DEBOUNCE_APP_MAX, LedConfig, SLEEP_PRESETS, TAP_MAX } from '../hid/protocol';
import type { Run } from './useBusy';
import { AppearanceSettingsCard } from './AppearanceControls';

interface Props {
  kb: X87;
  run: Run;
  onReset: () => void;
}

const fmtSleep = (s: number) => (s < 60 ? `${s} s` : `${s / 60} min`);

export function SettingsPanel({ kb, run, onReset }: Props) {
  const [cfg, setCfg] = useState<LedConfig | null>(null);
  const [tapDraft, setTapDraft] = useState(64);
  const [confirm, setConfirm] = useState(false);
  const [advanced, setAdvanced] = useState(false);

  useEffect(() => {
    run('Reading settings', async () => {
      const c = await kb.ledConfig();
      setCfg(c);
      if (c.tap) setTapDraft(c.tap);
      if (c.debounce > DEBOUNCE_APP_MAX) setAdvanced(true);
    });
  }, [kb, run]);

  if (!cfg) return <div className="skeleton" />;

  const save = (o: Parameters<LedConfig['withOptions']>[0], label: string) => {
    const next = cfg.withOptions(o);
    setCfg(next);
    run(label, () => kb.setLedConfig(next));
  };

  const sleepIdx = SLEEP_PRESETS.indexOf(cfg.sleepSecs);
  const debounceMax = advanced ? 16 : DEBOUNCE_APP_MAX;

  return (
    <>
      <section className="card">
        <div className="setting-row">
          <div>
            <h3>Tap</h3>
            <p className="note">Tap detection on the keyboard. Higher sensitivity reacts to lighter taps.</p>
          </div>
          <Toggle
            on={cfg.tap > 0}
            onChange={(on) => save({ tap: on ? tapDraft : 0 }, on ? 'Turning Tap on' : 'Turning Tap off')}
          />
        </div>
        <div className="control" style={{ opacity: cfg.tap ? 1 : 0.4 }}>
          <div className="control-head">
            <span>Sensitivity</span>
            <span className="val">{tapDraft}</span>
          </div>
          <input
            type="range"
            min={1}
            max={TAP_MAX}
            value={tapDraft}
            disabled={!cfg.tap}
            onChange={(e) => setTapDraft(+e.target.value)}
            onPointerUp={() => cfg.tap && save({ tap: tapDraft }, 'Saving tap sensitivity')}
            onKeyUp={() => cfg.tap && save({ tap: tapDraft }, 'Saving tap sensitivity')}
            className="range"
          />
        </div>
      </section>

      <section className="card">
        <div className="setting-row">
          <div>
            <h3>Sleep</h3>
            <p className="note">In wireless mode the keyboard sleeps after being idle for this long.</p>
          </div>
          <Toggle
            on={cfg.sleepSecs > 0}
            onChange={(on) => save({ sleepSecs: on ? 120 : 0 }, on ? 'Enabling sleep' : 'Disabling sleep')}
          />
        </div>
        <div className="chips" style={{ opacity: cfg.sleepSecs ? 1 : 0.4 }}>
          {SLEEP_PRESETS.map((s) => (
            <button
              key={s}
              className={cfg.sleepSecs === s ? 'chip on' : 'chip'}
              disabled={!cfg.sleepSecs}
              onClick={() => save({ sleepSecs: s }, 'Saving sleep timeout')}
            >
              {fmtSleep(s)}
            </button>
          ))}
          {cfg.sleepSecs > 0 && sleepIdx < 0 && <span className="chip on">{fmtSleep(cfg.sleepSecs)}</span>}
        </div>
      </section>

      <section className="card">
        <div className="setting-row">
          <div>
            <h3>Debounce</h3>
            <p className="note">
              Filters switch chatter. Higher stages stop double inputs but add delay.
              {advanced && ' Values above 5 go beyond the vendor app and make keys feel laggy.'}
            </p>
          </div>
          <label className="chk">
            <input type="checkbox" checked={advanced} onChange={(e) => setAdvanced(e.target.checked)} />
            Extended range
          </label>
        </div>
        <div className="segmented">
          {Array.from({ length: debounceMax }, (_, i) => i + 1).map((v) => (
            <button
              key={v}
              className={cfg.debounce === v ? 'on' : undefined}
              onClick={() => save({ debounce: v }, 'Saving debounce')}
            >
              {v}
            </button>
          ))}
        </div>
      </section>

      <AppearanceSettingsCard />

      <section className="card danger-card">
        <div className="setting-row">
          <div>
            <h3>Factory reset</h3>
            <p className="note">Restores lighting, per-key colours, key remaps and these options to defaults.</p>
          </div>
          {!confirm ? (
            <button className="btn" onClick={() => setConfirm(true)}>
              <RotateCcw size={15} /> Reset keyboard
            </button>
          ) : (
            <div className="row">
              <span className="warn">
                <AlertTriangle size={15} /> This can’t be undone
              </span>
              <button className="btn ghost" onClick={() => setConfirm(false)}>
                Cancel
              </button>
              <button
                className="btn danger"
                onClick={() =>
                  run('Resetting keyboard', async () => {
                    await kb.factoryReset();
                    await new Promise((r) => setTimeout(r, 1500));
                    setConfirm(false);
                    onReset();
                  })
                }
              >
                Reset now
              </button>
            </div>
          )}
        </div>
      </section>
    </>
  );
}

function Toggle({ on, onChange }: { on: boolean; onChange: (on: boolean) => void }) {
  return (
    <button className={on ? 'toggle on' : 'toggle'} role="switch" aria-checked={on} onClick={() => onChange(!on)}>
      <span />
    </button>
  );
}
