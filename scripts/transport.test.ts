import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { isConfigDevice, parseWiredReply, createTransport } from '../src/hid/transport';
import { LedConfig } from '../src/hid/protocol';

function descriptor(size: number, id = 6) {
  return { vendorId: 0x258a, productId: 0x010c, collections: [{ usagePage: 0xff00, usage: 1,
    featureReports: [{ reportId: id, items: [{ reportSize: 8, reportCount: size }] }] }] } as unknown as HIDDevice;
}
function reply() {
  const buf = new Uint8Array(144);
  const b = buf.subarray(4, 140);
  b.set([6, 0x84, 0, 0, 1, 0, 128, 0]);
  b[8 + 10] = 11; b[8 + 0x18] = 4;
  b[8 + 0x3a + 20] = 2; b[8 + 0x3b + 20] = 0x47;
  b[8 + 126] = 0x5a; b[8 + 127] = 0xa5;
  return new DataView(buf.buffer, 4, 136);
}
test('selects only the 520-byte USB feature collection', () => {
  assert.equal(isConfigDevice(descriptor(0)), false);
  assert.equal(isConfigDevice(descriptor(5)), false);
  assert.equal(isConfigDevice(descriptor(519)), true);
  assert.equal(isConfigDevice(descriptor(519, 5)), false);
});
test('short USB reply includes ID; Neon stream and two minute sleep round-trip', () => {
  const cfg = new LedConfig(parseWiredReply(reply(), 0x84, 0, 1, 0, 128));
  assert.equal(cfg.valid, true);
  assert.equal(cfg.effectId, 11);
  assert.equal(cfg.sleepSecs, 120);
  assert.deepEqual(cfg.settings(11), {brightness: 2, speed: 4, color: 7});
  assert.equal(cfg.withOptions({ sleepSecs: 120 }).bytes[0x18], 4);
});
test('rejects truncated or unrelated replies instead of showing defaults', () => {
  assert.throws(() => parseWiredReply(new DataView(new ArrayBuffer(135)), 0x84, 0, 1, 0, 128));
  const v = reply(); v.setUint8(1, 0x83);
  assert.throws(() => parseWiredReply(v, 0x84, 0, 1, 0, 128));
});
test('wired request/reply transactions never interleave', async () => {
  const device = descriptor(519);
  const log: string[] = [];
  Object.assign(device, {
    async sendFeatureReport() { log.push('send'); },
    async receiveFeatureReport() { log.push('receive'); return reply(); },
  });
  const transport = createTransport(device);
  await Promise.all([transport.read('ledConfig', 0, 128), transport.read('ledConfig', 0, 128)]);
  assert.deepEqual(log, ['send', 'receive', 'send', 'receive']);
  transport.dispose();
  await assert.rejects(transport.read('ledConfig', 0, 128));
});
test('truncated wireless replies fail rather than zero-filling config', async () => {
  let listener: ((event: HIDInputReportEvent) => void) | undefined;
  const device = {
    vendorId: 0x3554, productId: 0xfa09,
    collections: [{ usagePage: 0xff02, usage: 2, outputReports: [{ reportId: 0x13 }] }],
    addEventListener(_: string, l: typeof listener) { listener = l; },
    removeEventListener() { listener = undefined; },
    async sendReport() {
      const bytes = Uint8Array.of(0x44, 10, 0, 14);
      listener?.({ reportId: 0x13, data: new DataView(bytes.buffer) } as HIDInputReportEvent);
    },
  } as unknown as HIDDevice;
  const transport = createTransport(device);
  await assert.rejects(transport.read('ledConfig', 0, 128), /Truncated/);
  transport.dispose();
  assert.equal(listener, undefined);
});
