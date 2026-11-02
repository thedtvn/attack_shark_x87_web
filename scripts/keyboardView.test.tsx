import React from 'react';
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { renderToStaticMarkup } from 'react-dom/server';
import { KeyboardGraphic } from '../src/components/KeyboardGraphic';
import { deriveKeyboardPalette, PRESET_CHARCOAL } from '../src/theme/appearance';
import { KEYS } from '../src/hid/layout';
import { paintColor } from '../src/components/perKeyPaint';
const palette = deriveKeyboardPalette(PRESET_CHARCOAL);
test('one SVG key tree owns fills, legend replacement and interactions, no overlay badges', () => {
  const f1 = KEYS.find(k => k.name === 'F1')!;
  const markup = renderToStaticMarkup(<svg><KeyboardGraphic palette={palette} idPrefix="test"
    fill={i => i === f1.index ? '#ff0000' : undefined}
    label={i => i === f1.index ? 'Mute' : undefined}
    selected={new Set([f1.index])} onKeyClick={() => {}} /></svg>);
  assert.equal((markup.match(/class="kb-key(?: sel)?"/g) || []).length, 87);
  assert.ok(markup.includes('id="test-key-12"'));
  assert.ok(markup.includes('url(#test-paint-12-top)'));
  assert.ok(markup.includes('>Mute</text>'));
  assert.ok(!markup.includes('>F1</text>'));
  assert.ok(!markup.includes('kb-badge'));
  assert.ok(markup.includes('class="kb-key-top"'));
  assert.ok(markup.includes('aria-label="F1"'));
});
test('paint click toggles same colour off; drag does not erase or toggle', () => {
  assert.deepEqual(paintColor([255, 0, 0], [255, 0, 0], true), [0, 0, 0]);
  assert.deepEqual(paintColor([0, 0, 0], [255, 0, 0], true), [255, 0, 0]);
  assert.deepEqual(paintColor([255, 0, 0], [255, 0, 0], false), [255, 0, 0]);
});
