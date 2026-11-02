import React, { useId } from 'react';
import { IMAGE_HEIGHT, IMAGE_WIDTH, KEYS, type KeyDef } from '../hid/layout';
import {
  type DerivedKeyboardPalette,
  getKeyType,
  KEYBOARD_LEGENDS,
  deriveKeyPalette,
} from '../theme/appearance';
import { useAppearance } from '../theme/AppearanceContext';

export interface KeyboardKeyProps {
  selected?: Set<number>;
  fill?: (index: number) => string | undefined;
  label?: (index: number) => string | undefined;
  keyTitle?: (index: number) => string | undefined;
  changed?: (index: number) => boolean;
  onKeyClick?: (key: KeyDef, e: React.MouseEvent) => void;
  onKeyEnter?: (key: KeyDef, e: React.MouseEvent) => void;
}

interface KeyboardGraphicProps extends KeyboardKeyProps {
  palette: DerivedKeyboardPalette;
  idPrefix?: string;
}

export function KeyboardGraphic({ palette, idPrefix = 'kb', selected, fill, label, keyTitle, changed, onKeyClick, onKeyEnter }: KeyboardGraphicProps) {
  return (
    <g id={`${idPrefix}-graphic`}>
      <defs>
        {/* Case outer gradient */}
        <linearGradient id={`${idPrefix}-case-outer`} x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor={palette.caseOuterStart} />
          <stop offset="55%" stopColor={palette.caseOuterMid} />
          <stop offset="100%" stopColor={palette.caseOuterEnd} />
        </linearGradient>

        {/* Case bevel inner gradient */}
        <linearGradient id={`${idPrefix}-case-bevel`} x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor={palette.caseBevelStart} stopOpacity="0.85" />
          <stop offset="100%" stopColor={palette.caseBevelEnd} stopOpacity="0.4" />
        </linearGradient>

        {/* Plate well gradient */}
        <linearGradient id={`${idPrefix}-plate-bg`} x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor={palette.plateBgStart} />
          <stop offset="100%" stopColor={palette.plateBgEnd} />
        </linearGradient>

        {/* Main keys gradients */}
        <linearGradient id={`${idPrefix}-main-skirt`} x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor={palette.main.skirtGradStart} />
          <stop offset="100%" stopColor={palette.main.skirtGradEnd} />
        </linearGradient>
        <linearGradient id={`${idPrefix}-main-top`} x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor={palette.main.topGradStart} />
          <stop offset="35%" stopColor={palette.main.topGradMid} />
          <stop offset="100%" stopColor={palette.main.topGradEnd} />
        </linearGradient>

        {/* Sub / Modifier keys gradients */}
        <linearGradient id={`${idPrefix}-sub-skirt`} x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor={palette.sub.skirtGradStart} />
          <stop offset="100%" stopColor={palette.sub.skirtGradEnd} />
        </linearGradient>
        <linearGradient id={`${idPrefix}-sub-top`} x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor={palette.sub.topGradStart} />
          <stop offset="35%" stopColor={palette.sub.topGradMid} />
          <stop offset="100%" stopColor={palette.sub.topGradEnd} />
        </linearGradient>

        {/* Accent keys gradients */}
        <linearGradient id={`${idPrefix}-accent-skirt`} x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor={palette.accent.skirtGradStart} />
          <stop offset="100%" stopColor={palette.accent.skirtGradEnd} />
        </linearGradient>
        <linearGradient id={`${idPrefix}-accent-top`} x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor={palette.accent.topGradStart} />
          <stop offset="35%" stopColor={palette.accent.topGradMid} />
          <stop offset="100%" stopColor={palette.accent.topGradEnd} />
        </linearGradient>

        {/* RGB light bar gradient */}
        <linearGradient id={`${idPrefix}-rgb-led`} x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#00f5b8" />
          <stop offset="25%" stopColor="#10f9e3" />
          <stop offset="48%" stopColor="#38b6ff" />
          <stop offset="72%" stopColor="#6a77ff" />
          <stop offset="88%" stopColor="#ab4fff" />
          <stop offset="100%" stopColor="#ff4278" />
        </linearGradient>

        {/* Glow filter for RGB bar */}
        <filter id={`${idPrefix}-rgb-glow`} x="-20%" y="-50%" width="140%" height="200%">
          <feGaussianBlur stdDeviation="3.0" result="glow" />
          <feComposite in="SourceGraphic" in2="glow" operator="over" />
        </filter>
      </defs>

      {/* Case Outer Chassis */}
      <rect
        x="2.5"
        y="2"
        width="664"
        height="254.5"
        rx="13.5"
        fill={`url(#${idPrefix}-case-outer)`}
        stroke={palette.caseBorder}
        strokeWidth="0.8"
      />
      <rect
        x="3.5"
        y="3"
        width="662"
        height="252.5"
        rx="12.5"
        fill="none"
        stroke={`url(#${idPrefix}-case-bevel)`}
        strokeWidth="1.2"
      />

      {/* Plate Cutout Well */}
      <rect
        x="13.5"
        y="15.5"
        width="642"
        height="228"
        rx="8"
        fill={`url(#${idPrefix}-plate-bg)`}
        stroke={palette.plateBorder}
        strokeWidth="0.8"
      />
      <rect
        x="14"
        y="16"
        width="641"
        height="227"
        rx="7.5"
        fill="none"
        stroke={palette.plateShadow}
        strokeWidth="0.7"
        opacity="0.5"
      />

      {/* Attack Shark X87 Signature RGB Light Bar */}
      <g id={`${idPrefix}-rgb-light-bar`}>
        <rect
          x="554"
          y="148.5"
          width="90"
          height="9"
          rx="4.5"
          fill="#141519"
          stroke={palette.plateBorder}
          strokeWidth="0.8"
        />
        <rect
          x="556"
          y="150"
          width="86"
          height="6"
          rx="3"
          fill={`url(#${idPrefix}-rgb-led)`}
          opacity="0.65"
          filter={`url(#${idPrefix}-rgb-glow)`}
        />
        <rect
          x="556"
          y="150"
          width="86"
          height="6"
          rx="3"
          fill={`url(#${idPrefix}-rgb-led)`}
        />
        <rect
          x="556"
          y="150"
          width="86"
          height="2.2"
          rx="1.1"
          fill="#ffffff"
          opacity="0.45"
        />
      </g>

      {/* Keycaps Vector Group */}
      <g
        id={`${idPrefix}-keycaps`}
        fontFamily="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif"
      >
        {KEYS.map((key) => {
          const w = key.x2 - key.x1;
          const h = key.y2 - key.y1;
          const type = getKeyType(key.name);
          const color = fill?.(key.index);
          const keyPalette = color ? deriveKeyPalette(color, '#ffffff') : palette[type];
          const replacement = label?.(key.index);
          const gradient = color ? `${idPrefix}-paint-${key.index}` : `${idPrefix}-${type}`;

          const padX = 2.4;
          const padTop = 1.8;
          const padBottom = 3.6;
          const dx = key.x1 + padX;
          const dy = key.y1 + padTop;
          const dw = w - padX * 2;
          const dh = h - padTop - padBottom;

          const info = replacement !== undefined
            ? { primary: replacement, size: Math.min(8.5, (dw - 5) / Math.max(replacement.length * 0.6, 1)) }
            : KEYBOARD_LEGENDS[key.name] || { primary: key.name };
          const primary = info.primary;
          const secondary = info.secondary;
          const fontSize = info.size || 8.5;

          const cx = key.x1 + w / 2;
          const cy = key.y1 + h / 2 - 0.5;

          return (
            <g key={key.index} id={`${idPrefix}-key-${key.index}`}
              className={`kb-key${selected?.has(key.index) ? ' sel' : ''}${changed?.(key.index) ? ' changed' : ''}`}
              data-key-index={key.index}
              role={onKeyClick ? 'button' : undefined}
              aria-label={onKeyClick ? key.name : undefined}
              tabIndex={onKeyClick ? 0 : undefined}
              onMouseDown={(e) => { e.preventDefault(); onKeyClick?.(key, e); }}
              onMouseEnter={(e) => onKeyEnter?.(key, e)}
              onKeyDown={(e) => {
                if (onKeyClick && (e.key === 'Enter' || e.key === ' ')) {
                  e.preventDefault();
                  e.currentTarget.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
                }
              }}
            >
              <title>{keyTitle?.(key.index) ?? (replacement !== undefined ? `${key.name}: ${replacement}` : key.name)}</title>
              {color && <defs>
                <linearGradient id={`${gradient}-skirt`} x1="0%" y1="0%" x2="0%" y2="100%">
                  <stop offset="0%" stopColor={keyPalette.skirtGradStart} />
                  <stop offset="100%" stopColor={keyPalette.skirtGradEnd} />
                </linearGradient>
                <linearGradient id={`${gradient}-top`} x1="0%" y1="0%" x2="0%" y2="100%">
                  <stop offset="0%" stopColor={keyPalette.topGradStart} />
                  <stop offset="50%" stopColor={keyPalette.topGradMid} />
                  <stop offset="100%" stopColor={keyPalette.topGradEnd} />
                </linearGradient>
              </defs>}
              {/* Plate switch recess shadow */}
              <rect
                x={key.x1 + 0.6}
                y={key.y1 + 1.6}
                width={w - 1.2}
                height={h - 1.6}
                rx={4.8}
                fill="#000000"
                opacity={0.52}
              />

              {/* Key outer skirt: selection styling lives on the actual key shape. */}
              <rect
                className="kb-key-skirt"
                x={key.x1 + 1.2}
                y={key.y1 + 1.0}
                width={w - 2.4}
                height={h - 2.0}
                rx={4.5}
                fill={`url(#${gradient}-skirt)`}
                stroke={keyPalette.skirtStroke}
                strokeWidth={0.6}
              />

              {/* Key skirt bottom lip reflection */}
              <rect
                x={key.x1 + 2.0}
                y={key.y2 - 3.4}
                width={w - 4.0}
                height={1.8}
                rx={0.9}
                fill={keyPalette.dishHighlight}
                opacity={0.3}
              />

              {/* Top scoop dish */}
              <rect className="kb-key-top"
                x={dx}
                y={dy}
                width={dw}
                height={dh}
                rx={3.5}
                fill={`url(#${gradient}-top)`}
                stroke={keyPalette.dishStroke}
                strokeWidth={0.5}
              />

              {/* Specular highlight rim */}
              <line
                x1={dx + 3.0}
                y1={dy + 0.8}
                x2={dx + dw - 3.0}
                y2={dy + 0.8}
                stroke={keyPalette.dishHighlight}
                strokeWidth={0.7}
                strokeLinecap="round"
                opacity={0.65}
              />

              {/* Tactile homing bump (F and J) */}
              {replacement === undefined && (key.name === 'F' || key.name === 'J') && (
                <rect
                  x={cx - 3.2}
                  y={cy + 5.2}
                  width={6.4}
                  height={1.1}
                  rx={0.55}
                  fill={keyPalette.legendColor}
                  opacity={0.75}
                />
              )}

              {/* CapsLock indicator lens */}
              {key.name === 'CapsLock' && (
                <>
                  <circle
                    cx={key.x1 + w - 9.0}
                    cy={cy}
                    r={1.6}
                    fill="#141518"
                    stroke={keyPalette.skirtStroke}
                    strokeWidth={0.5}
                  />
                  <circle
                    cx={key.x1 + w - 9.0}
                    cy={cy}
                    r={0.9}
                    fill="#2a2c33"
                  />
                </>
              )}

              {/* Spacebar center balance guide */}
              {key.name === 'Space' && (
                <rect
                  x={cx - 18}
                  y={cy - 0.8}
                  width={36}
                  height={1.6}
                  rx={0.8}
                  fill={keyPalette.legendColor}
                  opacity={0.32}
                />
              )}

              {/* Arrow keys */}
              {info.isArrow && (
                <path
                  d={
                    info.isArrow === 'up'
                      ? `M ${cx} ${cy - 4.2} L ${cx + 4.6} ${cy + 3.4} H ${cx - 4.6} Z`
                      : info.isArrow === 'down'
                      ? `M ${cx} ${cy + 4.2} L ${cx + 4.6} ${cy - 3.4} H ${cx - 4.6} Z`
                      : info.isArrow === 'left'
                      ? `M ${cx - 4.2} ${cy} L ${cx + 3.4} ${cy - 4.6} V ${cy + 4.6} Z`
                      : `M ${cx + 4.2} ${cy} L ${cx - 3.4} ${cy - 4.6} V ${cy + 4.6} Z`
                  }
                  fill={keyPalette.legendColor}
                  stroke={keyPalette.legendColor}
                  strokeWidth="0.8"
                  strokeLinejoin="round"
                />
              )}

              {/* Dual legends (e.g. 1 !, ; :) */}
              {!info.isArrow && secondary && (
                <>
                  <text
                    x={key.x1 + 6.2}
                    y={key.name === '`' ? key.y1 + 9.8 : key.y1 + 10.4}
                    fill={keyPalette.secondaryLegendColor}
                    fontSize={key.name === '`' ? 6.8 : 6.0}
                    fontWeight="600"
                    fontFamily="inherit"
                  >
                    {secondary}
                  </text>
                  <text
                    x={key.x1 + 6.2}
                    y={key.name === '`' ? key.y1 + 18.0 : key.y1 + 19.2}
                    fill={keyPalette.legendColor}
                    fontSize={key.name === '`' ? 8.2 : 7.6}
                    fontWeight="700"
                    fontFamily="inherit"
                  >
                    {primary}
                  </text>
                </>
              )}

              {/* Single legends with arrows or icons */}
              {!info.isArrow && !secondary && primary && (
                <>
                  <text
                    x={
                      info.align === 'center' ||
                      key.name.length === 1 ||
                      key.name.startsWith('F') ||
                      info.hasEnterArrow ||
                      info.hasShiftArrow ||
                      info.hasBackArrow ||
                      info.hasTabArrow
                        ? info.hasEnterArrow || info.hasShiftArrow || info.hasBackArrow || info.hasTabArrow
                          ? key.x1 + 6.8
                          : cx
                        : cx
                    }
                    y={key.name.startsWith('F') ? key.y1 + 14.2 : cy + 3.0}
                    fill={keyPalette.legendColor}
                    fontSize={fontSize}
                    fontWeight={key.name.length === 1 ? '700' : '600'}
                    textAnchor={
                      info.hasEnterArrow || info.hasShiftArrow || info.hasBackArrow || info.hasTabArrow
                        ? 'start'
                        : 'middle'
                    }
                    letterSpacing={key.name.length > 2 ? '0.02em' : undefined}
                    fontFamily="inherit"
                  >
                    {primary}
                  </text>

                  {/* Return arrow for Enter */}
                  {info.hasEnterArrow && (
                    <path
                      d={`M ${key.x1 + w - 8.5} ${cy - 2.5} v 5.5 h -9.5 m 2.5 -2.5 l -2.5 2.5 l 2.5 2.5`}
                      fill="none"
                      stroke={keyPalette.legendColor}
                      strokeWidth="1.1"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  )}

                  {/* Shift arrow */}
                  {info.hasShiftArrow && (
                    <path
                      d={`M ${key.x1 + w - 10.5} ${cy + 3.0} v -5.5 m -2.5 2.5 l 2.5 -2.5 l 2.5 2.5`}
                      fill="none"
                      stroke={keyPalette.legendColor}
                      strokeWidth="1.1"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  )}

                  {/* Backspace arrow */}
                  {info.hasBackArrow && (
                    <path
                      d={`M ${key.x1 + w - 8.0} ${cy} h -9.0 m 2.5 -2.5 l -2.5 2.5 l 2.5 2.5`}
                      fill="none"
                      stroke={keyPalette.legendColor}
                      strokeWidth="1.1"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  )}

                  {/* Tab arrow */}
                  {info.hasTabArrow && (
                    <path
                      d={`M ${key.x1 + w - 14.5} ${cy} h 7.0 m -2.2 -2.2 l 2.2 2.2 l -2.2 2.2 M ${key.x1 + w - 7.5} ${cy - 2.5} v 5.0`}
                      fill="none"
                      stroke={keyPalette.legendColor}
                      strokeWidth="1.0"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  )}
                </>
              )}
            </g>
          );
        })}
      </g>
    </g>
  );
}

interface KeyboardSvgProps {
  className?: string;
  style?: React.CSSProperties;
  palette?: DerivedKeyboardPalette;
  idPrefix?: string;
}

export function KeyboardSvg({ className, style, palette, idPrefix }: KeyboardSvgProps) {
  const appearanceCtx = useAppearance();
  const activePalette = palette ?? appearanceCtx.palette;
  const reactId = useId().replace(/:/g, '');
  const prefix = idPrefix ?? `kb-${reactId}`;

  return (
    <svg
      viewBox={`0 0 ${IMAGE_WIDTH} ${IMAGE_HEIGHT}`}
      width={IMAGE_WIDTH}
      height={IMAGE_HEIGHT}
      className={className}
      style={style}
      xmlns="http://www.w3.org/2000/svg"
    >
      <KeyboardGraphic palette={activePalette} idPrefix={prefix} />
    </svg>
  );
}
