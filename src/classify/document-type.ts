import { EXTRACTION_SCHEMA } from "../schema/fields.ts";
import { normalizeText } from "../text/normalize.ts";
import type { TextSegment } from "../text/types.ts";

// 書類タイプの自動判定。ページの文字に、書類タイプごとの特徴的な文言がどれだけ出てくるかで点数を付ける。
// 書類名はタイトルとして大きな文字で書かれることが多いので、大きな文字で見つかった文言は点数を倍にする
// (申込書の「提出書類: 源泉徴収票」のように、本文でほかの書類に触れているだけの場合に誤判定しにくくするため)。

export interface Keyword {
  /** 正規化したページの文字(空白なし・全角英数字は半角)に対する正規表現 */
  pattern: RegExp;
  /** 見つかったときの点数。負の値は、その書類タイプではない手がかり */
  weight: number;
  /** 画面に出す説明(判定の根拠として表示する) */
  label: string;
}

/** 書類名(タイトル)の点数 */
const TITLE = 10;
/** 書類名の一部や、その書類に特有の言い回しの点数 */
const STRONG = 4;
/** その書類によく出る欄の名前の点数 */
const FIELD = 2;

/**
 * 書類タイプごとの特徴的な文言。キーは書類ID(schema/extraction-fields.json の documents[].id)。
 * 文言は docs/document-formats.md の様式調査と、ダミーPDFの様式から選んだ。
 */
export const DOCUMENT_KEYWORDS: Readonly<Record<string, readonly Keyword[]>> = {
  "withholding-slip": [
    { pattern: /給与所得の源泉徴収票/, weight: TITLE, label: "給与所得の源泉徴収票" },
    { pattern: /源泉徴収票/, weight: STRONG, label: "源泉徴収票" },
    { pattern: /支払を受ける者/, weight: FIELD, label: "支払を受ける者" },
    { pattern: /給与所得控除後の金額/, weight: FIELD, label: "給与所得控除後の金額" },
    { pattern: /源泉徴収税額/, weight: FIELD, label: "源泉徴収税額" },
    { pattern: /受給者生年月日/, weight: FIELD, label: "受給者生年月日" },
    // 様式が似ているが、別の書類
    {
      pattern: /退職所得の源泉徴収票|公的年金等の源泉徴収票/,
      weight: -TITLE * 2,
      label: "退職所得・公的年金等の源泉徴収票(別の書類)",
    },
    { pattern: /給与支払報告書/, weight: -TITLE, label: "給与支払報告書(別の書類)" },
  ],
  "tax-certificate": [
    {
      pattern: /(課税|所得|非課税)(\((課税|所得)\)|・(課税|所得))?証明書/,
      weight: TITLE,
      label: "課税証明書・所得証明書",
    },
    { pattern: /上記のとおり証明します/, weight: STRONG, label: "上記のとおり証明します" },
    { pattern: /合計所得金額/, weight: FIELD, label: "合計所得金額" },
    { pattern: /総所得金額等/, weight: FIELD, label: "総所得金額等" },
    { pattern: /所得控除合計/, weight: FIELD, label: "所得控除合計" },
    { pattern: /課税標準額/, weight: FIELD, label: "課税標準額" },
  ],
  "resident-tax-notice": [
    { pattern: /(特別徴収)?税額の?決定通知書|納税通知書/, weight: TITLE, label: "税額決定通知書・納税通知書" },
    { pattern: /特別徴収税額/, weight: STRONG, label: "特別徴収税額" },
    { pattern: /給与所得等に係る/, weight: FIELD, label: "給与所得等に係る" },
    { pattern: /月割額/, weight: FIELD, label: "月割額" },
    { pattern: /総所得金額/, weight: FIELD, label: "総所得金額" },
  ],
  "tax-return": [
    { pattern: /確定申告書/, weight: TITLE, label: "確定申告書" },
    { pattern: /所得税及び復興特別所得税/, weight: STRONG, label: "所得税及び復興特別所得税" },
    { pattern: /収入金額等/, weight: FIELD, label: "収入金額等" },
    { pattern: /所得金額等/, weight: FIELD, label: "所得金額等" },
    { pattern: /所得から差し引かれる金額/, weight: FIELD, label: "所得から差し引かれる金額" },
    { pattern: /税金の計算/, weight: FIELD, label: "税金の計算" },
  ],
  "home-loan-application": [
    { pattern: /(住宅ローン)?借入申込書|ローン申込書/, weight: TITLE, label: "借入申込書" },
    { pattern: /住宅ローン/, weight: STRONG, label: "住宅ローン" },
    { pattern: /借入希望額|借入金額|お借入/, weight: FIELD, label: "借入希望額" },
    { pattern: /返済期間/, weight: FIELD, label: "返済期間" },
    { pattern: /既存(の)?借入|他の借入/, weight: FIELD, label: "既存借入" },
  ],
  "rental-application": [
    { pattern: /入居申込書|賃貸借契約申込書|入居申込/, weight: TITLE, label: "入居申込書" },
    { pattern: /連帯保証人/, weight: STRONG, label: "連帯保証人" },
    { pattern: /緊急連絡先/, weight: FIELD, label: "緊急連絡先" },
    { pattern: /賃料|家賃/, weight: FIELD, label: "賃料" },
    { pattern: /号室/, weight: FIELD, label: "号室" },
  ],
};

/** 判定のしきい値 */
export const DOCUMENT_TYPE_SETTINGS = {
  /** 1位の点数がこれ未満なら、判定できないとする */
  minScore: 10,
  /** 1位の点数が2位のこの倍数未満なら、判定できないとする(候補が拮抗している) */
  minLeadRatio: 1.5,
  /** ページの文字の大きさの中央値のこの倍数以上なら、タイトルとみなす */
  titleSizeRatio: 1.25,
} as const;

export interface KeywordHit {
  label: string;
  weight: number;
  /** 大きな文字(タイトル)で見つかったか。見つかった場合は点数を倍にしている */
  inTitle: boolean;
}

export interface TypeScore {
  documentId: string;
  title: string;
  score: number;
  /** 判定の根拠(見つかった文言) */
  hits: KeywordHit[];
}

export interface DocumentTypeGuess {
  /** 判定した書類ID。判定できなければ null */
  documentId: string | null;
  /** 点数の高い順の候補(点数が0以下のものは含めない) */
  candidates: TypeScore[];
  /** 判定できなかった理由 */
  reason?: "no-text" | "low-score" | "close-candidates";
}

function isHorizontal(s: TextSegment): boolean {
  return s.bbox.x1 - s.bbox.x0 >= s.bbox.y1 - s.bbox.y0;
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)] ?? 0;
}

const TITLES = new Map(EXTRACTION_SCHEMA.documents.map((d) => [d.id, d.title]));

/** 1ページ分の文字から、書類タイプを判定する */
export function guessDocumentType(
  segments: readonly TextSegment[],
  keywords: Readonly<Record<string, readonly Keyword[]>> = DOCUMENT_KEYWORDS,
): DocumentTypeGuess {
  const cells = segments.map((s) => ({ text: normalizeText(s.text).text, segment: s })).filter((c) => c.text !== "");
  if (cells.length === 0) return { documentId: null, candidates: [], reason: "no-text" };

  const titleHeight = median(cells.filter((c) => isHorizontal(c.segment)).map((c) => c.segment.bbox.y1 - c.segment.bbox.y0));
  const isTitle = (s: TextSegment) =>
    isHorizontal(s) && s.bbox.y1 - s.bbox.y0 >= titleHeight * DOCUMENT_TYPE_SETTINGS.titleSizeRatio;
  const pageText = cells.map((c) => c.text).join("");

  const scores: TypeScore[] = Object.entries(keywords).map(([documentId, list]) => {
    const hits: KeywordHit[] = [];
    for (const keyword of list) {
      const inCells = cells.filter((c) => keyword.pattern.test(c.text));
      // セルをまたいで書かれた文言も、ページ全体の文字から探す
      if (inCells.length === 0 && !keyword.pattern.test(pageText)) continue;
      const inTitle = keyword.weight > 0 && inCells.some((c) => isTitle(c.segment));
      hits.push({ label: keyword.label, weight: inTitle ? keyword.weight * 2 : keyword.weight, inTitle });
    }
    const score = hits.reduce((sum, h) => sum + h.weight, 0);
    return { documentId, title: TITLES.get(documentId) ?? documentId, score, hits };
  });

  const candidates = scores.filter((s) => s.score > 0).sort((p, q) => q.score - p.score);
  const [first, second] = candidates;
  if (!first || first.score < DOCUMENT_TYPE_SETTINGS.minScore) return { documentId: null, candidates, reason: "low-score" };
  if (second && first.score < second.score * DOCUMENT_TYPE_SETTINGS.minLeadRatio) {
    return { documentId: null, candidates, reason: "close-candidates" };
  }
  return { documentId: first.documentId, candidates };
}

/** 書類タイプの選択肢(画面の手動切り替え用)。抽出項目の定義にある順 */
export const DOCUMENT_TYPES: readonly { id: string; title: string }[] = EXTRACTION_SCHEMA.documents.map((d) => ({
  id: d.id,
  title: d.title,
}));
