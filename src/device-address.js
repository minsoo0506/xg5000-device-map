// XGK/XGB bit addresses use a decimal word number followed by one hexadecimal bit.
export function canonicalAddress(value) {
  const address = value.trim().toUpperCase();
  const bit = /^([PMLKF])(\d*)([0-9A-F])$/.exec(address);
  if (bit)
    return bit[1] + String(Number(bit[2] || 0)).padStart(4, '0') + bit[3];
  const word = /^([DTRCZN])(\d+)(\.[0-9A-F])?$/.exec(address);
  if (word)
    return word[1] + String(Number(word[2])).padStart(5, '0') + (word[3] || '');
  if (/^(?:S\d+(?:\.\d+)?|U\d+(?:\.\d+){1,2})$/.test(address)) return address;
  return value.trim();
}
