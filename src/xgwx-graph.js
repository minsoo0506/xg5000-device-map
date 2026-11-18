import { canonicalAddress } from './device-address.js';
import {
  controlInstructions,
  instructionReferences,
  isLiteral,
} from './xgk-instructions.js';

const contacts = new Map([
  [6, '접점'],
  [7, 'NC'],
  [8, '접점'],
]);
const coils = new Map([
  [14, 'OUT'],
  [16, 'SET'],
  [17, 'RST'],
]);
const layoutElements = new Set([0, 1, 2, 35, 36, 63]);

function relayBit(area, word, bit) {
  return (
    area.toUpperCase() +
    String(word).padStart(4, '0') +
    bit.toString(16).toUpperCase()
  );
}

function symbolsFor(program, document) {
  const aliases = new Map(
    Object.entries({ ...document.aliases, ...program.aliases }),
  );
  const metadata = new Map();
  function describe(address, ...labels) {
    const key = canonicalAddress(address);
    if (!metadata.has(key)) metadata.set(key, new Set());
    for (const label of labels)
      if (label && label !== key) metadata.get(key).add(label);
  }
  function describeWord(address, ...labels) {
    const match = /^([PMLKF])(\d+)$/i.exec(address);
    if (!match) return describe(address, ...labels);
    for (let bit = 0; bit < 16; bit++)
      describe(relayBit(match[1], Number(match[2]), bit), ...labels);
  }
  for (const [name, symbol] of aliases) {
    if (!symbol.address) continue;
    if (symbol.access === 'word')
      describeWord(symbol.address, name, symbol.comment);
    else describe(symbol.address, name, symbol.comment);
  }
  for (const [address, comment] of Object.entries(
    program.addressComments ?? {},
  ))
    describe(address, comment);
  for (const [address, comment] of Object.entries(program.wordComments ?? {}))
    describeWord(address, comment);
  return { aliases, metadata };
}

function collectNetwork(network, program, add, aliases, warn) {
  const reads = new Set();
  const writes = new Map();
  const source = [];

  let hasControlFlow = false;

  function references(value, words, consume, start = 0) {
    if (!value) return;
    const symbol = aliases.get(value);
    const raw = (symbol?.address || value).trim();
    if (isLiteral(raw)) return;
    const wordArea = /^([PMLKF])(\d+)$/i.exec(raw);
    if (words && wordArea) {
      // Word operands in relay areas use a decimal word index; contacts append a hex bit.
      for (let offset = start; offset < start + words; offset++) {
        const word = Number(wordArea[2]) + offset;
        for (let bit = 0; bit < 16; bit++)
          consume(add(relayBit(wordArea[1], word, bit)));
      }
      return;
    }
    const address = canonicalAddress(raw);
    if (start === 0) consume(add(address));
    if (start === 0 && (!words || words === 1)) return;
    const match = /^([DRTCZN])(\d+)$/.exec(address);
    if (!match)
      return warn(`${value}의 ${words}워드 범위를 완전히 해석하지 못했습니다.`);
    for (let i = Math.max(1, start); i < start + words; i++)
      consume(add(match[1] + String(Number(match[2]) + i).padStart(5, '0')));
  }

  const read = (value, words) =>
    references(value, words, (address) => reads.add(address));
  const write = (value, instruction, words, start) =>
    references(
      value,
      words,
      (address) => {
        if (!writes.has(instruction)) writes.set(instruction, new Set());
        writes.get(instruction).add(address);
      },
      start,
    );

  for (const row of network.rows) {
    for (const element of row.elements) {
      const value = element.strings?.[0];
      if (contacts.has(element.kind) && value) {
        read(value);
        source.push(`${contacts.get(element.kind)} ${value}`);
      } else if (coils.has(element.kind) && value) {
        const op = coils.get(element.kind);
        write(value, op);
        source.push(`${op} ${value}`);
      } else if (element.kind === 34) {
        instructionReferences(element.operands, { read, write, warn });
        source.push(element.text);
        hasControlFlow ||= controlInstructions.has(element.operands[0]);
      } else if (element.kind === 65 && value) {
        source.push(`LABEL ${value}`);
      } else if (element.kind === 62 && element.cls === 255 && !value) {
        // Position-only record on the project title row.
        continue;
      } else if (!layoutElements.has(element.kind)) {
        warn(`미해석 요소 ${element.kind}`);
      }
    }
  }
  if (!reads.size && !writes.size) return null;
  return {
    program: program.name,
    location: `네트워크 ${network.number}`,
    reads: [...reads],
    writes: Array.from(writes, ([instruction, addresses]) =>
      Array.from(addresses, (address) => ({ address, instruction })),
    ).flat(),
    note:
      '같은 네트워크의 참조 관계입니다. ' +
      source.join(' · ') +
      (hasControlFlow ? ' (점프·호출의 실행 경로는 추적하지 않습니다.)' : ''),
  };
}

// Rungs group references by network, without implying Boolean causality.
export function projectGraph(document) {
  const devices = new Map();
  const rungs = [];
  const warnings = new Set(document.warnings);
  const configurationIds = new Set(
    document.programs.map((p) => p.configurationId ?? p.configuration),
  );
  const scopeAddresses =
    (document.configurations?.length ?? configurationIds.size) > 1;
  const programs = document.programs.map((program, programId) => {
    const { aliases, metadata } = symbolsFor(program, document);
    function add(raw) {
      const address = scopeAddresses
        ? `${program.configuration || 'PLC'}[${program.configurationId ?? program.configuration}] / ${raw}`
        : raw;
      if (!devices.has(address)) devices.set(address, new Set());
      for (const label of metadata.get(raw) ?? [])
        devices.get(address).add(label);
      return address;
    }
    for (const [index, network] of program.networks.entries()) {
      const warn = (message) =>
        warnings.add(`${program.name} 네트워크 ${network.number}: ${message}`);
      const rung = collectNetwork(network, program, add, aliases, warn);
      if (rung)
        rungs.push({
          ...rung,
          id: `p${programId}-n${index}`,
          programId,
          configurationId: program.configurationId,
        });
    }
    return {
      programId,
      configurationId: program.configurationId,
      name: program.name,
      typeCode: program.typeCode,
      error: program.error,
      networks: program.networks.length,
    };
  });
  return {
    name: document.name,
    configurations: document.configurations ?? [],
    programs,
    rungs,
    devices: Array.from(devices, ([address, labels]) => ({
      address,
      comment: [...labels].join(' · '),
    })),
    warnings: [...warnings],
  };
}
