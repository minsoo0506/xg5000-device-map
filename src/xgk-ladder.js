// Non-IEC LD binary records store each position as row * 1024 + column.
export function parseXgkLadder(bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const decoder = new TextDecoder('utf-16le', { fatal: true });
  let pos = 0;

  function number(size) {
    if (pos + size > bytes.length) throw Error(`잘린 래더 데이터 (${pos})`);
    const start = pos;
    pos += size;
    if (size === 1) return view.getUint8(start);
    if (size === 2) return view.getUint16(start, true);
    return view.getUint32(start, true);
  }
  const u8 = () => number(1);
  const u16 = () => number(2);
  const u32 = () => number(4);
  function hasString() {
    return (
      bytes[pos] === 255 && bytes[pos + 1] === 254 && bytes[pos + 2] === 255
    );
  }
  function string() {
    if (!hasString()) throw Error(`문자열 형식 오류 (${pos})`);
    pos += 3;
    let length = u8();
    if (length === 255) length = u16();
    if (pos + length * 2 > bytes.length)
      throw Error(`문자열 길이 오류 (${pos})`);
    const result = decoder.decode(bytes.subarray(pos, pos + length * 2));
    pos += length * 2;
    return result;
  }
  function element() {
    const cls = u8(),
      kind = u32();
    const item = { cls, kind };
    if (cls === 0 && kind === 0) {
      const count = u16();
      for (let i = 0; i < count; i++) {
        u32();
        u16();
        u32();
      }
      return item;
    }
    // Continuation records share a position with the preceding extended element.
    if ((cls >= 1 && cls <= 3) || (cls === 4 && kind === 36)) {
      item.position = u32();
      return item;
    }
    if (cls !== 0 && cls !== 255)
      throw Error(`미지원 요소 ${cls}/${kind} (${pos})`);
    item.position = u32();
    u16();
    u32();
    if (kind === 0x22) {
      item.opcode = u32();
      item.text = string();
      item.operands = [];
      const count = u16();
      for (let i = 0; i < count; i++) {
        u32();
        u16();
        u32();
        item.operands.push(string());
      }
      return item;
    }
    item.strings = [];
    while (hasString()) item.strings.push(string());
    if (kind === 2) item.end = u32();
    if (kind === 0x3f) {
      u32();
      u32();
    }
    return item;
  }
  function readRow() {
    const row = u32();
    const start = pos;
    const cls = u8(),
      kind = u32();
    if (cls !== 255 || kind !== 0x43) {
      throw Error(
        `래더 행 형식 오류 (행 ${row}, 형식 ${cls}/${kind}, 위치 ${start})`,
      );
    }
    for (let i = 0; i < 6; i++) u32();
    const count = u16(),
      elements = [];
    for (let i = 0; i < count; i++) elements.push(element());
    return { row, elements };
  }

  u32();
  const expected = u32() >>> 16;
  const networks = [];
  while (pos < bytes.length && networks.length < expected) {
    const network = { number: u32(), flag: u32(), rows: [] };
    const count = u16();
    try {
      for (let i = 0; i < count; i++) network.rows.push(readRow());
    } catch (cause) {
      // Each network is independent. Only return previously completed networks.
      const error = Error(`네트워크 ${network.number}: ${cause.message}`);
      error.completedNetworks = networks;
      throw error;
    }
    networks.push(network);
  }
  if (pos !== bytes.length || networks.length !== expected)
    throw Error('래더 네트워크 수 불일치');
  return networks;
}
