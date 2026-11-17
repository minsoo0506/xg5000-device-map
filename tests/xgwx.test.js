import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {readXgwx} from '../src/xgwx.js';
const fixture=readFileSync(new URL('./fixtures/xgb-xbch.xgwx',import.meta.url));
test('opens a real XGB project with trailing metadata and decodes its network',async()=>{
 const project=await readXgwx(fixture);
 assert.equal(project.name,'2023-09-05 #1');assert.equal(project.programs.length,1);assert.deepEqual(project.warnings,[]);assert.equal(project.programs[0].aliases.PB1.address,'P00000');assert.equal(project.programs[0].aliases.PL1.address,'P00020');assert.equal(project.programs[0].networks.length,1);
 const elements=project.programs[0].networks[0].rows.flatMap(r=>r.elements);
 assert.ok(elements.some(e=>e.strings?.includes('M00000')));
});
test('rejects non-XGWX data',async()=>{await assert.rejects(readXgwx(new Uint8Array([1,2,3])),/헤더/);});
test('rejects a truncated project',async()=>{await assert.rejects(readXgwx(fixture.subarray(0,200)));});

import {projectGraph} from '../src/xgwx-graph.js';
test('maps input contacts and output coils to directed network references',()=>{
 const p=projectGraph({name:'test',warnings:[],programs:[{name:'MAIN',networks:[{number:3,rows:[{elements:[{kind:6,strings:['P00000']},{kind:14,strings:['M00000']}]}]}]}]});
 assert.deepEqual(p.rungs[0].reads,['P00000']);assert.deepEqual(p.rungs[0].writes,[{address:'M00000',instruction:'OUT'}]);assert.equal(p.rungs[0].program,'MAIN');
});
test('unknown instructions produce warnings without fabricated write edges',()=>{
 const p=projectGraph({name:'test',warnings:[],programs:[{name:'MAIN',networks:[{number:0,rows:[{elements:[{kind:34,operands:['UNKNOWN','M00000'],text:'UNKNOWN,M00000'}]}]}]}]});assert.equal(p.rungs.length,0);assert.match(p.warnings[0],/UNKNOWN/);
});

import {readXgkSymbols} from '../src/xgk-symbols.js';
test('resolves GL50 alias to its explicit address',()=>{
 const string=s=>Buffer.concat([Buffer.from([255,254,255,s.length]),Buffer.from(s,'utf16le')]);
 const table=Buffer.concat(['GL50','시작','P00000','기동 버튼',''].map(string));
 const result=readXgkSymbols(table);assert.deepEqual(result.aliases['시작'],{address:'P00000',comment:'기동 버튼'});
 const graph=projectGraph({name:'alias',warnings:[],aliases:result.aliases,programs:[{name:'MAIN',networks:[{number:0,rows:[{elements:[{kind:6,strings:['시작']},{kind:14,strings:['M00000']}]}]}]}]});assert.deepEqual(graph.rungs[0].reads,['P00000']);assert.match(graph.devices[0].comment,/시작/);
});

test('program local aliases do not overwrite each other',()=>{
 const network=address=>[{number:0,rows:[{elements:[{kind:6,strings:['ready']},{kind:14,strings:[address]}]}]}];
 const p=projectGraph({name:'scopes',warnings:[],programs:[{name:'A',aliases:{ready:{address:'M00000'}},networks:network('P00020')},{name:'B',aliases:{ready:{address:'M00001'}},networks:network('P00021')}]});
 assert.deepEqual(p.rungs.map(r=>r.reads),[['M00000'],['M00001']]);
});

test('increment reads and writes its operand; END adds no warning',()=>{
 const p=projectGraph({name:'commands',warnings:[],programs:[{name:'MAIN',networks:[{number:0,rows:[{elements:[{kind:34,operands:['INC','D00000'],text:'INC,D00000'},{kind:34,operands:['END'],text:'END'}]}]}]}]});
 assert.deepEqual(p.rungs[0].reads,['D00000']);assert.deepEqual(p.rungs[0].writes,[{address:'D00000',instruction:'INC'}]);assert.deepEqual(p.warnings,[]);
});
test('word OR maps both inputs to the destination',()=>{
 const p=projectGraph({name:'commands',warnings:[],programs:[{name:'MAIN',networks:[{number:0,rows:[{elements:[{kind:34,operands:['WOR','D00000','D00001','D00002'],text:'WOR,D00000,D00001,D00002'}]}]}]}]});assert.deepEqual(p.rungs[0].reads,['D00000','D00001']);assert.equal(p.rungs[0].writes[0].address,'D00002');
});

test('identical addresses in different PLC configurations stay separate',()=>{
 const program=configuration=>({name:'MAIN',configuration,networks:[{number:0,rows:[{elements:[{kind:6,strings:['M00000']},{kind:14,strings:['P00020']}]}]}]});
 const p=projectGraph({name:'multi',warnings:[],programs:[program('PLC1'),program('PLC2')]});
 assert.equal(p.devices.length,4);assert.notEqual(p.rungs[0].reads[0],p.rungs[1].reads[0]);
});

test('canonical device addresses join equivalent spellings across programs',()=>{
 const network=(kind,address)=>[{number:0,rows:[{elements:[{kind,strings:[address]}]}]}];
 const p=projectGraph({name:'case',warnings:[],programs:[{name:'A',networks:network(14,'m0000')},{name:'B',networks:network(6,'M00000')}]});
 assert.equal(p.devices.length,1);assert.equal(p.rungs[0].writes[0].address,p.rungs[1].reads[0]);
});
test('later aliases remain searchable when raw address was encountered first',()=>{
 const network=address=>[{number:0,rows:[{elements:[{kind:6,strings:[address]}]}]}];
 const p=projectGraph({name:'metadata',warnings:[],programs:[{name:'A',networks:network('M00000')},{name:'B',aliases:{ready:{address:'M00000',comment:'motor ready'}},networks:network('ready')}]});
 assert.match(p.devices[0].comment,/ready/);assert.match(p.devices[0].comment,/motor ready/);
});

import {decodeBzipLimited} from '../src/bzip-limited.js';
test('bzip output stops at the configured limit before returning oversized data',()=>{
 const input=Buffer.from('QlpoOTFBWSZTWVHU9lAAAARBAMAAIAAACCAAMMwFU2piKDxdyRThQkFHU9lA','base64');
 assert.throws(()=>decodeBzipLimited(input,16),/크기 제한/);
});

test('bzip output is exact at the limit',()=>{
 const input=Buffer.from('QlpoOTFBWSZTWVHU9lAAAARBAMAAIAAACCAAMMwFU2piKDxdyRThQkFHU9lA','base64');
 assert.deepEqual(decodeBzipLimited(input,1024),new Uint8Array(1024).fill(97));
});

test('DMOV connects a later reader of its second destination word',()=>{
 const network=(operands)=>[{number:0,rows:[{elements:[{kind:34,operands,text:operands.join(',')}]}]}];
 const p=projectGraph({name:'double',warnings:[],programs:[{name:'A',networks:network(['DMOV','D00000','D00010'])},{name:'B',networks:network(['MOV','D00011','D00020'])}]});
 assert.deepEqual(p.rungs[0].reads,['D00000','D00001']);assert.deepEqual(p.rungs[0].writes.map(w=>w.address),['D00010','D00011']);assert.equal(p.rungs[1].reads[0],'D00011');
});
test('MUL and DIV expose both result words including the remainder',()=>{
 for(const op of ['MUL','DIV']){
 const p=projectGraph({name:op,warnings:[],programs:[{name:'MAIN',networks:[{number:0,rows:[{elements:[{kind:34,operands:[op,'D00000','D00001','D00010'],text:op}]}]}]}]});
 assert.deepEqual(p.rungs[0].writes.map(w=>w.address),['D00010','D00011']);
 }
});
