import { escapeHtml } from "./format.ts";
import { between, createRandom, type Random } from "./random.ts";

/** スキャンの再現条件 */
export interface ScanProfile {
  /** 読み取り解像度 */
  dpi: number;
  /** FAXのように縦方向だけ解像度を落とす場合の縦解像度 */
  verticalDpi?: number;
  /** 傾き(度) */
  skewDegrees: number;
  /** ノイズの強さ(画素値の標準偏差) */
  noise: number;
  /** 白黒2値化する場合のしきい値(0〜255) */
  threshold?: number;
  /** JPEG品質(0〜1) */
  jpegQuality: number;
}

export interface SampleDocument {
  /** 出力先ディレクトリ名 */
  id: string;
  /** 書類の名前 */
  title: string;
  /** 様式の発行元(ダミー) */
  issuer: string;
  /** 手書きを再現しているか */
  handwritten: boolean;
  /**
   * ページのHTML。scan が true のときはスキャン版用で、
   * 偽造防止の地紋などコピー時にだけ現れる要素を含めてよい
   */
  html: (options: { scan: boolean }) => string;
  scan: ScanProfile;
  /** 正解データ(このダミーPDFに書かれている値) */
  expected: Record<string, unknown>;
}

export const CLEAN_SCAN: ScanProfile = {
  dpi: 200,
  skewDegrees: 0.4,
  noise: 6,
  jpegQuality: 0.75,
};

export const FAX_SCAN: ScanProfile = {
  dpi: 200,
  verticalDpi: 100,
  skewDegrees: -0.9,
  noise: 14,
  threshold: 150,
  jpegQuality: 0.7,
};

const BASE_CSS = `
@page { size: A4; margin: 0; }
* { box-sizing: border-box; }
html, body { margin: 0; padding: 0; background: #fff; color: #111; }
body {
  width: 210mm; height: 297mm; position: relative; overflow: hidden;
  font-family: "Hiragino Sans", "Hiragino Kaku Gothic ProN", sans-serif;
  font-size: 9pt; line-height: 1.3;
  -webkit-print-color-adjust: exact; print-color-adjust: exact;
}
.mincho { font-family: "Hiragino Mincho ProN", serif; }
table { border-collapse: collapse; width: 100%; }
td, th { border: 0.3mm solid #222; padding: 0.8mm 1.2mm; vertical-align: top; font-weight: normal; }
th { background: #f2f2f2; text-align: left; white-space: nowrap; }
.num { text-align: right; font-variant-numeric: tabular-nums; }
.small { font-size: 7pt; }
.center { text-align: center; }
.sample-mark {
  position: absolute; right: 8mm; bottom: 5mm; font-size: 7pt; color: #444;
}
.digits { display: inline-flex; }
.digit {
  display: inline-block; width: 4.2mm; height: 5.2mm; border: 0.2mm solid #555;
  margin-left: -0.2mm; text-align: center; line-height: 5.2mm;
  font-size: 9.5pt; font-variant-numeric: tabular-nums;
}
.hand {
  font-family: "Hiragino Maru Gothic ProN", sans-serif; color: #1a2a6c;
  font-size: 11pt; display: inline-block;
}
.hand span { display: inline-block; }
`;

export function page(body: string, extraCss = ""): string {
  return `<!doctype html><html lang="ja"><head><meta charset="utf-8">
<style>${BASE_CSS}${extraCss}</style></head><body>${body}
<div class="sample-mark">見本(ダミーデータ・実在しない人物/団体)</div></body></html>`;
}

/**
 * 手書き風の文字列。1文字ずつ角度・位置・大きさを少しずらす。
 * 本物の手書きよりはるかに読みやすい点に注意(OCRの評価では手書きの難しさを再現できない)。
 */
export function createHandwriting(seed: number): (text: string) => string {
  const random: Random = createRandom(seed);
  return (text: string) =>
    `<span class="hand">${[...text]
      .map((c) => {
        const rotate = between(random, -5, 5).toFixed(1);
        const dy = between(random, -0.6, 0.6).toFixed(2);
        const scale = between(random, 0.92, 1.08).toFixed(2);
        return `<span style="transform: translateY(${dy}mm) rotate(${rotate}deg) scale(${scale})">${
          c === " " ? "&nbsp;" : escapeHtml(c)
        }</span>`;
      })
      .join("")}</span>`;
}
