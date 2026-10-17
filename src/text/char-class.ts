// 文字化けの判定に使う「正常な文字」の範囲。
// 日本語の書類に出てくる文字(ひらがな・カタカナ・漢字・英数字・記号)を正常とみなし、
// 私用領域の文字や制御文字、日本語の書類にまず出てこない文字の割合が高ければ文字化けとみなす。

const NORMAL_RANGES: ReadonlyArray<readonly [number, number]> = [
  [0x0020, 0x007e], // ASCII の英数字・記号
  [0x2000, 0x206f], // 一般句読点(‐ ― … ‥ ※ など)
  [0x2100, 0x214f], // 文字様記号(№ ℡ など)
  [0x2150, 0x218f], // ローマ数字
  [0x2190, 0x21ff], // 矢印
  [0x2212, 0x2212], // マイナス記号
  [0x2460, 0x24ff], // 丸数字
  [0x2500, 0x257f], // 罫線
  [0x25a0, 0x25ff], // 図形(□ ■ △ ▲ ○ など)
  [0x2600, 0x26ff], // その他の記号(★ など)
  [0x2e80, 0x2eff], // CJK部首補助(Macで作ったPDFから取り出すと混ざることがある)
  [0x2f00, 0x2fdf], // 康熙部首(同上)
  [0x3000, 0x303f], // CJKの記号と句読点(、。「」〒 など)
  [0x3040, 0x309f], // ひらがな
  [0x30a0, 0x30ff], // カタカナ
  [0x3200, 0x32ff], // 囲みCJK文字(㈱ ㊤ など)
  [0x3300, 0x33ff], // CJK互換用文字(㎡ ㍻ など)
  [0x3400, 0x4dbf], // CJK統合漢字拡張A
  [0x4e00, 0x9fff], // CJK統合漢字
  [0xf900, 0xfaff], // CJK互換漢字
  [0xff00, 0xffef], // 全角英数字・半角カナ
  [0x20000, 0x3134f], // CJK統合漢字拡張B〜(人名の異体字など)
];

/** ASCII 以外で、日本語の書類によく出てくる Latin-1 の記号 */
const NORMAL_LATIN1 = new Set(["¥", "×", "÷", "°", "±", "§", "©", "®", "·"]);

export function isNormalChar(char: string): boolean {
  if (NORMAL_LATIN1.has(char)) return true;
  const code = char.codePointAt(0);
  if (code === undefined) return false;
  return NORMAL_RANGES.some(([from, to]) => code >= from && code <= to);
}

/**
 * 空白を除いた文字のうち、正常な文字の割合(0〜1)。文字がなければ 1
 */
export function normalCharRatio(text: string): number {
  const chars = [...text].filter((c) => !/\s/u.test(c));
  if (chars.length === 0) return 1;
  return chars.filter(isNormalChar).length / chars.length;
}
