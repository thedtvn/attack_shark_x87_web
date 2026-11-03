import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { isConfigDevice, parseWiredReply, createTransport, WirelessReadStream } from '../src/hid/transport';
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

function wirelessReply(cmd: number, sub: number, total: number, index: number, size: number) {
  const r = new Uint8Array(20);
  r.set([19, cmd, total, index, (sub << 4) | size]);
  r.fill(index & 255, 5, 5 + size);
  return r;
}
test('observed receiver matrix 504 and RGB490-byte streams pad only unused tails', () => {
  for (const [cmd, actual, requested, minimum] of [[0x41,504,512,504],[0x49,490,512,420],[0x42,378,378,378]]) {
    const stream = new WirelessReadStream(cmd, 0, requested, minimum);
    const total = Math.ceil(actual / 14);
    let result: Uint8Array | null = null;
    for (let index = 0; index < total; index++) result = stream.push(wirelessReply(cmd,0,total,index,Math.min(14,actual-index*14)));
    assert.equal(result?.length, requested);
    assert.ok(result!.slice(actual).every(b=>b===0));
  }
});
test('wireless assembly ignores duplicate/order/stale page but never missing or conflicting data', () => {
  const stream = new WirelessReadStream(0x43, 1, 512, 512);
  assert.equal(stream.push(wirelessReply(0x43,0,37,0,14)),null);
  assert.equal(stream.push(wirelessReply(0x43,1,37,36,8)),null);
  for (let index=0;index<35;index++) {
    const p=wirelessReply(0x43,1,37,index,14);
    assert.equal(stream.push(p),null);
    assert.equal(stream.push(p),null);
  }
  assert.equal(stream.push(wirelessReply(0x43,1,37,35,14))?.length,512);
  const conflict=new WirelessReadStream(0x44,0,128,128);
  const p=wirelessReply(0x44,0,10,0,14);conflict.push(p);p[5]++;
  assert.throws(()=>conflict.push(p),/Conflicting duplicate/);
});
test('wireless macro reads request eight distinct pages without any write command', async () => {
  let listener: ((e:HIDInputReportEvent)=>void)|undefined;
  const requests:number[]=[];
  const device={vendorId:0x3554,productId:0xfa09,collections:[{usagePage:0xff02,usage:2,outputReports:[{reportId:19}]}],
    addEventListener(_:string,l:typeof listener){listener=l},removeEventListener(){},
    async sendReport(_:number,data:Uint8Array){
      assert.equal(data[0],0x43);const page=data[3]>>>4;requests.push(page);
      for(let index=36;index>=0;index--){
        const p=wirelessReply(0x43,page,37,index,index===36?8:14);
        listener?.({reportId:19,data:new DataView(p.buffer,1,19)} as HIDInputReportEvent);
      }
    }} as unknown as HIDDevice;
  const t=createTransport(device);
  try {const bank=await t.read('macro',0,4096);assert.equal(bank.length,4096);assert.deepEqual(requests,[0,1,2,3,4,5,6,7]);}
  finally {t.dispose();}
});

test('parseStatusReport reads receiver link / battery reports', async () => {
  const { parseStatusReport } = await import('../src/hid/transport');
  const pkt = (b: number[]) => { const p = new Uint8Array(20); p.set(b); return p; };
  assert.deepEqual(parseStatusReport(pkt([0x13, 0x0a, 1, 0, 4, 2, 0])), { kind: 'link', linked: false });
  assert.deepEqual(parseStatusReport(pkt([0x13, 0x0a, 1, 0, 4, 2, 1])), { kind: 'link', linked: true });
  assert.deepEqual(parseStatusReport(pkt([0x13, 0x0a, 1, 0, 4, 5, 0x5d, 0x10])), { kind: 'battery', battery: { percent: 93, charging: true } });
  assert.equal(parseStatusReport(pkt([0x13, 0x0a, 1, 0, 4, 7, 0])), null);
  assert.equal(parseStatusReport(pkt([0x13, 0x41, 1, 0, 4, 2, 1])), null);
});

test('2.4G reads wait while the keyboard is asleep and resume on wake', async () => {
  let listener: ((event: HIDInputReportEvent) => void) | undefined;
  const led = new Uint8Array(128);
  led[0x7e] = 0x5a; led[0x7f] = 0xa5;
  let linked = false;
  const sent: number[] = [];
  const emit = (bytes: number[]) => {
    const p = new Uint8Array(19); p.set(bytes.slice(1));
    setTimeout(() => listener?.({ reportId: 0x13, data: new DataView(p.buffer) } as unknown as HIDInputReportEvent), 1);
  };
  const device = {
    vendorId: 0x3554, productId: 0xfa09,
    collections: [{ usagePage: 0xff02, usage: 2, outputReports: [{ reportId: 0x13 }] }],
    addEventListener(_: string, l: typeof listener) { listener = l; },
    removeEventListener() { listener = undefined; },
    async sendReport(_id: number, data: BufferSource) {
      const cmd = new Uint8Array(data as ArrayBuffer)[0];
      sent.push(cmd);
      if (cmd === 0x07) return emit([0x13, 0x07, 1, 0, 1, linked ? 1 : 0]);
      if (cmd === 0x44 && linked) {
        const total = Math.ceil(128 / 14);
        for (let i = 0; i < total; i++) {
          const chunk = [...led.slice(i * 14, i * 14 + 14)];
          emit([0x13, 0x44, total, i, chunk.length, ...chunk]);
        }
      }
    },
  } as unknown as HIDDevice;
  const transport = createTransport(device);
  const links: boolean[] = [];
  transport.onStatus = (s) => { if (s.kind === 'link') links.push(s.linked); };
  assert.equal(await transport.linkStatus!(), false);
  let done = false;
  const read = transport.read('ledConfig', 0, 128).then((b) => { done = true; return b; });
  await new Promise((r) => setTimeout(r, 300));
  assert.equal(done, false, 'read must wait, not fail, while asleep');
  assert.ok(!sent.includes(0x44), 'no config read is sent while asleep');
  linked = true;
  emit([0x13, 0x0a, 1, 0, 4, 2, 1]); // receiver: link up
  const bytes = await read;
  assert.equal(bytes[0x7e], 0x5a);
  assert.deepEqual(links, [false, true]);
  transport.dispose();
});
