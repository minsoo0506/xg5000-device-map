// Operand order and word widths follow the LS ELECTRIC XGK/XGB instruction manual.
// https://sol.ls-electric.com/uploads/document/16411828568550/XGK_XGB_Instruction_Manual_202012_V2.9_EN.pdf
const transfers = new Map();

function define(names, inputs, output, sources = 1) {
  for (const name of names.split(' '))
    transfers.set(name, { inputs, output, sources });
}

define('MOV MOVP BIN BINP', 1, 1);
define('DMOV DMOVP DBIN DBINP', 2, 2);
define(
  'ADD ADDP SUB SUBP ANDW ORW XORW WAND WOR WXOR WANDP WORP WXORP',
  1,
  1,
  2,
);
define('MUL MULP DIV DIVP', 1, 2, 2);
define('DADD DADDP DSUB DSUBP', 2, 2, 2);
// The ASCII output can include a terminating NUL following the digit pairs.
define('BCDDA BCDDAP', 1, 3);
define('DBCDDA DBCDDAP', 2, 5);

function integerLiteral(value) {
  if (/^[+-]?\d+$/.test(value)) return Number(value);
  if (/^(?:H#?|16#)[\dA-F]+$/i.test(value))
    return Number.parseInt(value.replace(/^(?:H#?|16#)/i, ''), 16);
  if (/^[KL]#[+-]?\d+$/i.test(value)) return Number(value.slice(2));
  return null;
}

export function isLiteral(value) {
  return integerLiteral(value) !== null || /^[+-]?\d+\.\d+$/.test(value);
}

export const controlInstructions = new Set([
  'JMP',
  'LABEL',
  'CALL',
  'CALLP',
  'SBRT',
  'RET',
]);

export function instructionReferences(operands, { read, write, warn }) {
  const [mnemonic, ...args] = operands;
  const op = mnemonic?.toUpperCase();
  const [first, second, third] = args;
  const output = (value, words, offset) => write(value, op, words, offset);
  const transfer = transfers.get(op);

  if (transfer) {
    if (args.length !== transfer.sources + 1)
      return warn(`${op} 피연산자 수를 확인하세요.`);
    for (const value of args.slice(0, transfer.sources))
      read(value, transfer.inputs);
    output(args.at(-1), transfer.output);
  } else if (/^(?:=|<>|>=|<=|>|<|AND|OR|XOR)$/.test(op)) {
    for (const value of args) read(value, 1);
  } else if (/^(?:D?(?:INC|DEC)P?)$/.test(op)) {
    const width = op.startsWith('D') ? 2 : 1;
    read(first, width);
    output(first, width);
  } else if (op === 'TFLK') {
    if (args.length !== 4) return warn('TFLK 피연산자 수를 확인하세요.');
    const work = args[3];
    output(first);
    read(second, 1);
    read(third, 1);
    // D2 holds elapsed time, D2+1 selects the time unit, D2+2/+3 are internal state.
    read(work, 4);
    output(work, 1);
    output(work, 2, 2);
  } else if (op === 'FF') {
    read(first);
    output(first);
  } else if (/^(?:TON|TOF|TOFF|TMR|CTU|CTD|CTUD)$/.test(op)) {
    output(first);
    for (const value of args.slice(1)) read(value, 1);
  } else if (/^(?:GMOV|DIS|UNI)P?$/.test(op)) {
    if (args.length !== 3) return warn(`${op} 피연산자 수를 확인하세요.`);
    const move = op.startsWith('GMOV');
    const distribute = op.startsWith('DIS');
    const count = integerLiteral(third);
    const maximum = move ? 65536 : 4;
    if (count === null) {
      read(third, 1);
      warn(
        `${op}의 길이 ${third}는 실행 중 결정됩니다. 범위의 시작 주소만 표시합니다.`,
      );
    } else if (!Number.isSafeInteger(count) || count < 0 || count > maximum) {
      return warn(
        `${op}의 길이 ${third}가 허용 범위(0~${maximum})를 벗어났습니다.`,
      );
    }
    if (count === 0) {
      // UNI zero-fills all destination nibbles outside the requested count.
      if (op.startsWith('UNI')) output(second, 1);
      return;
    }
    read(first, distribute ? 1 : (count ?? 1));
    output(second, move || distribute ? (count ?? 1) : 1);
  } else if (op !== 'END' && op !== 'NOP' && !controlInstructions.has(op)) {
    warn(`미해석 명령 ${mnemonic}`);
  }
}
