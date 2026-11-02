import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { parseImportedJsonDrafts, parseMacroDraftList, browserCodeToHidUsage } from '../src/components/macroDrafts';
import { bankToEditor, macroBankSnapshot, changedMacroSlots } from '../src/components/macroBankEditor';
import { uploadMacroBank } from '../src/components/macroUpload';
import { KeyMatrix, MATRIX_LEN } from '../src/hid/protocol';
import type { X87 } from '../src/hid/keyboard';
const draft = { id: 'one', name: 'A', events: [{ type: 'key', value: 4, down: true, delayMs: 0 }], repeat: { mode: 'times', count: 1 }, updatedAt: 1 };
const exported = (drafts: unknown[]) => JSON.stringify({ type: 'macro-drafts-export', version: 1, count: drafts.length, drafts });
test('editor snapshots only bank data and supports discarding the final deletion', () => {
  const bank = parseMacroDraftList([draft]);
  const editor = bankToEditor(bank);
  assert.equal(macroBankSnapshot(editor), macroBankSnapshot(bank));
  assert.equal(changedMacroSlots(editor, bank), 0);
  editor[0].events[0].delayMs = 50;
  assert.equal(bank[0].events[0].delayMs, 0, 'editing cannot mutate the saved snapshot');
  assert.equal(changedMacroSlots(editor, bank), 1);
  assert.equal(changedMacroSlots([], bank), 1);
  assert.equal(macroBankSnapshot(bankToEditor(bank)), macroBankSnapshot(bank));
  assert.deepEqual(parseImportedJsonDrafts(exported([])), []);
});
test('strict metadata validation rejects duplicate or missing editor IDs', () => {
  assert.throws(() => parseMacroDraftList([{ ...draft, id: '' }]));
  assert.throws(() => parseMacroDraftList([draft, draft]));
});
test('imports reject invalid entries, fractional delays, unknown types and wrong counts', () => {
  for (const bad of [
    { ...draft, name: 'a'.repeat(31) }, { ...draft, events: [] },
    { ...draft, events: [{ ...draft.events[0], delayMs: 0.5 }] },
    { ...draft, events: [{ ...draft.events[0], delayMs: null }] },
    { ...draft, events: [{ ...draft.events[0], type: 'unknown' }] },
    { ...draft, repeat: { mode: 'times', count: 0 } },
  ]) assert.throws(() => parseImportedJsonDrafts(exported([bad])));
  assert.throws(() => parseImportedJsonDrafts(JSON.stringify([draft])));
  assert.throws(() => parseImportedJsonDrafts(exported(Array.from({ length: 33 }, () => draft))));
  assert.throws(() => parseImportedJsonDrafts(JSON.stringify({ type: 'macro-drafts-export', version: 1, count: 2, drafts: [draft] })));
  assert.deepEqual(parseImportedJsonDrafts(exported([draft, { ...draft, name: 'B' }])).map(d => d.name), ['A', 'B']);
});
test('recorder maps numpad Enter separately', () => {
  assert.equal(browserCodeToHidUsage('NumpadEnter'), 0x58);
  assert.equal(browserCodeToHidUsage('Enter'), 0x28);
  assert.equal(browserCodeToHidUsage('NotSupported'), undefined);
});
function mock(failure?: 'read' | 'save' | 'upload' | 'assign', wireless = false) {
  const calls: string[] = [];
  const kb = {
    connection: wireless ? 'wireless' : 'wired',
    async readMacroBank() { calls.push('read'); if (failure === 'read') throw Error('read failed'); return [draft]; },
    async replaceMacroBank() { calls.push('upload'); if (failure === 'upload') throw Error('write failed'); return { verified: !wireless }; },
    async keyMatrix() { calls.push('matrix'); return new KeyMatrix(new Uint8Array(MATRIX_LEN * 4)); },
    async setKeyMatrix() { calls.push('assign'); if (failure === 'assign') throw Error('mapping failed'); },
  } as unknown as X87;
  const backup = () => { calls.push('backup'); if (failure === 'save') throw Error('quota'); };
  return { calls, kb, backup };
}
test('USB backs up before bank write and never writes key bindings', async () => {
  const m = mock();
  assert.deepEqual(await uploadMacroBank(m.kb, [draft], m.backup), { verified: true });
  assert.deepEqual(m.calls, ['read', 'backup', 'upload']);
});
test('backup failures prevent all writes; failed uploads prevent assignment', async () => {
  for (const failure of ['read', 'save', 'upload'] as const) {
    const m = mock(failure);
    await assert.rejects(uploadMacroBank(m.kb, [draft], m.backup), failure === 'upload' ? /replacement failed/ : /Backup failed/);
    assert.ok(!m.calls.includes('assign'));
    if (failure !== 'upload') assert.ok(!m.calls.includes('upload'));
  }
});
test('bank uploader cannot invoke key assignment even when those methods exist', async () => {
  const m = mock('assign');
  await uploadMacroBank(m.kb, [draft], m.backup);
  assert.ok(!m.calls.includes('matrix'));
  assert.ok(!m.calls.includes('assign'));
});
test('wireless also requires backup before replacing the bank', async () => {
  const m = mock(undefined, true);
  assert.deepEqual(await uploadMacroBank(m.kb, [draft], m.backup), { verified: false });
  assert.deepEqual(m.calls, ['read', 'backup', 'upload']);
});
