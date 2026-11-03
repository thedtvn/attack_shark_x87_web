import {test} from 'node:test';
import {strict as assert} from 'node:assert';
import {encodeMacro,decodeMacro,encodeMacroBank,decodeMacroBank,encodeMacroBinding, type MacroDefinition} from '../src/hid/macros';
import {encodeAction,decodeAction} from '../src/hid/protocol';
import {createTransport} from '../src/hid/transport';
import {X87} from '../src/hid/keyboard';
const macro: MacroDefinition={name:'A',events:[{type:'key',value:4,down:true,delayMs:0},{type:'key',value:4,down:false,delayMs:50}]};
test('macro golden record mirrors decompiled encoder',()=>{
 const expected=[2,65,0,128,0,0,4,0,0,50,4];
 assert.deepEqual([...encodeMacro(macro)],expected);
 assert.deepEqual(decodeMacro(Uint8Array.from(expected)),macro);
});
test('two macro directory offsets and roundtrip',()=>{
 const b=encodeMacroBank([macro,macro]);
 assert.equal(b.length,4096);assert.deepEqual([...b.subarray(0,8)],[8,0,11,0,19,0,11,0]);
 assert.deepEqual(decodeMacroBank(b),[macro,macro]);
 assert.deepEqual(decodeMacroBank(new Uint8Array(4096)),[]);
});
test('macro limits and malformed directory rejected',()=>{
 assert.throws(()=>encodeMacro({...macro,name:'a'.repeat(31)}));
 assert.throws(()=>encodeMacro({...macro,events:[{...macro.events[0],delayMs:0x100000}]}));
 assert.throws(()=>encodeMacro({...macro,events:[{...macro.events[0],value:NaN}]}));
 assert.throws(()=>encodeMacro({...macro,name:'\ud800'}));
 assert.throws(()=>encodeMacroBank(Array.from({length:33},()=>macro)));
 const b=encodeMacroBank([macro]);b[0]=3;assert.throws(()=>decodeMacroBank(b));
});
test('macro signed movement, modifiers and max20bit delay',()=>{
 const m:MacroDefinition={name:'Move',events:[{type:'moveX',value:-4,down:false,delayMs:0xabcde},{type:'key',value:0xe0,down:true,delayMs:0xfffff}]};
 assert.deepEqual(decodeMacro(encodeMacro(m)),m);
 const b=encodeMacro(m);assert.deepEqual([...b.subarray(9,13)],[0x3a,0xbc,0xde,0xfc]);
});
test('macro binding modes and count; unknown mapping roundtrips raw',()=>{
 assert.deepEqual([...encodeMacroBinding(2,{mode:'times',count:7})],[3,1,7,2]);
 assert.deepEqual([...encodeMacroBinding(2,{mode:'untilReleased'})],[3,4,1,2]);
 assert.deepEqual([...encodeMacroBinding(2,{mode:'untilAnyKey'})],[3,2,1,2]);
 assert.throws(()=>encodeMacroBinding(2,{mode:'times',count:0}));
 const a={kind:'macro' as const,slot:2,repeat:{mode:'times' as const,count:7}};
 assert.deepEqual(decodeAction(encodeAction(a)),a);
 assert.equal(decodeAction(Uint8Array.of(3,8,1,2)).kind,'raw');
});

test('wireless macro upload uses eight512-byte pages; chunk indices reset',async()=>{
 let listener:((e:HIDInputReportEvent)=>void)|undefined;
 const packets:Uint8Array[]=[];
 const device={vendorId:0x3554,productId:0xfa09,
  collections:[{usagePage:0xff02,usage:2,outputReports:[{reportId:0x13}]}],
  addEventListener(_:string,l:typeof listener){listener=l}, removeEventListener(){listener=undefined},
  async sendReport(id:number,data:Uint8Array){
   const p=Uint8Array.of(id,...data);packets.push(p);
   const ack=Uint8Array.of(3,p[2],p[3],0,...new Array(15).fill(0));
   listener?.({reportId:0x13,data:new DataView(ack.buffer)} as HIDInputReportEvent);
  }
 } as unknown as HIDDevice;
 const t=createTransport(device);
 try {
  await t.writeMacroBank(encodeMacroBank([macro]));
  assert.equal(packets.length,8*37);
  for(let page=0;page<8;page++){
   const ps=packets.slice(page*37,(page+1)*37);
   assert.deepEqual(ps.map(p=>p[3]),Array.from({length:37},(_,i)=>i));
   assert.ok(ps.every(p=>p[1]===3&&p[2]===37&&(p[4]>>>4)===page));
   assert.equal(ps.reduce((n,p)=>n+(p[4]&15),0),512);
   assert.equal(ps[36][4]&15,8);
  }
 } finally{t.dispose()}
});

