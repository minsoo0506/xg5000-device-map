import { decodeBzipLimited } from './bzip-limited.js';
import { Inflate } from 'pako';
import { XMLParser, XMLValidator } from 'fast-xml-parser';
import { Buffer } from 'buffer';
import { readXgkSymbols } from './xgk-symbols.js';
import { parseXgkLadder } from './xgk-ladder.js';
globalThis.Buffer ??= Buffer;
const LIMIT = 64 * 1024 * 1024;
const array = (v) => (v == null ? [] : Array.isArray(v) ? v : [v]);
export async function readXgwx(input) {
  const bytes = new Uint8Array(input);
  if (bytes.length > LIMIT) throw Error('64MB 이하의 프로젝트를 선택하세요.');
  if (bytes[0] !== 88 || bytes[1] !== 71)
    throw Error('XGWX 파일 헤더가 아닙니다.');
  let offset = -1;
  for (let i = 2; i < Math.min(bytes.length - 2, 4096); i++)
    if (bytes[i] === 31 && bytes[i + 1] === 139 && bytes[i + 2] === 8) {
      offset = i;
      break;
    }
  if (offset < 0) throw Error('프로젝트 압축 데이터를 찾을 수 없습니다.');
  const compressed = bytes.subarray(offset);
  const flags = compressed[3];
  let start = 10;
  if (flags & 224) throw Error('지원하지 않는 gzip 플래그입니다.');
  if (flags & 4) {
    start += 2 + (compressed[start] | (compressed[start + 1] << 8));
  }
  for (const bit of [8, 16])
    if (flags & bit) {
      while (start < compressed.length && compressed[start++]) {}
    }
  if (flags & 2) start += 2;
  let length = 0;
  const chunks = [];
  const decoder = new Inflate({ raw: true });
  decoder.onData = (chunk) => {
    length += chunk.length;
    if (length > LIMIT) throw Error('프로젝트 압축 해제 크기가 너무 큽니다.');
    chunks.push(chunk);
  };
  decoder.push(compressed.subarray(start), true);
  if (decoder.err || !decoder.ended)
    throw Error('프로젝트 압축 데이터가 손상됐습니다.');
  const xmlBytes = new Uint8Array(length);
  let cursor = 0;
  for (const chunk of chunks) {
    xmlBytes.set(chunk, cursor);
    cursor += chunk.length;
  }
  const footer = start + decoder.strm.next_in;
  if (footer + 8 > compressed.length) throw Error('압축 데이터가 잘렸습니다.');
  const trailer = new DataView(
    compressed.buffer,
    compressed.byteOffset + footer,
    8,
  );
  let crc = 0xffffffff;
  for (const byte of xmlBytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++)
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  if (
    (crc ^ 0xffffffff) >>> 0 !== trailer.getUint32(0, true) ||
    length !== trailer.getUint32(4, true)
  )
    throw Error('프로젝트 압축 데이터 검증에 실패했습니다.');
  if (xmlBytes.length > LIMIT)
    throw Error('프로젝트 압축 해제 크기가 너무 큽니다.');
  const xml = new TextDecoder('utf-8', { fatal: true }).decode(xmlBytes);
  if (/<!DOCTYPE|<!ENTITY/i.test(xml))
    throw Error('지원하지 않는 XML 선언입니다.');
  if (XMLValidator.validate(xml) !== true)
    throw Error('프로젝트 XML이 손상됐습니다.');
  const root = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '@',
    parseTagValue: false,
    trimValues: true,
  }).parse(xml).Project;
  if (!root) throw Error('프로젝트 정보를 찾을 수 없습니다.');
  const programs = [],
    configurations = [],
    warnings = [];
  function collectSymbols(node) {
    const result = {
      aliases: Object.create(null),
      addressComments: Object.create(null),
      wordComments: Object.create(null),
    };
    function visit(node) {
      if (!node || typeof node !== 'object') return;
      for (const [key, value] of Object.entries(node)) {
        if (key === 'Symbols') {
          for (const table of array(value)) {
            if (!table?.['#text']) continue;
            try {
              let payload = Buffer.from(
                table['#text'].replace(/\s/g, ''),
                'base64',
              );
              if (table['@Compressed'] === '1')
                payload = decodeBzipLimited(payload);
              const symbols = readXgkSymbols(payload);
              for (const field of Object.keys(result))
                Object.assign(result[field], symbols[field]);
              if (symbols.unresolved)
                warnings.push(
                  '이 프로젝트의 일부 변수표 형식은 주소 연결을 아직 해석하지 못했습니다.',
                );
            } catch (error) {
              warnings.push('변수표 해석 실패: ' + error.message);
            }
          }
        } else if (key === 'DirectVarCommentV2' && value?.['#text']) {
          warnings.push(
            'DirectVarCommentV2 형식의 별도 주소 설명표는 아직 해석할 수 없습니다.',
          );
        } else if (
          !['Programs', 'Program', 'Configurations', 'Configuration'].includes(
            key,
          )
        ) {
          visit(value);
        }
      }
    }
    visit(node);
    return result;
  }

  const networks = array(root.NetworkConfiguration?.NetworkList?.Network);
  function moduleInfo(module) {
    return {
      name:
        module['@Alias'] ||
        module['@Name']?.replace(/@0x[0-9a-f]+$/i, '') ||
        '',
      base: module['@Base'],
      slot: module['@Slot'],
      typeCode: module['@Id'],
    };
  }
  for (const [configurationId, cfg] of array(
    root.Configurations?.Configuration,
  ).entries()) {
    const name = cfg['#text'] || '';
    const parameters = array(cfg.Parameters?.Parameter);
    const ioModules = parameters
      .filter((p) => p['@Type'] === 'IO PARAMETER')
      .flatMap((p) => array(p.Module))
      .map(moduleInfo);
    const networkModules = networks.flatMap((network) =>
      array(network.NetworkModule)
        .filter((module) => module['@ConfigName'] === name)
        .map((module) => ({
          ...moduleInfo(module),
          network: network['@Name'] || '',
        })),
    );
    configurations.push({
      id: configurationId,
      name,
      typeCode: cfg['@Type'],
      ioModules,
      networkModules,
    });
    const globalSymbols = collectSymbols(cfg);
    for (const program of array(
      cfg.POU?.Programs?.Program ?? cfg.Programs?.Program,
    )) {
      const local = collectSymbols(program);
      const record = {
        name: program['#text'] || '이름 없음',
        configuration: name,
        configurationId,
        typeCode: cfg['@Type'],
        task: program['@Task'],
        networks: [],
      };
      for (const key of Object.keys(globalSymbols)) {
        record[key] = Object.assign(
          Object.create(null),
          globalSymbols[key],
          local[key],
        );
      }
      // ProgramData may be nested in an LD routine container.
      function findData(node) {
        if (!node || typeof node !== 'object') return null;
        if (node.ProgramData) return node.ProgramData;
        for (const value of Object.values(node)) {
          const data = findData(value);
          if (data) return data;
        }
        return null;
      }
      const data = findData(program);
      if (program['@Encrytption'])
        record.error = '암호로 보호된 프로그램입니다.';
      else if (!data) record.error = '래더 데이터를 찾을 수 없습니다.';
      else if (data['@ProjectType'] !== '1')
        record.error = '비 IEC 래더 형식만 분석할 수 있습니다.';
      else {
        try {
          let payload = Buffer.from(
            (data['#text'] || '').replace(/\s/g, ''),
            'base64',
          );
          if (data['@Compressed'] === '1') payload = decodeBzipLimited(payload);
          if (payload.length > LIMIT) throw Error('래더 크기 제한 초과');
          record.networks = parseXgkLadder(payload);
        } catch (error) {
          record.networks = error.completedNetworks || [];
          record.error = error.message;
          if (record.networks.length)
            record.error += ` · 앞선 네트워크 ${record.networks.length}개 표시`;
        }
      }
      if (record.error) warnings.push(`${record.name}: ${record.error}`);
      programs.push(record);
    }
  }
  if (!programs.length) throw Error('프로젝트에 프로그램이 없습니다.');
  return {
    name: root['#text'] || 'XGWX 프로젝트',
    fileVersion: root['@FileVer'],
    configurations,
    programs,
    warnings,
  };
}
