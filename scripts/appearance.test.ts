import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_APPEARANCE,
  PRESET_CHARCOAL,
  PRESET_CREAM,
  isValidHex,
  normalizeHex,
  adjustLightness,
  getLuminance,
  getContrastRatio,
  getReadableTextColor,
  sanitizeAppearance,
  deriveKeyboardPalette,
  getKeyType,
  ACCENT_KEYS,
  SUB_KEYS,
} from '../src/theme/appearance.ts';
import { KEYS } from '../src/hid/layout.ts';

test('appearance: default is black (charcoal & yellow)', () => {
  assert.equal(DEFAULT_APPEARANCE.preset, 'charcoal');
  assert.equal(DEFAULT_APPEARANCE.caseColor, '#18191c');
  assert.equal(DEFAULT_APPEARANCE.accentKeyColor, '#f5c300');
});

test('appearance: hex validation and normalization', () => {
  assert.equal(isValidHex('#18191c'), true);
  assert.equal(isValidHex('#fff'), true);
  assert.equal(isValidHex('#FFF'), true);
  assert.equal(isValidHex('18191c'), false);
  assert.equal(isValidHex('#12'), false);
  assert.equal(isValidHex('#1234567'), false);
  assert.equal(isValidHex('rgba(0,0,0,0)'), false);
  assert.equal(isValidHex(''), false);

  assert.equal(normalizeHex('#fff'), '#ffffff');
  assert.equal(normalizeHex('#18191C'), '#18191c');
  assert.equal(normalizeHex('#AbC'), '#aabbcc');
  assert.equal(normalizeHex('invalid'), '#000000');
});

test('appearance: color math adjustments preserve valid range', () => {
  const lighter = adjustLightness('#18191c', 20);
  assert.match(lighter, /^#[0-9a-f]{6}$/);
  assert.ok(getLuminance(lighter) > getLuminance('#18191c'));

  const darker = adjustLightness('#eae5d9', -20);
  assert.match(darker, /^#[0-9a-f]{6}$/);
  assert.ok(getLuminance(darker) < getLuminance('#eae5d9'));
});

test('appearance: contrast calculation ensures readable legends', () => {
  // Yellow accent keys must produce dark legends for high contrast
  const yellowLegend = getReadableTextColor('#f5c300');
  assert.equal(yellowLegend, '#151619');
  assert.ok(getContrastRatio('#f5c300', yellowLegend) >= 4.5);

  // Dark charcoal alphas must produce light legends
  const charcoalLegend = getReadableTextColor('#383b42');
  assert.equal(charcoalLegend, '#f5f6f8');

  // Custom preferred legend accepted if contrast is adequate
  const accepted = getReadableTextColor('#18191c', '#f5eed6');
  assert.equal(accepted, '#f5eed6');

  // Preferred legend rejected if contrast is terrible (white on yellow)
  const rejected = getReadableTextColor('#f5c300', '#ffffff');
  assert.equal(rejected, '#151619');
});

test('appearance: sanitize handles null, corrupt or malformed inputs without crashing', () => {
  // Null / undefined / non-object falls back to DEFAULT_APPEARANCE (charcoal)
  assert.deepEqual(sanitizeAppearance(null), DEFAULT_APPEARANCE);
  assert.deepEqual(sanitizeAppearance('corrupt json string'), DEFAULT_APPEARANCE);
  assert.deepEqual(sanitizeAppearance(42), DEFAULT_APPEARANCE);

  // Valid partial object fills in defaults
  const sanitized = sanitizeAppearance({
    version: 1,
    preset: 'cream',
    caseColor: 'bad-hex',
  });
  assert.equal(sanitized.preset, 'cream');
  // Recovered caseColor from PRESET_CREAM
  assert.equal(sanitized.caseColor, PRESET_CREAM.caseColor);

  // Unknown preset defaults to charcoal
  const unknownPreset = sanitizeAppearance({
    preset: 'neon-cyberpunk',
    caseColor: '#112233',
  });
  assert.equal(unknownPreset.preset, 'charcoal');
  assert.equal(unknownPreset.caseColor, '#112233');
});

test('appearance: deriveKeyboardPalette produces complete palettes for all presets', () => {
  const charcoalPalette = deriveKeyboardPalette(PRESET_CHARCOAL);
  assert.ok(charcoalPalette.caseOuterStart);
  assert.ok(charcoalPalette.main.topGradStart);
  assert.ok(charcoalPalette.sub.topGradStart);
  assert.ok(charcoalPalette.accent.topGradStart);
  assert.equal(charcoalPalette.accent.legendColor, '#18191c'); // Dark text on yellow

  const creamPalette = deriveKeyboardPalette(PRESET_CREAM);
  assert.ok(creamPalette.caseOuterStart);
  assert.ok(creamPalette.main.topGradStart);
  assert.ok(creamPalette.sub.topGradStart);
  assert.ok(creamPalette.accent.topGradStart);

  const customPalette = deriveKeyboardPalette({
    version: 1,
    preset: 'custom',
    caseColor: '#123456',
    mainKeyColor: '#234567',
    subKeyColor: '#345678',
    accentKeyColor: '#ff8800',
    legendColor: '#ffffff',
  });
  assert.ok(customPalette.caseOuterStart);
  assert.ok(customPalette.main.topGradStart);
  assert.ok(customPalette.sub.topGradStart);
  assert.ok(customPalette.accent.topGradStart);
});

test('appearance: all 87 keys classified into accent, sub, or main', () => {
  assert.equal(KEYS.length, 87);

  let accentCount = 0;
  let subCount = 0;
  let mainCount = 0;

  for (const k of KEYS) {
    const type = getKeyType(k.name);
    if (type === 'accent') accentCount++;
    else if (type === 'sub') subCount++;
    else if (type === 'main') mainCount++;
  }

  assert.equal(accentCount, ACCENT_KEYS.size); // 7 keys: Esc, Enter, Space, Up, Down, Left, Right
  assert.equal(subCount, SUB_KEYS.size); // 25 modifier/nav keys
  assert.equal(mainCount, 87 - 7 - 25); // 55 alphanumeric & F1-F4, F9-F12 keys
  assert.equal(accentCount + subCount + mainCount, 87);
});
