// XG5000 non-IEC LD binary records. Positions encode row * 1024 + column.
export function parseXgkLadder(bytes) {
 const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);let pos=0;
 function num(n){if(pos+n>bytes.length)throw Error(`잘린 래더 데이터 (${pos})`);const v=n===1?view.getUint8(pos):n===2?view.getUint16(pos,true):view.getUint32(pos,true);pos+=n;return v;}
 const u8=()=>num(1),u16=()=>num(2),u32=()=>num(4);
 function str(){if(u8()!==255||u8()!==254||u8()!==255)throw Error(`문자열 형식 오류 (${pos})`);let n=u8();if(n===255)n=u16();if(n>32768||pos+n*2>bytes.length)throw Error('문자열 길이 오류');const s=new TextDecoder('utf-16le',{fatal:true}).decode(bytes.subarray(pos,pos+n*2));pos+=n*2;return s;}
 function element(){const cls=u8(),kind=u32();const e={cls,kind};
 if(cls===0&&kind===0){const count=u16();for(let i=0;i<count;i++){u32();u16();u32();}return e;}
 if(cls===1||cls===2||cls===3){e.position=u32();return e;}
 if(cls!==0&&cls!==255)throw Error(`미지원 요소 ${cls}/${kind} (${pos})`);
 e.position=u32();u16();u32();
 if(kind===0x22){e.opcode=u32();e.text=str();e.operands=[];const count=u16();for(let i=0;i<count;i++){u32();u16();u32();e.operands.push(str());}return e;}
 e.strings=[];while(bytes[pos]===255&&bytes[pos+1]===254&&bytes[pos+2]===255)e.strings.push(str());
 if(kind===2)e.end=u32();if(kind===0x3f){u32();u32();}return e;
 }
 u32();const header=u32(),networks=[];
 while(pos<bytes.length){const network={number:u32(),flag:u32(),rows:[]};const count=u16();for(let i=0;i<count;i++){const row=u32();if(u8()!==255||u32()!==0x43)throw Error(`래더 행 형식 오류 (${pos})`);for(let j=0;j<6;j++)u32();const n=u16(),elements=[];for(let j=0;j<n;j++)elements.push(element());network.rows.push({row,elements});}networks.push(network);}
 if(header>>>16!==networks.length)throw Error('래더 네트워크 수 불일치');return networks;
}
