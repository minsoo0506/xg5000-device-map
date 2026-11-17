import { Inflate } from 'pako';
import { XMLParser, XMLValidator } from 'fast-xml-parser';
import { Buffer } from 'buffer';
import { parseXgkLadder } from './xgk-ladder.js';
globalThis.Buffer ??= Buffer;
const LIMIT=64*1024*1024;
const array=v=>v==null?[]:Array.isArray(v)?v:[v];
export async function readXgwx(input){
 const bytes=new Uint8Array(input);
 if(bytes.length>LIMIT)throw Error('64MB 이하의 프로젝트를 선택하세요.');
 if(bytes[0]!==88||bytes[1]!==71)throw Error('XGWX 파일 헤더가 아닙니다.');
 let offset=-1;for(let i=2;i<Math.min(bytes.length-2,4096);i++)if(bytes[i]===31&&bytes[i+1]===139&&bytes[i+2]===8){offset=i;break;}
 if(offset<0)throw Error('프로젝트 압축 데이터를 찾을 수 없습니다.');
 const compressed=bytes.subarray(offset);
 const flags=compressed[3];let start=10;
 if(flags&224)throw Error('지원하지 않는 gzip 플래그입니다.');
 if(flags&4){start+=2+(compressed[start]|compressed[start+1]<<8);}
 for(const bit of [8,16])if(flags&bit){while(start<compressed.length&&compressed[start++]){} }
 if(flags&2)start+=2;
 let length=0;const chunks=[];const decoder=new Inflate({raw:true});
 decoder.onData=chunk=>{length+=chunk.length;if(length>LIMIT)throw Error('프로젝트 압축 해제 크기가 너무 큽니다.');chunks.push(chunk);};
 decoder.push(compressed.subarray(start),true);
 if(decoder.err||!decoder.ended)throw Error('프로젝트 압축 데이터가 손상됐습니다.');
 const xmlBytes=new Uint8Array(length);let cursor=0;for(const chunk of chunks){xmlBytes.set(chunk,cursor);cursor+=chunk.length;}
 const footer=start+decoder.strm.next_in;
 if(footer+8>compressed.length)throw Error('압축 데이터가 잘렸습니다.');
 const trailer=new DataView(compressed.buffer,compressed.byteOffset+footer,8);
 let crc=0xffffffff;for(const byte of xmlBytes){crc^=byte;for(let bit=0;bit<8;bit++)crc=(crc>>>1)^((crc&1)?0xedb88320:0);}
 if(((crc^0xffffffff)>>>0)!==trailer.getUint32(0,true)||length!==trailer.getUint32(4,true))throw Error('프로젝트 압축 데이터 검증에 실패했습니다.');
 if(xmlBytes.length>LIMIT)throw Error('프로젝트 압축 해제 크기가 너무 큽니다.');
 const xml=new TextDecoder('utf-8',{fatal:true}).decode(xmlBytes);
 if(/<!DOCTYPE|<!ENTITY/i.test(xml))throw Error('지원하지 않는 XML 선언입니다.');
 if(XMLValidator.validate(xml)!==true)throw Error('프로젝트 XML이 손상됐습니다.');
 const root=new XMLParser({ignoreAttributes:false,attributeNamePrefix:'@',parseTagValue:false,trimValues:true}).parse(xml).Project;
 if(!root)throw Error('프로젝트 정보를 찾을 수 없습니다.');
 const {default:Bunzip}=await import('seek-bzip');
 const programs=[],warnings=[];
 for(const cfg of array(root.Configurations?.Configuration))for(const program of array(cfg.POU?.Programs?.Program ?? cfg.Programs?.Program)){
  const record={name:program['#text']||'이름 없음',configuration:cfg['#text']||'',typeCode:cfg['@Type'],task:program['@Task'],networks:[]};
  // ProgramData can be wrapped in an LD container depending on XG5000 version.
  function findData(node){if(!node||typeof node!=='object')return null;if(node.ProgramData)return node.ProgramData;for(const v of Object.values(node)){if(typeof v==='object'){const d=findData(v);if(d)return d;}}return null;}
  const data=findData(program);
  if(program['@Encrytption'])record.error='암호로 보호된 프로그램입니다.';
  else if(!data)record.error='래더 데이터를 찾을 수 없습니다.';
  else if(data['@ProjectType']!=='1')record.error='비 IEC 래더 형식만 분석할 수 있습니다.';
  else try{
   let payload=Buffer.from((data['#text']||'').replace(/\s/g,''),'base64');
   if(data['@Compressed']==='1')payload=Bunzip.decode(payload);
   if(payload.length>LIMIT)throw Error('래더 크기 제한 초과');
   record.networks=parseXgkLadder(payload);
  }catch(e){record.error=e.message;}
  if(record.error)warnings.push(`${record.name}: ${record.error}`);
  programs.push(record);
 }
 if(!programs.length)throw Error('프로젝트에 프로그램이 없습니다.');
 return {name:root['#text']||'XGWX 프로젝트',fileVersion:root['@FileVer'],programs,warnings};
}
