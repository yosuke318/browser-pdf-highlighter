import { CJK_RADICAL_SUPPLEMENT } from "./cjk-radicals.ts";
import { type Rect, type TextSegment, unionRect } from "./types.ts";

// 比較・検索のための文字列の正規化。
// 1文字ずつ変換し、正規化した後の各文字が元の何文字目から来たかを記録して、元の座標へ戻せるようにする。

/** ハイフンやマイナスに見える文字(住所の「1-2-3」などに使われる)。長音「ー」は含めない */
const HYPHENS = /[‐-―−]/u;

/** 1文字を正規化する。空文字列を返したら、その文字は捨てる */
export function normalizeChar(char: string): string {
  // CJK部首補助は NFKC で戻らないものがあるので、先に変換表で戻す
  const radical = CJK_RADICAL_SUPPLEMENT.get(char);
  if (radical) return radical;
  // NFKC: 全角英数字 → 半角、康熙部首 → 通常の漢字、半角カナ → 全角カナ、㈱ → (株) など
  const nfkc = char.normalize("NFKC");
  if (/^\s+$/u.test(nfkc)) return "";
  if (HYPHENS.test(nfkc)) return "-";
  return nfkc;
}

export interface NormalizedText {
  /** 正規化した文字列 */
  text: string;
  /**
   * 正規化した後の i 番目の文字(コードポイント単位)が、元の文字列の何番目の文字(コードポイント単位)から来たか
   */
  sourceIndex: number[];
}

/**
 * 文字列を正規化する。
 * 全角英数字を半角に、康熙部首・CJK部首補助を通常の漢字にし、空白を取り除く。
 */
export function normalizeText(text: string): NormalizedText {
  const chars = [...text];
  const out: string[] = [];
  const sourceIndex: number[] = [];
  for (let i = 0; i < chars.length; i++) {
    const char = chars[i] ?? "";
    const next = chars[i + 1];
    // 濁点・半濁点が別の文字になっているもの(半角カナの「ﾌﾟ」など)は、前の文字と合わせて1文字にする
    if (next !== undefined && VOICING_MARKS.test(next)) {
      for (const c of `${char}${next}`.normalize("NFKC")) {
        out.push(c);
        sourceIndex.push(i);
      }
      i++;
      continue;
    }
    for (const c of normalizeChar(char)) {
      out.push(c);
      sourceIndex.push(i);
    }
  }
  return { text: out.join(""), sourceIndex };
}

/** 濁点・半濁点(結合文字と半角カナ) */
const VOICING_MARKS = /^[゙゚ﾞﾟ]$/u;

/**
 * 画面に出すための正規化。康熙部首・全角英数字などは通常の文字にするが、空白は1つにまとめて残す
 * (比較用の normalizeText と違い、「山田 太郎」の空白を消さない)
 */
export function normalizeForDisplay(text: string): string {
  return [...text.trim().replace(/\s+/gu, " ")].map((c) => (c === " " ? c : normalizeChar(c))).join("");
}

/**
 * 正規化した文字列の範囲 [start, end)(コードポイント単位)を、元の文字列の範囲に戻す
 */
export function toSourceRange(normalized: NormalizedText, start: number, end: number): [number, number] | null {
  if (start >= end || start < 0 || end > normalized.sourceIndex.length) return null;
  const first = normalized.sourceIndex[start];
  const last = normalized.sourceIndex[end - 1];
  if (first === undefined || last === undefined) return null;
  return [first, last + 1];
}

/**
 * 正規化した文字列の範囲 [start, end)(コードポイント単位)を囲む長方形を、PDFページ座標で返す
 */
export function rangeBBox(segment: TextSegment, normalized: NormalizedText, start: number, end: number): Rect | null {
  const range = toSourceRange(normalized, start, end);
  if (!range) return null;
  return unionRect(segment.charBoxes.slice(range[0], range[1]));
}
