import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { KEYS, IMAGE_WIDTH, IMAGE_HEIGHT } from '../src/hid/layout.ts';
import {
  deriveKeyboardPalette,
  getKeyType,
  KEYBOARD_LEGENDS,
  PRESET_CHARCOAL,
  PRESET_CREAM,
  type KeyboardAppearance,
} from '../src/theme/appearance.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export function generateSvgForAppearance(app: KeyboardAppearance, idPrefix = 'kb'): string {
  const palette = deriveKeyboardPalette(app);
  const svgParts: string[] = [];

  svgParts.push(`<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${IMAGE_WIDTH} ${IMAGE_HEIGHT}" width="${IMAGE_WIDTH}" height="${IMAGE_HEIGHT}">
  <defs>
    <!-- Case outer gradient -->
    <linearGradient id="${idPrefix}-case-outer" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" stop-color="${palette.caseOuterStart}" />
      <stop offset="55%" stop-color="${palette.caseOuterMid}" />
      <stop offset="100%" stop-color="${palette.caseOuterEnd}" />
    </linearGradient>

    <!-- Case bevel inner gradient -->
    <linearGradient id="${idPrefix}-case-bevel" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" stop-color="${palette.caseBevelStart}" stop-opacity="0.85" />
      <stop offset="100%" stop-color="${palette.caseBevelEnd}" stop-opacity="0.4" />
    </linearGradient>

    <!-- Plate well gradient -->
    <linearGradient id="${idPrefix}-plate-bg" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" stop-color="${palette.plateBgStart}" />
      <stop offset="100%" stop-color="${palette.plateBgEnd}" />
    </linearGradient>

    <!-- Main keys gradients -->
    <linearGradient id="${idPrefix}-main-skirt" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" stop-color="${palette.main.skirtGradStart}" />
      <stop offset="100%" stop-color="${palette.main.skirtGradEnd}" />
    </linearGradient>
    <linearGradient id="${idPrefix}-main-top" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" stop-color="${palette.main.topGradStart}" />
      <stop offset="35%" stop-color="${palette.main.topGradMid}" />
      <stop offset="100%" stop-color="${palette.main.topGradEnd}" />
    </linearGradient>

    <!-- Sub / Modifier keys gradients -->
    <linearGradient id="${idPrefix}-sub-skirt" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" stop-color="${palette.sub.skirtGradStart}" />
      <stop offset="100%" stop-color="${palette.sub.skirtGradEnd}" />
    </linearGradient>
    <linearGradient id="${idPrefix}-sub-top" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" stop-color="${palette.sub.topGradStart}" />
      <stop offset="35%" stop-color="${palette.sub.topGradMid}" />
      <stop offset="100%" stop-color="${palette.sub.topGradEnd}" />
    </linearGradient>

    <!-- Accent keys gradients -->
    <linearGradient id="${idPrefix}-accent-skirt" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" stop-color="${palette.accent.skirtGradStart}" />
      <stop offset="100%" stop-color="${palette.accent.skirtGradEnd}" />
    </linearGradient>
    <linearGradient id="${idPrefix}-accent-top" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" stop-color="${palette.accent.topGradStart}" />
      <stop offset="35%" stop-color="${palette.accent.topGradMid}" />
      <stop offset="100%" stop-color="${palette.accent.topGradEnd}" />
    </linearGradient>

    <!-- RGB light bar gradient -->
    <linearGradient id="${idPrefix}-rgb-led" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="#00f5b8" />
      <stop offset="25%" stop-color="#10f9e3" />
      <stop offset="48%" stop-color="#38b6ff" />
      <stop offset="72%" stop-color="#6a77ff" />
      <stop offset="88%" stop-color="#ab4fff" />
      <stop offset="100%" stop-color="#ff4278" />
    </linearGradient>

    <filter id="${idPrefix}-case-shadow" x="-5%" y="-5%" width="110%" height="115%">
      <feDropShadow dx="0" dy="2.5" stdDeviation="2.5" flood-color="#000000" flood-opacity="0.14" />
    </filter>
    <filter id="${idPrefix}-rgb-glow" x="-20%" y="-50%" width="140%" height="200%">
      <feGaussianBlur stdDeviation="3.0" result="glow" />
      <feComposite in="SourceGraphic" in2="glow" operator="over" />
    </filter>
  </defs>

  <!-- Keyboard Case Outline & Drop Shadow -->
  <rect x="2.5" y="2" width="664" height="254.5" rx="13.5" fill="${palette.caseOuterEnd}" filter="url(#${idPrefix}-case-shadow)" />

  <!-- Outer Bezel Body -->
  <rect x="2.5" y="2" width="664" height="254.5" rx="13.5" fill="url(#${idPrefix}-case-outer)" stroke="${palette.caseBorder}" stroke-width="0.8" />
  <rect x="3.5" y="3" width="662" height="252.5" rx="12.5" fill="none" stroke="url(#${idPrefix}-case-bevel)" stroke-width="1.2" />

  <!-- Inner Plate Cutout Well -->
  <rect x="13.5" y="15.5" width="642" height="228" rx="8" fill="url(#${idPrefix}-plate-bg)" stroke="${palette.plateBorder}" stroke-width="0.8" />
  <rect x="14" y="16" width="641" height="227" rx="7.5" fill="none" stroke="${palette.plateShadow}" stroke-width="0.7" opacity="0.45" />

  <!-- Attack Shark X87 Signature RGB Light Bar -->
  <g id="${idPrefix}-rgb-light-bar">
    <rect x="554" y="148.5" width="90" height="9" rx="4.5" fill="#141519" stroke="${palette.plateBorder}" stroke-width="0.8" />
    <rect x="556" y="150" width="86" height="6" rx="3" fill="url(#${idPrefix}-rgb-led)" opacity="0.65" filter="url(#${idPrefix}-rgb-glow)" />
    <rect x="556" y="150" width="86" height="6" rx="3" fill="url(#${idPrefix}-rgb-led)" />
    <rect x="556" y="150" width="86" height="2.2" rx="1.1" fill="#ffffff" opacity="0.45" />
  </g>

  <!-- Keycaps -->
  <g id="${idPrefix}-keycaps" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif">`);

  for (const key of KEYS) {
    const w = key.x2 - key.x1;
    const h = key.y2 - key.y1;
    const type = getKeyType(key.name);
    const keyPalette = palette[type];

    const padX = 2.4;
    const padTop = 1.8;
    const padBottom = 3.6;
    const dx = key.x1 + padX;
    const dy = key.y1 + padTop;
    const dw = w - padX * 2;
    const dh = h - padTop - padBottom;

    const info = KEYBOARD_LEGENDS[key.name] || { primary: key.name };
    const primary = info.primary;
    const secondary = info.secondary;
    const fontSize = info.size || 8.5;

    const cx = key.x1 + w / 2;
    const cy = key.y1 + h / 2 - 0.5;

    svgParts.push(`    <!-- Key: ${key.name} (${type}) -->
    <g id="${idPrefix}-key-${key.index}">
      <rect x="${key.x1 + 0.6}" y="${key.y1 + 1.6}" width="${w - 1.2}" height="${h - 1.6}" rx="4.8" fill="#000000" opacity="0.52" />
      <rect x="${key.x1 + 1.2}" y="${key.y1 + 1.0}" width="${w - 2.4}" height="${h - 2.0}" rx="4.5" fill="url(#${idPrefix}-${type}-skirt)" stroke="${keyPalette.skirtStroke}" stroke-width="0.6" />
      <rect x="${key.x1 + 2.0}" y="${key.y2 - 3.4}" width="${w - 4.0}" height="1.8" rx="0.9" fill="${keyPalette.dishHighlight}" opacity="0.3" />
      <rect x="${dx.toFixed(1)}" y="${dy.toFixed(1)}" width="${dw.toFixed(1)}" height="${dh.toFixed(1)}" rx="3.5" fill="url(#${idPrefix}-${type}-top)" stroke="${keyPalette.dishStroke}" stroke-width="0.5" />
      <line x1="${(dx + 3.0).toFixed(1)}" y1="${(dy + 0.8).toFixed(1)}" x2="${(dx + dw - 3.0).toFixed(1)}" y2="${(dy + 0.8).toFixed(1)}" stroke="${keyPalette.dishHighlight}" stroke-width="0.7" stroke-linecap="round" opacity="0.65" />`);

    if (key.name === 'F' || key.name === 'J') {
      svgParts.push(`      <rect x="${(cx - 3.2).toFixed(1)}" y="${(cy + 5.2).toFixed(1)}" width="6.4" height="1.1" rx="0.55" fill="${keyPalette.legendColor}" opacity="0.75" />`);
    }

    if (key.name === 'CapsLock') {
      const lensX = key.x1 + w - 9.0;
      svgParts.push(`      <circle cx="${lensX.toFixed(1)}" cy="${cy.toFixed(1)}" r="1.6" fill="#141518" stroke="${keyPalette.skirtStroke}" stroke-width="0.5" />
      <circle cx="${lensX.toFixed(1)}" cy="${cy.toFixed(1)}" r="0.9" fill="#2a2c33" />`);
    }

    if (key.name === 'Space') {
      svgParts.push(`      <rect x="${(cx - 18).toFixed(1)}" y="${(cy - 0.8).toFixed(1)}" width="36" height="1.6" rx="0.8" fill="${keyPalette.legendColor}" opacity="0.32" />`);
    }

    if (info.isArrow) {
      let pathD = '';
      if (info.isArrow === 'up') {
        pathD = `M ${cx.toFixed(1)} ${(cy - 4.2).toFixed(1)} L ${(cx + 4.6).toFixed(1)} ${(cy + 3.4).toFixed(1)} H ${(cx - 4.6).toFixed(1)} Z`;
      } else if (info.isArrow === 'down') {
        pathD = `M ${cx.toFixed(1)} ${(cy + 4.2).toFixed(1)} L ${(cx + 4.6).toFixed(1)} ${(cy - 3.4).toFixed(1)} H ${(cx - 4.6).toFixed(1)} Z`;
      } else if (info.isArrow === 'left') {
        pathD = `M ${(cx - 4.2).toFixed(1)} ${cy.toFixed(1)} L ${(cx + 3.4).toFixed(1)} ${(cy - 4.6).toFixed(1)} V ${(cy + 4.6).toFixed(1)} Z`;
      } else if (info.isArrow === 'right') {
        pathD = `M ${(cx + 4.2).toFixed(1)} ${cy.toFixed(1)} L ${(cx - 3.4).toFixed(1)} ${(cy - 4.6).toFixed(1)} V ${(cy + 4.6).toFixed(1)} Z`;
      }
      svgParts.push(`      <path d="${pathD}" fill="${keyPalette.legendColor}" stroke="${keyPalette.legendColor}" stroke-width="0.8" stroke-linejoin="round" />`);
    } else if (secondary) {
      const lx = (key.x1 + 6.2).toFixed(1);
      const lySec = (key.name === '`' ? key.y1 + 9.8 : key.y1 + 10.4).toFixed(1);
      const lyPrim = (key.name === '`' ? key.y1 + 18.0 : key.y1 + 19.2).toFixed(1);
      const secSize = key.name === '`' ? 6.8 : 6.0;
      const primSize = key.name === '`' ? 8.2 : 7.6;
      svgParts.push(`      <text x="${lx}" y="${lySec}" fill="${keyPalette.secondaryLegendColor}" font-size="${secSize}" font-weight="600">${secondary}</text>
      <text x="${lx}" y="${lyPrim}" fill="${keyPalette.legendColor}" font-size="${primSize}" font-weight="700">${primary}</text>`);
    } else if (primary) {
      const isSingleLetter = key.name.length === 1;
      const isFKey = key.name.startsWith('F');
      let textX = cx.toFixed(1);
      let anchor = 'middle';
      if (info.hasEnterArrow || info.hasShiftArrow || info.hasBackArrow || info.hasTabArrow) {
        textX = (key.x1 + 6.8).toFixed(1);
        anchor = 'start';
      }
      const textY = isFKey ? (key.y1 + 14.2).toFixed(1) : (cy + 3.0).toFixed(1);
      const weight = isSingleLetter ? '700' : '600';
      const letterSpacing = key.name.length > 2 ? ' letter-spacing="0.02em"' : '';
      svgParts.push(`      <text x="${textX}" y="${textY}" fill="${keyPalette.legendColor}" font-size="${fontSize}" font-weight="${weight}" text-anchor="${anchor}"${letterSpacing}>${primary}</text>`);

      if (info.hasEnterArrow) {
        svgParts.push(`      <path d="M ${(key.x1 + w - 8.5).toFixed(1)} ${(cy - 2.5).toFixed(1)} v 5.5 h -9.5 m 2.5 -2.5 l -2.5 2.5 l 2.5 2.5" fill="none" stroke="${keyPalette.legendColor}" stroke-width="1.1" stroke-linecap="round" stroke-linejoin="round" />`);
      }
      if (info.hasShiftArrow) {
        svgParts.push(`      <path d="M ${(key.x1 + w - 10.5).toFixed(1)} ${(cy + 3.0).toFixed(1)} v -5.5 m -2.5 2.5 l 2.5 -2.5 l 2.5 2.5" fill="none" stroke="${keyPalette.legendColor}" stroke-width="1.1" stroke-linecap="round" stroke-linejoin="round" />`);
      }
      if (info.hasBackArrow) {
        svgParts.push(`      <path d="M ${(key.x1 + w - 8.0).toFixed(1)} ${cy.toFixed(1)} h -9.0 m 2.5 -2.5 l -2.5 2.5 l 2.5 2.5" fill="none" stroke="${keyPalette.legendColor}" stroke-width="1.1" stroke-linecap="round" stroke-linejoin="round" />`);
      }
      if (info.hasTabArrow) {
        svgParts.push(`      <path d="M ${(key.x1 + w - 14.5).toFixed(1)} ${cy.toFixed(1)} h 7.0 m -2.2 -2.2 l 2.2 2.2 l -2.2 2.2 M ${(key.x1 + w - 7.5).toFixed(1)} ${(cy - 2.5).toFixed(1)} v 5.0" fill="none" stroke="${keyPalette.legendColor}" stroke-width="1.0" stroke-linecap="round" stroke-linejoin="round" />`);
      }
    }

    svgParts.push(`    </g>`);
  }

  svgParts.push(`  </g>
</svg>`);

  return svgParts.join('\n');
}

export function generateKeyboardSvg(): string {
  // Generates default Charcoal & Yellow SVG
  return generateSvgForAppearance(PRESET_CHARCOAL);
}

// When executed directly, generate the SVGs into public/
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const publicDir = path.resolve(__dirname, '../public');

  // Default public/keyboard.svg is Charcoal & Yellow
  const defaultSvg = generateSvgForAppearance(PRESET_CHARCOAL);
  fs.writeFileSync(path.join(publicDir, 'keyboard.svg'), defaultSvg, 'utf-8');

  // Also write explicit preset files
  const creamSvg = generateSvgForAppearance(PRESET_CREAM);
  fs.writeFileSync(path.join(publicDir, 'keyboard-cream.svg'), creamSvg, 'utf-8');
  fs.writeFileSync(path.join(publicDir, 'keyboard-charcoal.svg'), defaultSvg, 'utf-8');

  console.log(`Generated keyboard SVGs in ${publicDir}:`);
  console.log(' - keyboard.svg (Default: Charcoal & Yellow)');
  console.log(' - keyboard-charcoal.svg (Charcoal & Yellow)');
  console.log(' - keyboard-cream.svg (Retro Cream)');
}
