import {readFileSync,readdirSync} from 'node:fs';
import {parseXgkLadder} from '../src/xgk-ladder.js';
const directory=process.argv[2];if(!directory)throw Error('Pass an extracted program directory');
let failures=0;for(const file of readdirSync(directory).filter(x=>x.endsWith('.bin'))){try{const networks=parseXgkLadder(readFileSync(`${directory}/${file}`));console.log(`${file}: ${networks.length} networks`);}catch(e){console.error(`${file}: ${e.message}`);failures++;}}process.exitCode=failures?1:0;
