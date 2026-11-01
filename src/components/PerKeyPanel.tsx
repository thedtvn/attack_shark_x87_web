import { useEffect, useRef, useState } from 'react';
import { Brush, Eraser, MousePointer2, PaintBucket, Pipette, RotateCcw } from 'lucide-react';
import type { X87 } from '../hid/keyboard';
import { KEYS } from '../hid/layout';
import { CUSTOM_EFFECT_ID, PerKeyColors } from '../hid/protocol';
import { fromHex, toHex } from './colors';
import { KeyboardView } from './KeyboardView';
import type { Run } from './useBusy';

interface Props {
  kb: X87;
  run: Run;
}

const PRESETS = ['#ff3b30', '#ff9500', '#ffcc00', '#34c759', '#00c7be', '#007aff', '#5856d6', '#af52de', '#ff2d55', '#ffffff'];

type Tool = 'paint' | 'select' | 'pick';

const GROUPS: { name: string; keys: string[] }[] = [
  { name: 'WASD', keys: ['W', 'A', 'S', 'D'] },
  { name: 'Arrows', keys: ['Up', 'Down', 'Left', 'Right'] },
  { name: 'F-row', keys: ['Esc', 'F1', 'F2', 'F3', 'F4', 'F5', 'F6', 'F7', 'F8', 'F9', 'F10', 'F11', 'F12'] },
  { name: 'Numbers', keys: ['`', '1', '2', '3', '4', '5', '6', '7', '8', '9', '0', '-', '='] },
  {
    name: 'Modifiers',
    keys: ['LCtrl', 'LWin', 'LAlt', 'LShift', 'RShift', 'RAlt', 'Fn', 'App', 'RCtrl', 'CapsLock', 'Tab', 'Enter', 'Backspace'],
  },
];

const idx = (names: string[]) =>
  KEYS.filter((k) => names.some((n) => n.toLowerCase() === k.name.toLowerCase())).map((k) => k.index);

export function PerKeyPanel({ kb, run }: Props) {
  const [colors, setColors] = useState<PerKeyColors | null>(null);
  const [saved, setSaved] = useState<PerKeyColors | null>(null);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [brush, setBrush] = useState('#ff3b30');
  const [hex, setHex] = useState('#ff3b30');
  const [tool, setTool] = useState<Tool>('paint');
  const dragging = useRef(false);

  useEffect(() => {
    run('Reading per-key colours', async () => {
      const c = await kb.perKeyColors(0);
      setColors(c);
      setSaved(c);
    });
  }, [kb, run]);

  useEffect(() => {
    const up = () => (dragging.current = false);
    window.addEventListener('mouseup', up);
    return () => window.removeEventListener('mouseup', up);
  }, []);

  if (!colors || !saved) return <div className="skeleton" />;

  const dirty = colors.bytes.some((v, i) => v !== saved.bytes[i]);

  const pickBrush = (h: string) => {
    setBrush(h);
    setHex(h);
  };

  const paint = (indices: number[], c = brush) => {
    if (indices.length) setColors((cur) => cur!.with(indices, fromHex(c)));
  };

  const act = (index: number) => {
    if (tool === 'paint') paint([index]);
    else if (tool === 'pick') {
      pickBrush(toHex(colors.get(index)));
      setTool('paint');
    } else
      setSelected((cur) => {
        const n = new Set(cur);
        if (n.has(index)) n.delete(index);
        else n.add(index);
        return n;
      });
  };

  const apply = () =>
    run('Uploading per-key colours', async () => {
      await kb.setPerKeyColors(colors, 0);
      const cfg = await kb.ledConfig();
      if (cfg.effectId !== CUSTOM_EFFECT_ID) {
        const s = cfg.settings(CUSTOM_EFFECT_ID);
        await kb.setLedConfig(cfg.with(CUSTOM_EFFECT_ID, { ...s, brightness: s.brightness || 4 }));
      }
      setSaved(colors);
    });

  const target = selected.size ? [...selected] : KEYS.map((k) => k.index);

  return (
    <>
      <section className="stage">
        <div className="stage-head">
          <h2>Per-key colours</h2>
          <span className="sub">
            {tool === 'paint' && 'Click or drag across keys to paint'}
            {tool === 'select' && `Click keys to select · ${selected.size} selected`}
            {tool === 'pick' && 'Click a key to copy its colour'}
          </span>
        </div>
        <KeyboardView
          selected={selected}
          fill={(i) => toHex(colors.get(i))}
          onKeyClick={(k) => {
            dragging.current = true;
            act(k.index);
          }}
          onKeyEnter={(k) => dragging.current && tool !== 'pick' && act(k.index)}
        />
      </section>

      <div className="grid-2">
        <section className="card">
          <h3>Brush</h3>
          <div className="toolrow">
            <label className="brush" style={{ background: brush }} title="Pick any colour">
              <input type="color" className="hidden-color" value={brush} onChange={(e) => pickBrush(e.target.value)} />
            </label>
            <input
              className="hex"
              value={hex}
              onChange={(e) => {
                setHex(e.target.value);
                if (/^#[0-9a-f]{6}$/i.test(e.target.value)) setBrush(e.target.value.toLowerCase());
              }}
            />
            <div className="swatches">
              {PRESETS.map((p) => (
                <button
                  key={p}
                  className={brush === p ? 'swatch sm on' : 'swatch sm'}
                  style={{ background: p }}
                  onClick={() => pickBrush(p)}
                />
              ))}
            </div>
          </div>

          <div className="control" style={{ marginTop: 14 }}>
            <div className="control-head">
              <span>Tool</span>
            </div>
            <div className="segmented">
              <button className={tool === 'paint' ? 'on' : undefined} onClick={() => setTool('paint')}>
                <Brush size={14} /> Paint
              </button>
              <button className={tool === 'select' ? 'on' : undefined} onClick={() => setTool('select')}>
                <MousePointer2 size={14} /> Select
              </button>
              <button className={tool === 'pick' ? 'on' : undefined} onClick={() => setTool('pick')}>
                <Pipette size={14} /> Pick
              </button>
            </div>
          </div>
        </section>

        <section className="card">
          <h3>Quick select</h3>
          <div className="chips">
            {GROUPS.map((g) => (
              <button
                key={g.name}
                className="chip"
                onClick={() => {
                  setTool('select');
                  setSelected(new Set(idx(g.keys)));
                }}
              >
                {g.name}
              </button>
            ))}
            <button className="chip" onClick={() => setSelected(new Set())} disabled={!selected.size}>
              Clear
            </button>
          </div>
          <div className="toolrow" style={{ marginTop: 14 }}>
            <button className="btn" onClick={() => paint(target)}>
              <PaintBucket size={15} /> Fill {selected.size ? `${selected.size} selected` : 'all keys'}
            </button>
            <button className="btn ghost" onClick={() => paint(target, '#000000')}>
              <Eraser size={15} /> Clear {selected.size ? 'selected' : 'all'}
            </button>
          </div>
        </section>
      </div>

      {dirty && (
        <div className="savebar">
          <span>Unsaved per-key colours</span>
          <span className="spacer" />
          <button className="btn" onClick={() => setColors(saved)}>
            <RotateCcw size={14} /> Discard
          </button>
          <button className="btn primary" onClick={apply}>
            Apply to keyboard
          </button>
        </div>
      )}
    </>
  );
}
