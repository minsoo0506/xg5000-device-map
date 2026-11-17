import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {readXgwx} from '../src/xgwx.js';
const fixture=readFileSync(new URL('./fixtures/xgb-xbch.xgwx',import.meta.url));
test('opens a real XGB project with trailing metadata and decodes its network',async()=>{
 const project=await readXgwx(fixture);
 assert.equal(project.name,'2023-09-05 #1');assert.equal(project.programs.length,1);assert.deepEqual(project.warnings,[]);assert.equal(project.programs[0].networks.length,1);
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
