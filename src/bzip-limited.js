import {Buffer} from 'buffer';
import Bunzip from 'seek-bzip';
globalThis.Buffer ??= Buffer;

export function decodeBzipLimited(input,limit=64*1024*1024) {
 if(!Number.isSafeInteger(limit)||limit<0)throw Error('잘못된 압축 크기 제한입니다.');
 const chunks=[];let size=0,chunk;
 Bunzip.decode(input,{
  writeByte(byte){
   if(size>=limit)throw Error('래더/변수표 압축 해제 크기 제한을 초과했습니다.');
   if(size%65536===0){chunk=new Uint8Array(Math.min(65536,limit-size));chunks.push(chunk);}
   chunk[size%65536]=byte;size++;
  }
 });
 const output=new Uint8Array(size);let position=0;
 for(const part of chunks){output.set(part.subarray(0,Math.min(part.length,size-position)),position);position+=part.length;}
 return output;
}
