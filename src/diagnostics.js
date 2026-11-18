// The worker returns Korean parser diagnostics. Translate only generated fields at display time.
const messages = new Map(
  [
    [
      '64MB 이하의 프로젝트를 선택하세요.',
      'Choose a project of 64 MB or less.',
      '64 MB 以下のプロジェクトを選択してください。',
    ],
    [
      'XGWX 파일 헤더가 아닙니다.',
      'The file has an invalid XGWX header.',
      'XGWX ファイルのヘッダーが正しくありません。',
    ],
    [
      '프로젝트 압축 데이터를 찾을 수 없습니다.',
      'The compressed project data is missing.',
      '圧縮されたプロジェクトデータが見つかりません。',
    ],
    [
      '지원하지 않는 gzip 플래그입니다.',
      'Unsupported gzip flags.',
      '未対応の gzip フラグです。',
    ],
    [
      '프로젝트 압축 해제 크기가 너무 큽니다.',
      'The decompressed project exceeds the size limit.',
      '展開後のプロジェクトがサイズ制限を超えています。',
    ],
    [
      '프로젝트 압축 데이터가 손상됐습니다.',
      'The compressed project data is damaged.',
      '圧縮されたプロジェクトデータが破損しています。',
    ],
    [
      '압축 데이터가 잘렸습니다.',
      'The compressed data is truncated.',
      '圧縮データが途中で切れています。',
    ],
    [
      '프로젝트 압축 데이터 검증에 실패했습니다.',
      'The compressed project failed its integrity check.',
      '圧縮されたプロジェクトデータの整合性チェックに失敗しました。',
    ],
    [
      '지원하지 않는 XML 선언입니다.',
      'Unsupported XML declaration.',
      '未対応の XML 宣言です。',
    ],
    [
      '프로젝트 XML이 손상됐습니다.',
      'The project XML is malformed.',
      'プロジェクト XML の形式が正しくありません。',
    ],
    [
      '프로젝트 정보를 찾을 수 없습니다.',
      'Project information is missing.',
      'プロジェクト情報が見つかりません。',
    ],
    [
      '이 프로젝트의 일부 변수표 형식은 주소 연결을 아직 해석하지 못했습니다.',
      'Some symbol table records could not be mapped to addresses.',
      '一部の変数テーブルのレコードをアドレスに対応付けられませんでした。',
    ],
    [
      '암호로 보호된 프로그램입니다.',
      'The program is password-protected.',
      'プログラムはパスワードで保護されています。',
    ],
    [
      '래더 데이터를 찾을 수 없습니다.',
      'Ladder data is missing.',
      'ラダーデータが見つかりません。',
    ],
    [
      '비 IEC 래더 형식만 분석할 수 있습니다.',
      'Only non-IEC ladder data is supported.',
      '解析に対応しているのは非 IEC ラダー形式のみです。',
    ],
    [
      '래더 크기 제한 초과',
      'The ladder exceeds the size limit.',
      'ラダーがサイズ制限を超えています。',
    ],
    [
      '프로젝트에 프로그램이 없습니다.',
      'The project contains no programs.',
      'プロジェクトにプログラムがありません。',
    ],
    [
      '잘못된 압축 크기 제한입니다.',
      'Invalid decompression size limit.',
      '展開時のサイズ制限が無効です。',
    ],
    [
      '래더/변수표 압축 해제 크기 제한을 초과했습니다.',
      'The decompressed ladder or symbol table exceeds the size limit.',
      '展開後のラダーまたは変数テーブルがサイズ制限を超えています。',
    ],
    [
      '변수표 문자열 길이가 잘렸습니다.',
      'Truncated string length in the symbol table.',
      '変数テーブルの文字列長が途中で切れています。',
    ],
    [
      '변수표 문자열이 잘렸습니다.',
      'Truncated string in the symbol table.',
      '変数テーブルの文字列が途中で切れています。',
    ],
    [
      '변수표 주소가 잘렸습니다.',
      'Truncated address in the symbol table.',
      '変数テーブルのアドレスが途中で切れています。',
    ],
    ['문자열 길이 오류', 'Invalid string length.', '文字列長が無効です。'],
    [
      '래더 네트워크 수 불일치',
      'The ladder network count does not match the header.',
      'ラダーのネットワーク数がヘッダーと一致しません。',
    ],
    [
      'devices와 rungs 배열이 필요합니다.',
      'The project requires devices and rungs arrays.',
      'プロジェクトには devices 配列と rungs 配列が必要です。',
    ],
    [
      '디바이스 주소가 비어 있거나 중복되었습니다.',
      'A device address is empty or duplicated.',
      '空欄または重複したデバイスアドレスがあります。',
    ],
    [
      '조건 묶음의 id, program, location, reads, writes를 확인하세요.',
      'Check the rung id, program, location, reads and writes fields.',
      '回路ブロックの id、program、location、reads、writes を確認してください。',
    ],
    [
      '쓰기 명령이 필요합니다.',
      'A write instruction is required.',
      '書き込み命令が必要です。',
    ],
  ].map(([ko, en, ja]) => [ko, { en, ja }]),
);

const patterns = [
  [
    /^잘린 래더 데이터 \((\d+)\)$/,
    'Truncated ladder data at offset $1.',
    'オフセット $1 でラダーデータが途切れています。',
  ],
  [
    /^문자열 형식 오류 \((\d+)\)$/,
    'Invalid string format at offset $1.',
    'オフセット $1 の文字列形式が正しくありません。',
  ],
  [
    /^래더 행 형식 오류 \((\d+)\)$/,
    'Invalid ladder row at offset $1.',
    'オフセット $1 のラダー行形式が正しくありません。',
  ],
  [
    /^미지원 요소 (\d+\/\d+) \((\d+)\)$/,
    'Unsupported element $1 at offset $2.',
    'オフセット $2 の要素 $1 は未対応です。',
  ],
  [
    /^정의되지 않은 디바이스: (.*)$/s,
    'Undefined device: $1',
    '未定義のデバイス: $1',
  ],
  [/^미해석 명령 (.*)$/s, 'Unrecognized instruction $1', '未解析の命令 $1'],
  [/^미해석 요소 (\d+)$/, 'Unrecognized element $1', '未解析の要素 $1'],
  [
    /^(.*) 피연산자 수를 확인하세요\.$/s,
    'Check the operand count for $1.',
    '$1 のオペランド数を確認してください。',
  ],
  [
    /^(.*)의 (\d+)워드 범위를 완전히 해석하지 못했습니다\.$/s,
    'Could not resolve the full $2-word range for $1.',
    '$1 の $2 ワード範囲を完全には解析できませんでした。',
  ],
  [
    /^(\S+)의 길이 (.*)는 실행 중 결정됩니다\. 범위의 시작 주소만 표시합니다\.$/s,
    'The $1 length ($2) is determined at runtime. Only the start address is shown.',
    '$1 の長さ（$2）は実行時に決まるため、開始アドレスのみ表示します。',
  ],
  [
    /^(\S+)의 길이 (.*)가 허용 범위\(0~(\d+)\)를 벗어났습니다\.$/s,
    'The $1 length ($2) is outside the allowed range (0–$3).',
    '$1 の長さ（$2）が許容範囲（0～$3）外です。',
  ],
];

export function diagnostic(message, language) {
  if (language !== 'en' && language !== 'ja') return message;
  const direct = messages.get(message)?.[language];
  if (direct) return direct;
  if (message.startsWith('변수표 해석 실패: ')) {
    return (
      (language === 'ja'
        ? '変数テーブルの解析に失敗しました: '
        : 'Could not read the symbol table: ') +
      diagnostic(message.slice('변수표 해석 실패: '.length), language)
    );
  }
  for (const [pattern, en, ja] of patterns) {
    if (pattern.test(message))
      return message.replace(pattern, language === 'ja' ? ja : en);
  }
  return message;
}

export function warningText(message, language, programs = []) {
  if (language === 'ko') return message;
  // Match the actual program name so punctuation and words in project names are preserved.
  for (const program of programs) {
    const prefix = program.name + ' 네트워크 ';
    if (message.startsWith(prefix)) {
      const parts = /^(\d+): ([\s\S]*)$/.exec(message.slice(prefix.length));
      if (parts)
        return (
          program.name +
          ' ' +
          networkLocation('네트워크 ' + parts[1], language) +
          ': ' +
          diagnostic(parts[2], language)
        );
    }
    if (program.error && message === program.name + ': ' + program.error)
      return program.name + ': ' + diagnostic(program.error, language);
  }
  return diagnostic(message, language);
}

export function networkLocation(location, language) {
  if (language === 'ko') return location;
  return location
    .replace(
      /^네트워크 (\d+)$/,
      language === 'ja' ? 'ネットワーク $1' : 'Network $1',
    )
    .replace(/^스텝 (\d+)$/, language === 'ja' ? 'ステップ $1' : 'Step $1');
}

export function networkNote(note, language) {
  const intro = '같은 네트워크의 참조 관계입니다. ';
  if (!note?.startsWith(intro) || language === 'ko') return note;
  const control = ' (점프·호출의 실행 경로는 추적하지 않습니다.)';
  let references = note.slice(intro.length);
  const hasControl = references.endsWith(control);
  if (hasControl) references = references.slice(0, -control.length);
  references = references.replace(
    /(^| · )접점 /g,
    language === 'ja' ? '$1接点 ' : '$1Contact ',
  );
  const prefix =
    language === 'ja'
      ? '同じネットワーク内の参照: '
      : 'References in this network: ';
  const suffix =
    language === 'ja'
      ? '（ジャンプ・呼び出しの実行経路は追跡しません。）'
      : ' (Jump and call execution paths are not traced.)';
  return prefix + references + (hasControl ? suffix : '');
}
