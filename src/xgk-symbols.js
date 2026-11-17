// GL50 stores variable name followed by its explicit textual device address.
// SV5.0 bit symbols store their area and numeric bit offset. Other forms remain unresolved.
export function readXgkSymbols(bytes){
 const strings=[],ends=[];let i=0;
 while(i+4<=bytes.length){if(bytes[i]!==255||bytes[i+1]!==254||bytes[i+2]!==255){i++;continue;}let p=i+3,n=bytes[p++];if(n===255){if(p+2>bytes.length)break;n=bytes[p]|bytes[p+1]<<8;p+=2;}if(p+n*2>bytes.length)throw Error('변수표 문자열이 잘렸습니다.');strings.push(new TextDecoder('utf-16le',{fatal:true}).decode(bytes.subarray(p,p+n*2)));i=p+n*2;ends.push(i);}
 const aliases={};let unresolved=false;
 for(let j=0;j<strings.length;j++){
  if(strings[j]==='GL50'){const name=strings[j+1],address=strings[j+2];if(name&&/^[PMLKFTCDRSZUN][0-9A-F]+(?:\.[0-9A-F]+)?$/i.test(address||''))aliases[name]={address,comment:strings[j+3]||''};}
  else if(strings[j]==='SV5.0'){
   const name=strings[j+1],area=strings[j+2],type=strings[j+3],offset=ends[j+2];
   if(name&&/^[PMLKF]$/.test(area||'')&&type==='BIT'&&offset+4<=bytes.length){
    const bit=new DataView(bytes.buffer,bytes.byteOffset+offset,4).getUint32(0,true);
    const address=area+String(Math.floor(bit/16)).padStart(4,'0')+(bit%16).toString(16).toUpperCase();
    aliases[name]={address,comment:''};
   }else unresolved=true;
  }else if(/^SV\d/.test(strings[j]))unresolved=true;
 }
 return {aliases,unresolved};
}
