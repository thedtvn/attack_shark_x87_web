import { useEffect, useMemo, useState } from 'react';
import { ArrowRight, Keyboard, MousePointerClick, RotateCcw, Undo2, Workflow } from 'lucide-react';
import type { X87 } from '../hid/keyboard';
import type { KeyDef } from '../hid/layout';
import { KEYS } from '../hid/layout';
import { type KeyAction, type KeyMatrix } from '../hid/protocol';
import type { MacroRepeat } from '../hid/macros';
import { CONTROLLER_SHORTCUTS, fnShortcutFor, fnFactoryAction, fnShortcutAction, isConnectionShortcut } from '../hid/fnActions';
import { CONSUMER_USAGES, KEY_USAGES, MODIFIERS, consumerName, keyUsageName } from '../hid/usages';
import { KeyboardView } from './KeyboardView';
import { LAYER_NAMES } from './macroDrafts';
import type { MacroDefinition } from '../hid/macros';
import { useUnsavedChanges } from './UnsavedChanges';
import type { Run } from './useBusy';
import { usePopup } from './PopupProvider';

interface Props {
  kb: X87;
  run: Run;
}

export function describe(a: KeyAction): string {
  if (a.kind === 'raw') {
    const shortcut = fnShortcutFor(a);
    if (shortcut) return shortcut.name;
  }
  switch (a.kind) {
    case 'none':
      return 'Disabled';
    case 'fn':
      return 'FN';
    case 'fn2':
      return 'FN2';
    case 'key': {
      const mods = MODIFIERS.filter(([m]) => a.modifiers & m).map(([, n]) => n);
      const keys = [a.usage, a.usage2].filter(Boolean).map(keyUsageName);
      return [...mods, ...keys].join(' + ') || 'Disabled';
    }
    case 'consumer':
      return consumerName(a.usage);
    case 'mouse':
      return MOUSE[a.button - 1] ?? `Mouse ${a.button}`;
    case 'macro': {
      const rep = a.repeat.mode === 'times' ? `${a.repeat.count}×` : a.repeat.mode === 'untilReleased' ? 'Hold' : 'Toggle';
      return `Macro ${a.slot + 1} (${rep})`;
    }
    case 'raw':
      if ((a.value & 0xff) === 7 || (a.value & 0xff) === 10) return 'Onboard keyboard control';
      return 'Unrecognized action (preserved)';
  }
}

const MOUSE = ['Left click', 'Right click', 'Middle click', 'Back', 'Forward'];

const same = (a: KeyAction, b: KeyAction) => JSON.stringify(a) === JSON.stringify(b);

/** Factory mapping: the key's own HID usage. */
function defaultFor(k: KeyDef, layer = 0): KeyAction {
  if (layer === 1) return fnFactoryAction(k.name);
  if (layer > 1) return { kind: 'none' };
  if (k.name === 'Fn') return { kind: 'fn' };
  const u = KEY_USAGES.find(([, n]) => n.toLowerCase() === k.name.toLowerCase());
  return u ? { kind: 'key', modifiers: 0, usage: u[0], usage2: 0 } : { kind: 'none' };
}

function shortLabel(a: KeyAction) {
  if (a.kind === 'none') return '✕';
  if (a.kind === 'key' && !a.modifiers) return keyUsageName(a.usage);
  if (a.kind === 'macro') return `M${a.slot + 1}`;
  if (a.kind === 'raw') return fnShortcutFor(a)?.label ?? ((a.value & 0xff) === 7 || (a.value & 0xff) === 10 ? 'Control' : '?');
  const d = describe(a);
  return d.length > 7 ? d.slice(0, 6) + '…' : d;
}

type Cat = 'key' | 'media' | 'mouse' | 'macro' | 'controller' | 'other';

export function RemapPanel({ kb, run }: Props) {
  const popup = usePopup();
  const [layer, setLayer] = useState(0);
  const [matrices, setMatrices] = useState<(KeyMatrix | null)[]>([null, null, null, null]);
  const [original, setOriginal] = useState<(KeyMatrix | null)[]>([null, null, null, null]);
  const [key, setKey] = useState<KeyDef | null>(null);
  const [macroBank, setMacroBank] = useState<MacroDefinition[]>([]);
  const [macroBankError, setMacroBankError] = useState<string | null>(null);
  const dirty = matrices.some((m, i) => !!m && !!original[i] && m.bytes.some((v, j) => v !== original[i]!.bytes[j]));
  const { barRef, allowLeave } = useUnsavedChanges(dirty);

  useEffect(() => {
    let active = true;
    run('Reading macro names', async () => {
      try {
        const bank = await kb.readMacroBank();
        if (active) setMacroBank(bank);
      } catch (e) {
        if (active) setMacroBankError(`Macro bank could not be read: ${e instanceof Error ? e.message : String(e)}`);
      }
    });
    return () => { active = false; };
  }, [kb, run]);

  useEffect(() => {
    if (matrices[layer]) return;
    run(`Reading layer ${layer + 1}`, async () => {
      const m = await kb.keyMatrix(layer);
      setMatrices((cur) => cur.map((x, i) => (i === layer ? m : x)));
      setOriginal((cur) => cur.map((x, i) => (i === layer ? m : x)));
    });
  }, [kb, run, layer, matrices]);

  const matrix = matrices[layer];
  const orig = original[layer];
  if (!matrix || !orig) return <div className="skeleton" />;

  const isChanged = (i: number) => !same(matrix.get(i), orig.get(i));
  const changes = KEYS.filter((k) => isChanged(k.index)).length;
  const dirtyLayers = matrices.map((m, i) => !!m && !!original[i] && m.bytes.some((v, j) => v !== original[i]!.bytes[j]));

  const set = (a: KeyAction) => {
    if (!key) return;
    setMatrices((cur) => cur.map((m, i) => (i === layer ? m!.with(key.index, a) : m)));
  };

  const save = async () => {
    const sensitive = KEYS.filter((k) => isChanged(k.index)).flatMap((k) => {
      const shortcut = fnShortcutFor(matrix.get(k.index));
      return shortcut && (isConnectionShortcut(shortcut) || shortcut.key === 'Space') ? [`${k.name} → ${shortcut.name}`] : [];
    });
    if (sensitive.length && !await popup.confirm({ title: 'Save controller bindings?', confirmLabel: 'Save', danger: true, message: `${sensitive.join('\n')}\n\nTriggering connection controls may disconnect the keyboard. Factory reset can erase custom settings. Saving assigns actions; it does not intentionally run them.` })) return;
    return run(`Writing ${LAYER_NAMES[layer]} layer`, async () => {
      await kb.setKeyMatrix(layer, matrix);
      setOriginal((cur) => cur.map((x, i) => (i === layer ? matrix : x)));
    });
  };

  const revert = () => setMatrices((cur) => cur.map((m, i) => (i === layer ? orig : m)));

  return (
    <>
      <section className="stage">
        <div className="stage-head">
          <h2>Key remap</h2>
          <span className="sub">{key ? `Editing ${key.name}` : 'Select a key to change what it does'}</span>
          <span className="spacer" />
          <div className="segmented" style={{ width: 340 }}>
            {LAYER_NAMES.map((name, l) => (
              <button key={l} className={l === layer ? 'on' : undefined} onClick={() => { if (l === layer || allowLeave()) setLayer(l); }}>
                {name}
                {dirtyLayers[l] && ' •'}
              </button>
            ))}
          </div>
        </div>
        {layer > 0 && <p className="note">Blank keys have no explicit layer action; they are not necessarily disabled. “Control” means a built-in firmware action, preserved unchanged.</p>}
        <KeyboardView
          selected={new Set(key ? [key.index] : [])}
          onKeyClick={(k) => setKey(k)}
          changed={isChanged}
          keyTitle={(i) => {
            const key = KEYS.find((k) => k.index === i)!;
            const action = matrix.get(i);
            const shortcut = fnShortcutFor(action);
            return shortcut ? `${key.name}: ${shortcut.name}. ${shortcut.detail}` : `${key.name}: ${layer > 0 && action.kind === 'none' ? 'No explicit layer action' : describe(action)}`;
          }}
          label={(i) => {
            const a = matrix.get(i);
            if (layer > 0 && a.kind === 'none') return undefined;
            const shortcut = fnShortcutFor(a);
            if (shortcut) return shortcut.label;
            const k = KEYS.find((x) => x.index === i)!;
            return same(a, defaultFor(k, layer)) ? undefined : shortLabel(a);
          }}
        />
      </section>

      {layer > 0 && <details className="card">
        <summary>Factory Fn shortcuts and connection modes</summary>
        <p className="note">Reference only. Mode switch: left = Bluetooth (three channels), middle = USB, right = 2.4 GHz receiver. Short-press Fn + 1/2/3/4 to select; hold to pair. The manual has Windows/Mac-specific descriptions for F3 and F6; current stored actions determine what is sent.</p>
        <p className="note">FN and FN2 are distinct layer keys. The supplied vendor configuration defines FN1 defaults but leaves FN2 and Tap empty; this app does not copy FN1 into those layers.</p>
      </details>}
      <section className="card">
        {key ? (
          <ActionPicker
            k={key}
            layer={layer}
            macroBank={macroBank}
            macroBankError={macroBankError}
            action={matrix.get(key.index)}
            original={orig.get(key.index)}
            onChange={set}
          />
        ) : (
          <div className="empty-pick">
            <MousePointerClick size={28} />
            <div>Click any key above to remap it.</div>
            <div className="note">Keys that differ from the default show their new function.</div>
          </div>
        )}
      </section>

      {changes > 0 && (
        <div className="savebar" ref={barRef} tabIndex={-1} role="status" aria-live="polite">
          <span>
            {changes} key{changes > 1 ? 's' : ''} changed on {LAYER_NAMES[layer]}
          </span>
          <span className="spacer" />
          <button className="btn" onClick={revert}>
            <RotateCcw size={14} /> Discard
          </button>
          <button className="btn primary" onClick={save}>
            Save
          </button>
        </div>
      )}
    </>
  );
}

function catOf(a: KeyAction): Cat {
  if (a.kind === 'fn' || a.kind === 'fn2' || (a.kind === 'raw' && fnShortcutFor(a))) return 'controller';
  if (a.kind === 'consumer') return 'media';
  if (a.kind === 'mouse') return 'mouse';
  if (a.kind === 'macro') return 'macro';
  if (a.kind === 'key') return 'key';
  return 'other';
}

function ActionPicker({
  k,
  layer,
  macroBank,
  macroBankError,
  action,
  original,
  onChange,
}: {
  k: KeyDef;
  layer: number;
  macroBank: MacroDefinition[];
  macroBankError: string | null;
  action: KeyAction;
  original: KeyAction;
  onChange: (a: KeyAction) => void;
}) {
  const popup = usePopup();
  const [cat, setCat] = useState<Cat>(catOf(action));
  const [q, setQ] = useState('');
  const drafts = macroBank;

  useEffect(() => {
    setCat(catOf(action));
    setQ('');
    // only when the edited key changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [k.index, layer]);

  const keyList = useMemo(
    () => KEY_USAGES.filter(([, n]) => n.toLowerCase().includes(q.toLowerCase())),
    [q],
  );
  const mods = action.kind === 'key' ? action.modifiers : 0;
  const def = defaultFor(k, layer);

  // Macro helper state
  const currentSlot = action.kind === 'macro' ? action.slot : 0;
  const currentRepeat: MacroRepeat = action.kind === 'macro' ? action.repeat : { mode: 'times', count: 1 };
  const shortcut = fnShortcutFor(action);

  return (
    <div className="picker">
      <div className="picker-head">
        <span className="keycap">{k.name}</span>
        <ArrowRight size={18} className="arrow" />
        <span className={same(action, def) ? 'keycap' : 'keycap target'}>{shortcut?.name ?? (layer > 0 && action.kind === 'none' ? 'No explicit layer action' : describe(action))}</span>
        <span className="spacer" />
        <button className="btn ghost" onClick={() => onChange(original)} disabled={same(action, original)}>
          <Undo2 size={14} /> Undo
        </button>
        <button className="btn ghost" onClick={() => onChange(def)} disabled={same(action, def)}>
          <Keyboard size={14} /> Reset to default
        </button>
      </div>

      <div className="segmented" style={{ maxWidth: 680 }}>
        {(
          [
            ['key', 'Keyboard'],
            ['media', 'Media'],
            ['mouse', 'Mouse'],
            ['macro', 'Macro'],
            ['controller', 'Controller'],
            ['other', 'Other'],
          ] as const
        ).map(([c, label]) => (
          <button key={c} className={cat === c ? 'on' : undefined} onClick={() => setCat(c)}>
            {label}
          </button>
        ))}
      </div>

      {cat === 'controller' && (
        <div className="chips">
          <button className={action.kind === 'fn' ? 'chip on' : 'chip'} onClick={() => onChange({ kind: 'fn' })}>FN</button>
          <button className={action.kind === 'fn2' ? 'chip on' : 'chip'} onClick={() => onChange({ kind: 'fn2' })}>FN2</button>
          {CONTROLLER_SHORTCUTS.map((item) => <button key={item.key}
            className={same(action, fnShortcutAction(item)) ? 'chip on' : 'chip'}
            onClick={async () => {
              if (item.key === 'Space' && !await popup.confirm({ title: 'Assign factory reset?', confirmLabel: 'Assign reset', danger: true, message: 'Triggering this action can erase custom mappings, lighting and macros. The manual specifies holding Fn + Space for 3 seconds; behavior on a remapped key is not hardware-validated.' })) return;
              onChange(fnShortcutAction(item));
            }}>
            {item.name}
          </button>)}
        </div>
      )}

      {cat === 'macro' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {macroBankError && <p className="note">{macroBankError}</p>}
          <div>
            <div className="section-label" style={{ marginBottom: 8 }}>
              Select Macro Slot (read from keyboard)
            </div>
            <div className="chips" style={{ maxHeight: 180, overflowY: 'auto', padding: '4px 0' }}>
              {Array.from({ length: Math.max(drafts.length, action.kind === 'macro' ? action.slot + 1 : 0) }, (_, idx) => {
                const draft = drafts[idx];
                const label = draft ? `Slot ${idx + 1}: ${draft.name}` : `Slot ${idx + 1} (hardware contents unknown)`;
                const isSelected = action.kind === 'macro' && action.slot === idx;
                return (
                  <button
                    key={idx}
                    className={isSelected ? 'chip on' : 'chip'}
                    disabled={!draft && !isSelected}
                    onClick={() =>
                      onChange({
                        kind: 'macro',
                        slot: idx,
                        repeat: currentRepeat,
                      })
                    }
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <div className="section-label" style={{ marginBottom: 8 }}>
              Playback Repeat Mode
            </div>
            <div className="chips">
              <button
                className={currentRepeat.mode === 'times' ? 'chip on' : 'chip'}
                onClick={() =>
                  onChange({
                    kind: 'macro',
                    slot: currentSlot,
                    repeat: { mode: 'times', count: currentRepeat.mode === 'times' ? currentRepeat.count : 1 },
                  })
                }
              >
                Play {currentRepeat.mode === 'times' ? `${currentRepeat.count}×` : 'Times'}
              </button>
              <button
                className={currentRepeat.mode === 'untilReleased' ? 'chip on' : 'chip'}
                onClick={() =>
                  onChange({
                    kind: 'macro',
                    slot: currentSlot,
                    repeat: { mode: 'untilReleased' },
                  })
                }
              >
                Repeat While Held
              </button>
              <button
                className={currentRepeat.mode === 'untilAnyKey' ? 'chip on' : 'chip'}
                onClick={() =>
                  onChange({
                    kind: 'macro',
                    slot: currentSlot,
                    repeat: { mode: 'untilAnyKey' },
                  })
                }
              >
                Until Any Key (Experimental)
              </button>
            </div>
            {currentRepeat.mode === 'times' && (
              <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
                <span className="sub">Repeat count:</span>
                <input
                  type="number"
                  min="1"
                  max="255"
                  value={currentRepeat.count}
                  className="search"
                  style={{ width: 70, height: 30, padding: '0 8px' }}
                  onChange={(e) => {
                    const c = Math.max(1, Math.min(255, parseInt(e.target.value) || 1));
                    onChange({
                      kind: 'macro',
                      slot: currentSlot,
                      repeat: { mode: 'times', count: c },
                    });
                  }}
                />
              </div>
            )}
          </div>

          <div className="note" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <Workflow size={14} style={{ color: 'var(--accent)' }} />
            <span>
              This edits only a key binding, not the bank. Upload the bank in <strong>Macros</strong> first, then assign its slot here. Slot names were read from the connected keyboard. Existing raw bindings stay unchanged unless you edit them.
            </span>
          </div>
        </div>
      )}

      {cat === 'key' && (
        <>
          <div>
            <div className="section-label" style={{ marginBottom: 8 }}>
              Modifiers
            </div>
            <div className="chips">
              {MODIFIERS.map(([m, n]) => (
                <button
                  key={m}
                  className={mods & m ? 'chip on' : 'chip'}
                  onClick={() =>
                    onChange({
                      kind: 'key',
                      modifiers: mods ^ m,
                      usage: action.kind === 'key' ? action.usage : 0,
                      usage2: 0,
                    })
                  }
                >
                  {n}
                </button>
              ))}
            </div>
          </div>
          <input className="search" placeholder="Search keys…" value={q} onChange={(e) => setQ(e.target.value)} />
          <div className="key-list">
            {keyList.map(([u, n]) => (
              <button
                key={u}
                className={action.kind === 'key' && action.usage === u ? 'chip on' : 'chip'}
                onClick={() => onChange({ kind: 'key', modifiers: mods, usage: u, usage2: 0 })}
              >
                {n}
              </button>
            ))}
          </div>
        </>
      )}

      {cat === 'media' && (
        <div className="chips">
          {CONSUMER_USAGES.map(([u, n]) => (
            <button
              key={u}
              className={action.kind === 'consumer' && action.usage === u ? 'chip on' : 'chip'}
              onClick={() => onChange({ kind: 'consumer', usage: u })}
            >
              {n}
            </button>
          ))}
        </div>
      )}

      {cat === 'mouse' && (
        <div className="chips">
          {MOUSE.map((n, i) => (
            <button
              key={n}
              className={action.kind === 'mouse' && action.button === i + 1 ? 'chip on' : 'chip'}
              onClick={() => onChange({ kind: 'mouse', button: i + 1 })}
            >
              {n}
            </button>
          ))}
        </div>
      )}

      {cat === 'other' && (
        <div className="chips">
          <button className={action.kind === 'none' ? 'chip on' : 'chip'} onClick={() => onChange({ kind: 'none' })}>
            {layer > 0 ? 'Clear layer action' : 'Disable key'}
          </button>
          {action.kind === 'raw' && <span className="chip on">{shortcut?.name ?? describe(action)}</span>}
        </div>
      )}
    </div>
  );
}
