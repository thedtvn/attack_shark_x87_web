import { IMAGE_HEIGHT, IMAGE_WIDTH, KEYS, type KeyDef } from '../hid/layout';

interface Props {
  selected?: Set<number>;
  onKeyClick?: (key: KeyDef, e: React.MouseEvent) => void;
  onKeyEnter?: (key: KeyDef, e: React.MouseEvent) => void;
  /** Fill colour per LED index (per-key mode). */
  fill?: (index: number) => string | undefined;
  /** Small label on the key (remap mode). */
  badge?: (index: number) => string | undefined;
  changed?: (index: number) => boolean;
}

export function KeyboardView({ selected, onKeyClick, onKeyEnter, fill, badge, changed }: Props) {
  return (
    <svg
      viewBox={`0 0 ${IMAGE_WIDTH} ${IMAGE_HEIGHT}`}
      className={onKeyClick ? 'kb-svg' : 'kb-svg kb-static'}
      onMouseDown={(e) => e.preventDefault()}
    >
      <image href="/keyimg.png" width={IMAGE_WIDTH} height={IMAGE_HEIGHT} />
      {KEYS.map((k) => {
        const w = k.x2 - k.x1;
        const h = k.y2 - k.y1;
        const color = fill?.(k.index);
        const b = badge?.(k.index);
        const cls = [selected?.has(k.index) && 'sel', changed?.(k.index) && 'changed'].filter(Boolean).join(' ');
        return (
          <g
            key={k.index}
            className="kb-key"
            onMouseDown={(e) => onKeyClick?.(k, e)}
            onMouseEnter={(e) => onKeyEnter?.(k, e)}
          >
            <title>{k.name}</title>
            <rect
              x={k.x1 + 1}
              y={k.y1 + 1}
              width={w - 2}
              height={h - 2}
              rx={5}
              className={cls || undefined}
              style={color ? { fill: color, fillOpacity: 0.72, mixBlendMode: 'multiply' } : undefined}
            />
            {b && (
              <text x={k.x1 + w / 2} y={k.y2 - 4} className="kb-badge">
                {b}
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
}
