import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateProject, neighborhood, searchDevices } from '../src/graph.js';
const project = { devices:[{address:'P000',comment:'시작'}, {address:'M100',comment:'운전'}, {address:'P020',comment:'모터'}], rungs:[{id:'a',program:'MAIN',location:'10',reads:['P000'],writes:[{address:'M100',instruction:'OUT'}]}, {id:'b',program:'SUB',location:'20',reads:['M100'],writes:[{address:'P020',instruction:'OUT'}]}] };
test('checks malformed project before replacing current data', () => { assert.throws(() => validateProject({devices:[],rungs:[{id:'a'}]})); });
test('finds upstream and downstream at one depth without inventing direct device links', () => { const graph=neighborhood(validateProject(project),'M100',1); assert.deepEqual(new Set(graph.devices),new Set(['P000','M100','P020'])); assert.deepEqual(new Set(graph.rungs),new Set(['a','b'])); });
test('searches addresses and comments case insensitively', () => { assert.deepEqual(searchDevices(project,'m10').map(d=>d.address),['M100']); assert.equal(searchDevices(project,'모터')[0].address,'P020'); });
test('rejects references to undefined devices', () => { assert.throws(()=>validateProject({...project,rungs:[{...project.rungs[0],reads:['MISSING']}]}),/MISSING/); });
