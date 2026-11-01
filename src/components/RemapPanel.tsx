import { useEffect, useMemo, useState } from 'react';
import { ArrowRight, Keyboard, MousePointerClick, RotateCcw, Undo2 } from 'lucide-react';
import type { X87 } from '../hid/keyboard';
import type { KeyDef } from '../hid/layout';
import { KEYS } from '../hid/layout';
import { LAYERS, type KeyAction, type KeyMatrix } from '../hid/protocol';
import { CONSUMER_USAGES, KEY_USAGES, MODIFIERS, consumerName, keyUsageName } from '../hid/usages';
import { KeyboardView } from './KeyboardView';
import type { Run } from './useBusy';

interface Props {
  kb: X87;
  run: Run;
}

export function describe(a: KeyAction): string {
  switch (a.kind) {
    case 'none':
      return 'Disabled';
    case 'fn':
      return 'Fn';
    case 'key': {
      const mods = MODIFIERS.filter(([m]) => a.modifiers & m).map(([, n]) => n);
      const keys = [a.usage, a.usage2].filter(Boolean).map(keyUsageName);
      return [...mods, ...keys].join(' + ') || 'Disabled';
    }
    case 'consumer':
      return consumerName(a.usage);
    case 'mouse':
      return MOUSE[a.button - 1] ?? `Mouse ${a.button}`;
    case 'raw':
      return `0x${a.value.toString(16).padStart(8, '0')}`;
  }
}

const MOUSE = ['Left click', 'Right click', 'Middle click', 'Back', 'Forward'];

const same = (a: KeyAction, b: KeyAction) => JSON.stringify(a) === JSON.stringify(b);

/** Factory mapping: the key's own HID usage. */
function defaultFor(k: KeyDef): KeyAction {
  if (k.name === 'Fn') return { kind: 'fn' };
  const u = KEY_USAGES.find(([, n]) => n.toLowerCase() === k.name.toLowerCase());
  return u ? { kind: 'key', modifiers: 0, usage: u[0], usage2: 0 } : { kind: 'none' };
}

function shortLabel(a: KeyAction) {
  if (a.kind === 'none') return '✕';
  if (a.kind === 'key' && !a.modifiers) return keyUsageName(a.usage);
  const d = describe(a);
  return d.length > 7 ? d.slice(0, 6) + '…' : d;
}

type Cat = 'key' | 'media' | 'mouse' | 'other';

export function RemapPanel({ kb, run }: Props) {
  const [layer, setLayer] = useState(0);
  const [matrices, setMatrices] = useState<(KeyMatrix | null)[]>([null, null, null, null]);
  const [original, setOriginal] = useState<(KeyMatrix | null)[]>([null, null, null, null]);
  const [key, setKey] = useState<KeyDef | null>(null);

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

  const save = () =>
    run(`Writing layer ${layer + 1}`, async () => {
      await kb.setKeyMatrix(layer, matrix);
      setOriginal((cur) => cur.map((x, i) => (i === layer ? matrix : x)));
    });

  const revert = () => setMatrices((cur) => cur.map((m, i) => (i === layer ? orig : m)));

  return (
    <>
      <section className="stage">
        <div className="stage-head">
          <h2>Key remap</h2>
          <span className="sub">{key ? `Editing ${key.name}` : 'Select a key to change what it does'}</span>
          <span className="spacer" />
          <div className="segmented" style={{ width: 260 }}>
            {Array.from({ length: LAYERS }, (_, l) => (
              <button key={l} className={l === layer ? 'on' : undefined} onClick={() => setLayer(l)}>
                Layer {l + 1}
                {dirtyLayers[l] && ' •'}
              </button>
            ))}
          </div>
        </div>
        <KeyboardView
          selected={new Set(key ? [key.index] : [])}
          onKeyClick={(k) => setKey(k)}
          changed={isChanged}
          badge={(i) => {
            const a = matrix.get(i);
            const k = KEYS.find((x) => x.index === i)!;
            return same(a, defaultFor(k)) ? undefined : shortLabel(a);
          }}
        />
      </section>

      <section className="card">
        {key ? (
          <ActionPicker
            k={key}
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
        <div className="savebar">
          <span>
            {changes} key{changes > 1 ? 's' : ''} changed on layer {layer + 1}
          </span>
          <span className="spacer" />
          <button className="btn" onClick={revert}>
            <RotateCcw size={14} /> Discard
          </button>
          <button className="btn primary" onClick={save}>
            Save to keyboard
          </button>
        </div>
      )}
    </>
  );
}

function catOf(a: KeyAction): Cat {
  if (a.kind === 'consumer') return 'media';
  if (a.kind === 'mouse') return 'mouse';
  if (a.kind === 'key') return 'key';
  return 'other';
}

function ActionPicker({
  k,
  action,
  original,
  onChange,
}: {
  k: KeyDef;
  action: KeyAction;
  original: KeyAction;
  onChange: (a: KeyAction) => void;
}) {
  const [cat, setCat] = useState<Cat>(catOf(action));
  const [q, setQ] = useState('');
  useEffect(() => {
    setCat(catOf(action));
    setQ('');
    // only when the edited key changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [k.index]);

  const keyList = useMemo(
    () => KEY_USAGES.filter(([, n]) => n.toLowerCase().includes(q.toLowerCase())),
    [q],
  );
  const mods = action.kind === 'key' ? action.modifiers : 0;
  const def = defaultFor(k);

  return (
    <div className="picker">
      <div className="picker-head">
        <span className="keycap">{k.name}</span>
        <ArrowRight size={18} className="arrow" />
        <span className={same(action, def) ? 'keycap' : 'keycap target'}>{describe(action)}</span>
        <span className="spacer" />
        <button className="btn ghost" onClick={() => onChange(original)} disabled={same(action, original)}>
          <Undo2 size={14} /> Undo
        </button>
        <button className="btn ghost" onClick={() => onChange(def)} disabled={same(action, def)}>
          <Keyboard size={14} /> Reset to default
        </button>
      </div>

      <div className="segmented" style={{ maxWidth: 440 }}>
        {(
          [
            ['key', 'Keyboard'],
            ['media', 'Media'],
            ['mouse', 'Mouse'],
            ['other', 'Other'],
          ] as const
        ).map(([c, label]) => (
          <button key={c} className={cat === c ? 'on' : undefined} onClick={() => setCat(c)}>
            {label}
          </button>
        ))}
      </div>

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
          <button className={action.kind === 'fn' ? 'chip on' : 'chip'} onClick={() => onChange({ kind: 'fn' })}>
            Fn
          </button>
          <button className={action.kind === 'none' ? 'chip on' : 'chip'} onClick={() => onChange({ kind: 'none' })}>
            Disable key
          </button>
          {action.kind === 'raw' && <span className="chip on">Raw {describe(action)}</span>}
        </div>
      )}
    </div>
  );
}
