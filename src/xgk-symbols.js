import { canonicalAddress } from './device-address.js';

const decoder = new TextDecoder('utf-16le', { fatal: true });
const bitAreas = /^[PMLKF]$/;

function symbolStrings(bytes) {
  const strings = [];
  for (let i = 0; i + 4 <= bytes.length; ) {
    if (bytes[i] !== 255 || bytes[i + 1] !== 254 || bytes[i + 2] !== 255) {
      i++;
      continue;
    }
    i += 3;
    let length = bytes[i++];
    if (length === 255) {
      if (i + 2 > bytes.length) throw Error('변수표 문자열 길이가 잘렸습니다.');
      length = bytes[i] | (bytes[i + 1] << 8);
      i += 2;
    }
    const end = i + 2 * length;
    if (end > bytes.length) throw Error('변수표 문자열이 잘렸습니다.');
    strings.push({ value: decoder.decode(bytes.subarray(i, end)), end });
    i = end;
  }
  return strings;
}

function deviceAt(area, type, offset) {
  if (bitAreas.test(area)) {
    if (type === 'WORD')
      return {
        address: area + String(offset).padStart(3, '0'),
        access: 'word',
      };
    if (type === 'BIT') {
      const word = String(Math.floor(offset / 16)).padStart(4, '0');
      return {
        address: area + word + (offset % 16).toString(16).toUpperCase(),
      };
    }
  }
  if (
    (/^[DRZ]$/.test(area) && type === 'WORD') ||
    (/^[TC]$/.test(area) && ['BIT/WORD', 'BIT', 'WORD'].includes(type))
  ) {
    return { address: area + String(offset).padStart(5, '0') };
  }
  return null;
}

export function readXgkSymbols(bytes) {
  const strings = symbolStrings(bytes);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const aliases = Object.create(null);
  const addressComments = Object.create(null);
  const wordComments = Object.create(null);
  let unresolved = false;
  for (let i = 0; i < strings.length; i++) {
    const version = strings[i].value;
    const name = strings[i + 1]?.value;
    let device, comment;
    if (version === 'GL50') {
      const address = strings[i + 2]?.value || '';
      if (!/^[PMLKFTCDRSZUN][0-9A-F]+(?:\.[0-9A-F]+)*$/i.test(address))
        continue;
      device = { address };
      // GL50 keeps an optional initial value between the address and description.
      const hasArea = /^[PMLKFTCDRSZUN]$/i.test(strings[i + 5]?.value || '');
      comment = (hasArea ? strings[i + 4]?.value : strings[i + 3]?.value) || '';
    } else if (version === 'SV5.0') {
      const area = strings[i + 2];
      if (!area || area.end + 4 > bytes.length)
        throw Error('변수표 주소가 잘렸습니다.');
      device = deviceAt(
        area.value,
        strings[i + 3]?.value,
        view.getUint32(area.end, true),
      );
      comment = strings[i + 4]?.value || '';
      if (!device) {
        unresolved = true;
        continue;
      }
    } else {
      if (/^SV\d/.test(version)) unresolved = true;
      continue;
    }
    if (name) aliases[name] = { ...device, comment };
    if (comment) {
      if (device.access === 'word') {
        wordComments[device.address[0] + Number(device.address.slice(1))] =
          comment;
      } else {
        addressComments[canonicalAddress(device.address)] = comment;
      }
    }
  }
  return { aliases, addressComments, wordComments, unresolved };
}
