import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { LedConfig, LED_CONFIG_LEN } from '../src/hid/protocol';
import { X87 } from '../src/hid/keyboard';
function config() {
  const b = new Uint8Array(LED_CONFIG_LEN);
  b[0x7e] = 0x5a; b[0x7f] = 0xa5; b[0x0a] = 1;
  b[0x3a] = 3; b[0x3b] = 0x10;
  return new LedConfig(b);
}
test('rejects inactive effect brightness 71 instead of displaying or clamping it', () => {
  const c = config();
  c.bytes[0x3a + 11 * 2] = 71;
  assert.equal(c.settings(1).brightness, 3);
  assert.throws(() => c.settings(12), /Reaction.*brightness 71/);
  assert.throws(() => c.with(12, { brightness: 71, speed: 4, color: 0 }), /Invalid lighting settings/);
});
test('all lighting values and IDs must be valid; preserve other slot bytes', () => {
  const c = config();
  for (const settings of [{ brightness: -1, speed: 1, color: 0 }, { brightness: 2, speed: 5, color: 0 }, { brightness: 2, speed: 1, color: 8 }, { brightness: 2, speed: 0.5, color: 0 }]) {
    assert.throws(() => c.with(1, settings));
  }
  assert.throws(() => c.settings(999));
  const next = c.with(12, { brightness: 4, speed: 4, color: 7 });
  assert.deepEqual(next.settings(12), { brightness: 4, speed: 4, color: 7 });
  assert.deepEqual(next.settings(1), c.settings(1));
  assert.equal(next.bytes[0x3b + 11 * 2], 0x47);
});
function mock(stale: boolean) {
  let current = config().bytes;
  let writes = 0;
  const kb = new (X87 as unknown as new (t: unknown) => X87)({
    kind: 'wired', async read() { return current.slice(); },
    async write(_: string, __: number, data: Uint8Array) { writes++; if (!stale) current = data.slice(); },
  });
  return { kb, writes: () => writes };
}
test('lighting updates read back the accepted speed, not just requested state', async () => {
  const m = mock(false);
  const actual = await m.kb.setLedConfigVerified(config().with(1, { brightness: 3, speed: 4, color: 0 }));
  assert.equal(actual.settings(1).speed, 4);
  assert.equal(m.writes(), 1);
});
test('successful send but unchanged speed 1 does not report success for speed 4', async () => {
  const m = mock(true);
  await assert.rejects(m.kb.setLedConfigVerified(config().with(1, { brightness: 3, speed: 4, color: 0 })), /read-back differs.*speed 1/);
  assert.equal(m.writes(), 1);
});
