// Networks group references; edges describe shared ladder networks, not Boolean causality.
export function projectGraph(document) {
 const devices=new Map(),rungs=[],warnings=[...document.warnings];
 const add=value=>{const address=value?.trim();if(!address||/^(?:[+-]?\d+(?:\.\d+)?|[KHL]#[0-9A-F]+)$/i.test(address))return null;if(!devices.has(address))devices.set(address,{address,comment:''});return address;};
 for(const [pi,program] of document.programs.entries())for(const [ni,network] of program.networks.entries()){
  const reads=new Set(),writes=[],source=[];
  function read(v){const a=add(v);if(a)reads.add(a);}
  function write(v,instruction){const a=add(v);if(a&&!writes.some(w=>w.address===a&&w.instruction===instruction))writes.push({address:a,instruction});}
  for(const row of network.rows)for(const e of row.elements){
   if([6,7,8].includes(e.kind)&&e.strings?.length){read(e.strings[0]);source.push(`${e.kind===7?'NC':'접점'} ${e.strings[0]}`);}
   else if([14,16,17].includes(e.kind)&&e.strings?.length){const op={14:'OUT',16:'SET',17:'RST'}[e.kind];write(e.strings[0],op);source.push(`${op} ${e.strings[0]}`);}
   else if(e.kind===34){const [op,...args]=e.operands;source.push(e.text);
    if(/^(?:=|<>|>=|<=|>|<|AND|OR|XOR)$/.test(op))args.forEach(read);
    else if(/^(?:MOV|DMOV|ADD|SUB|MUL|DIV|DADD|DSUB|ANDW|ORW|XORW)$/.test(op)){args.slice(0,-1).forEach(read);write(args.at(-1),op);}
    else if(/^(?:TON|TOF|TMR|CTU|CTD|CTUD)$/.test(op)){write(args[0],op);args.slice(1).forEach(read);}
    else warnings.push(`${program.name} 네트워크 ${network.number}: 미해석 명령 ${op}`);
   }else if(![0,1,2,35,36,63].includes(e.kind))warnings.push(`${program.name} 네트워크 ${network.number}: 미해석 요소 ${e.kind}`);
  }
  if(reads.size||writes.length)rungs.push({id:`p${pi}-n${ni}`,program:program.name,location:`네트워크 ${network.number}`,reads:[...reads],writes,note:'같은 네트워크의 참조 관계입니다. '+source.join(' · ')});
 }
 return {name:document.name,devices:[...devices.values()],rungs,warnings:[...new Set(warnings)],programs:document.programs.map(p=>({name:p.name,typeCode:p.typeCode,error:p.error,networks:p.networks.length}))};
}
