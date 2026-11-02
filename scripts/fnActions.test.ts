import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { FN_SHORTCUTS, CONTROLLER_SHORTCUTS, fnShortcutAction, fnShortcutFor, fnFactoryAction } from '../src/hid/fnActions';
import { decodeAction, encodeAction, KeyMatrix, MATRIX_LEN } from '../src/hid/protocol';

test('FN and FN2 have distinct vendor encodings and roundtrip separately', () => {
  for (const [kind, bytes] of [['fn', [13, 0, 0, 0]], ['fn2', [13, 1, 0, 0]]] as const) {
    assert.deepEqual([...encodeAction({ kind })], [...bytes]);
    assert.deepEqual(decodeAction(Uint8Array.from(bytes)), { kind });
  }
  assert.equal(decodeAction(Uint8Array.of(13, 2, 0, 0)).kind, 'raw');
});
test('manual connection and lighting shortcuts map to exact wire words', () => {
  const fixtures = new Map([
    ['1', 0x05000007], ['2', 0x06000007], ['3', 0x07000007], ['4', 0x08000007],
    ['Backspace', 0x11000007], ['Space', 0x04000007], ['LWin', 0x01000007],
    ['\\', 0x0000000a], ['Enter', 0x0002000a], ['Up', 0x0001030a], ['Down', 0x0002030a],
    ['Left', 0x0002040a], ['Right', 0x0001040a], ['CapsLock', 0x0100000a], ['A', 0x0102000a],
  ]);
  for (const [key, word] of fixtures) {
    const action = fnFactoryAction(key);
    const bytes = encodeAction(action);
    assert.equal(new DataView(bytes.buffer).getUint32(0, true), word, key);
    assert.equal(fnShortcutFor(action)?.key, key);
  }
  assert.equal(fnShortcutFor(fnFactoryAction('4'))?.name, '2.4 GHz receiver');
});
test('all controller selections roundtrip without rewriting unrelated matrix entries', () => {
  assert.equal(new Set(FN_SHORTCUTS.map(s => s.word)).size, FN_SHORTCUTS.length);
  const original = new KeyMatrix(new Uint8Array(MATRIX_LEN * 4).fill(0x12));
  for (const shortcut of FN_SHORTCUTS) {
    const action = fnShortcutAction(shortcut);
    assert.equal(fnShortcutFor(decodeAction(encodeAction(action))), shortcut);
    const next = original.with(7, action);
    assert.deepEqual(next.bytes.subarray(0, 28), original.bytes.subarray(0, 28));
    assert.deepEqual(next.bytes.subarray(32), original.bytes.subarray(32));
  }
  assert.equal(fnShortcutFor({ kind: 'raw', value: 0x09000007 }), undefined);
  assert.equal(fnShortcutFor({ kind: 'key', modifiers: 0, usage: 7, usage2: 0 }), undefined);
});
test('Controller excludes Media duplicates without losing their Fn labels', () => {
  assert.ok(CONTROLLER_SHORTCUTS.every(s => fnShortcutAction(s).kind !== 'consumer'));
  for (const key of ['F1', 'F2', 'F5', 'F7', 'F8', 'F9', 'F10', 'F11', 'F12']) {
    assert.ok(!CONTROLLER_SHORTCUTS.some(s => s.key === key), key);
    assert.equal(fnShortcutAction(FN_SHORTCUTS.find(s => s.key === key)!).kind, 'consumer');
    assert.ok(fnShortcutFor(fnFactoryAction(key)), 'Fn labels must still resolve');
  }
  assert.ok(CONTROLLER_SHORTCUTS.some(s => s.key === '4'));
  assert.ok(CONTROLLER_SHORTCUTS.some(s => s.key === 'Up'));
});
test('unmapped factory keys stay empty rather than inheriting FN1 controls', () => {
  assert.deepEqual(fnFactoryAction('not-a-key'), { kind: 'none' });
  assert.deepEqual(fnFactoryAction('5'), { kind: 'none' });
});
