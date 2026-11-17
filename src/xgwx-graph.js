import {canonicalAddress} from './device-address.js';
// Networks group references; edges describe shared ladder networks, not Boolean causality.
export function projectGraph(document) {
 const devices=new Map(),rungs=[],warnings=[...document.warnings];
 const configurations=new Set(document.programs.map(p=>p.configurationId??p.configuration??''));
 const add=(value,program)=>{const name=value?.trim();const symbol=program.aliases?.[name]||document.aliases?.[name];const rawAddress=canonicalAddress(symbol?.address||name||'');const address=configurations.size>1?`${program.configuration||'PLC'}[${program.configurationId??program.configuration}] / ${rawAddress}`:rawAddress;if(!rawAddress||/^(?:[+-]?\d+(?:\.\d+)?|H[0-9A-F]+|[KHL]#[0-9A-F]+)$/i.test(rawAddress))return null;const metadata=[name!==rawAddress?name:'',symbol?.comment].filter(Boolean);const existing=devices.get(address);if(!existing)devices.set(address,{address,comment:metadata.join(' · ')});else existing.comment=[...new Set([...existing.comment.split(' · ').filter(Boolean),...metadata])].join(' · ');return address;};
 for(const [pi,program] of document.programs.entries())for(const [ni,network] of program.networks.entries()){
  const reads=new Set(),writes=[],source=[];
  function read(v){const a=add(v,program);if(a)reads.add(a);}
  function write(v,instruction){const a=add(v,program);if(a&&!writes.some(w=>w.address===a&&w.instruction===instruction))writes.push({address:a,instruction});}
  function range(v,count,consume){
   if(count===1){consume(v);return;}
   const symbol=program.aliases?.[v]||document.aliases?.[v];
   const raw=canonicalAddress(symbol?.address||v||'');
   if(/^(?:[+-]?\d+(?:\.\d+)?|[Hh][0-9A-Fa-f]+|[KHL]#[0-9A-F]+)$/.test(raw))return;
   const word=/^([DR])(\d+)$/.exec(raw);
   consume(v);
   if(word){for(let i=1;i<count;i++)consume(word[1]+String(Number(word[2])+i).padStart(5,'0'));}
   else warnings.push(`${program.name} 네트워크 ${network.number}: ${v}의 ${count}워드 범위를 완전히 해석하지 못했습니다.`);
  }
  for(const row of network.rows)for(const e of row.elements){
   if([6,7,8].includes(e.kind)&&e.strings?.length){read(e.strings[0]);source.push(`${e.kind===7?'NC':'접점'} ${e.strings[0]}`);}
   else if([14,16,17].includes(e.kind)&&e.strings?.length){const op={14:'OUT',16:'SET',17:'RST'}[e.kind];write(e.strings[0],op);source.push(`${op} ${e.strings[0]}`);}
   else if(e.kind===34){const [op,...args]=e.operands;source.push(e.text);
    if(/^(?:=|<>|>=|<=|>|<|AND|OR|XOR)$/.test(op))args.forEach(read);
    else if(/^(?:MOV|DMOV|ADD|SUB|MUL|DIV|DADD|DSUB|ANDW|ORW|XORW|WAND|WOR|WXOR)$/.test(op)){
     const width=/^(?:DMOV|DADD|DSUB)$/.test(op)?2:1;
     args.slice(0,-1).forEach(a=>range(a,width,read));
     range(args.at(-1),/^(?:MUL|DIV)$/.test(op)?2:width,a=>write(a,op));
    }
    else if(/^(?:INC|DEC|DINC|DDEC)$/.test(op)){const width=op.startsWith('D')?2:1;args.forEach(a=>{range(a,width,read);range(a,width,v=>write(v,op));});}
    else if(/^(?:END|NOP)$/.test(op)){}
    else if(/^(?:TON|TOF|TMR|CTU|CTD|CTUD)$/.test(op)){write(args[0],op);args.slice(1).forEach(read);}
    else warnings.push(`${program.name} 네트워크 ${network.number}: 미해석 명령 ${op}`);
   }else if(![0,1,2,35,36,63].includes(e.kind))warnings.push(`${program.name} 네트워크 ${network.number}: 미해석 요소 ${e.kind}`);
  }
  if(reads.size||writes.length)rungs.push({id:`p${pi}-n${ni}`,program:program.name,location:`네트워크 ${network.number}`,reads:[...reads],writes,note:'같은 네트워크의 참조 관계입니다. '+source.join(' · ')});
 }
 return {name:document.name,devices:[...devices.values()],rungs,warnings:[...new Set(warnings)],programs:document.programs.map(p=>({name:p.name,typeCode:p.typeCode,error:p.error,networks:p.networks.length}))};
}
