import { useEffect, useState } from 'react';
import {
  Activity,
  Droplets,
  Flower2,
  Grid3x3,
  Moon,
  Orbit,
  Pencil,
  Power,
  Rainbow,
  ScanLine,
  Sparkles,
  Square,
  Tornado,
  Waves,
  Wind,
  Worm,
  Zap,
  CloudRain,
  Ghost,
  Fan,
  type LucideIcon,
} from 'lucide-react';
import type { X87 } from '../hid/keyboard';
import { COLOR_RANDOM, EFFECTS, LedConfig, MAX_LEVEL, RgbTable, type EffectSettings } from '../hid/protocol';
import { fromHex, toHex } from './colors';
import { KeyboardView } from './KeyboardView';
import type { Run } from './useBusy';

const ICONS: Record<number, LucideIcon> = {
  1: Square,
  2: Moon,
  3: Rainbow,
  4: Zap,
  5: CloudRain,
  6: Orbit,
  7: Droplets,
  8: Sparkles,
  9: Ghost,
  10: Worm,
  11: Activity,
  12: Power,
  13: Waves,
  14: ScanLine,
  15: Fan,
  16: Wind,
  17: Flower2,
  18: Tornado,
  21: Grid3x3,
};

interface Props {
  kb: X87;
  run: Run;
}

export function LightingPanel({ kb, run }: Props) {
  const [cfg, setCfg] = useState<LedConfig | null>(null);
  const [table, setTable] = useState<RgbTable | null>(null);
  const [effectId, setEffectId] = useState(1);
  const [s, setS] = useState<EffectSettings>({ brightness: 4, speed: 2, color: 0 });

  useEffect(() => {
    run('Reading lighting', async () => {
      const c = await kb.ledConfig();
      const t = await kb.rgbTable();
      setCfg(c);
      setTable(t);
      const id = LedConfig.slot(c.effectId) >= 0 ? c.effectId : 1;
      setEffectId(id);
      setS(c.settings(id));
    });
  }, [kb, run]);

  if (!cfg || !table) return <div className="skeleton" />;

  const def = EFFECTS.find((e) => e.id === effectId)!;
  const palette = table.palette(effectId);
  const off = s.brightness === 0;

  const apply = (id: number, next: EffectSettings) => {
    setEffectId(id);
    setS(next);
    run('Applying lighting', async () => {
      const c = cfg.with(id, next);
      await kb.setLedConfig(c);
      setCfg(c);
    });
  };

  const update = (patch: Partial<EffectSettings>) => apply(effectId, { ...s, ...patch });

  const selectEffect = (id: number) => {
    const prev = cfg.settings(id);
    apply(id, { ...prev, brightness: prev.brightness || 3 });
  };

  const setPaletteColor = (i: number, hex: string) => {
    const t = table.withColor(effectId, i, fromHex(hex));
    setTable(t);
    run('Saving colour', () => kb.setRgbTable(t));
  };

  const preview =
    def.color && s.color !== COLOR_RANDOM ? toHex(palette[s.color] ?? [255, 255, 255]) : undefined;

  return (
    <>
      <section className="stage">
        <div className="stage-head">
          <h2>{def.name}</h2>
          <span className="sub">{off ? 'Backlight off' : `Brightness ${s.brightness} · Speed ${s.speed}`}</span>
          <span className="spacer" />
          <button className="btn ghost" onClick={() => update({ brightness: off ? 3 : 0 })}>
            <Power size={16} /> {off ? 'Turn on' : 'Turn off'}
          </button>
        </div>
        <KeyboardView
          fill={() => (off ? '#333' : preview)}
        />
      </section>

      <div className="grid-2">
        <section className="card">
          <h3>Effect</h3>
          <div className="effect-grid">
            {EFFECTS.map((e) => {
              const Icon = ICONS[e.id] ?? Square;
              return (
                <button
                  key={e.id}
                  className={e.id === effectId ? 'effect-tile active' : 'effect-tile'}
                  onClick={() => selectEffect(e.id)}
                >
                  <Icon size={20} />
                  {e.name}
                  {e.id === cfg.effectId && <span className="live">●</span>}
                </button>
              );
            })}
          </div>
        </section>

        <section className="card">
          <h3>Settings</h3>
          <Level label="Brightness" value={s.brightness} onChange={(v) => update({ brightness: v })} zero="Off" />
          <Level
            label="Speed"
            value={s.speed}
            onChange={(v) => update({ speed: v })}
            disabled={!def.speed}
          />

          <div className="control">
            <div className="control-head">
              <span>Colour</span>
              {!def.color && <span className="val">Not used by this effect</span>}
            </div>
            {def.color && (
              <>
                <div className="swatches">
                  {palette.map((c, i) => (
                    <div
                      key={i}
                      className={s.color === i ? 'swatch on' : 'swatch'}
                      style={{ background: toHex(c) }}
                      onClick={() => update({ color: i })}
                      title="Click to select · use the pencil to edit"
                    >
                      <label className="edit" onClick={(e) => e.stopPropagation()}>
                        <Pencil size={9} />
                        <input
                          type="color"
                          className="hidden-color"
                          value={toHex(c)}
                          onChange={(e) => setPaletteColor(i, e.target.value)}
                        />
                      </label>
                    </div>
                  ))}
                  <button
                    className={s.color === COLOR_RANDOM ? 'swatch rainbow on' : 'swatch rainbow'}
                    onClick={() => update({ color: COLOR_RANDOM })}
                    title="Colourful"
                  />
                </div>
                <span className="note">Hover a colour and click the pencil to change it.</span>
              </>
            )}
            {effectId === 21 && (
              <span className="note">Per-key colours are edited in the Per-key tab.</span>
            )}
          </div>
        </section>
      </div>
    </>
  );
}

function Level({
  label,
  value,
  onChange,
  disabled,
  zero,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  disabled?: boolean;
  zero?: string;
}) {
  return (
    <div className="control">
      <div className="control-head">
        <span>{label}</span>
        <span className="val">{disabled ? 'Not used by this effect' : value}</span>
      </div>
      <div className="segmented">
        {Array.from({ length: MAX_LEVEL + 1 }, (_, v) => (
          <button key={v} className={!disabled && v === value ? 'on' : undefined} disabled={disabled} onClick={() => onChange(v)}>
            {v === 0 && zero ? zero : v}
          </button>
        ))}
      </div>
    </div>
  );
}
