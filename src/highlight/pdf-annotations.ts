import type { PdfHighlightAnnotation } from "../pdf/annotate-pdf.ts";
import { formatValue } from "../results/format.ts";
import type { ReviewedField, ReviewStatus } from "../results/review.ts";
import { CATEGORIES, categoryOf, type HighlightCategory } from "./categories.ts";
import { highlightsFromReviewed } from "./highlights.ts";

// 確認・修正を反映した抽出結果を、ダウンロードするPDFに書き込むハイライト注釈にする。
// 画面のハイライトと同じ範囲・同じ色分けで、コメントには項目名と値、確認の状態を入れる。

/** 項目の種類ごとの色。標準のテーマのハイライトの色(src/styles/highlight.css の --hl-*)と同じ */
const COLORS: Readonly<Record<HighlightCategory, string>> = {
  name: "#ffe45c",
  birth: "#ffa8d2",
  work: "#9ad7ff",
  money: "#ffb36b",
  address: "#8be3a8",
  property: "#cdb4ff",
  other: "#d9d9d3",
};

function rgb(hex: string): [number, number, number] {
  const n = Number.parseInt(hex.slice(1), 16);
  return [(n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff].map((c) => c / 255) as [number, number, number];
}

const STATUS_TEXT: Readonly<Record<Exclude<ReviewStatus, "missing">, string>> = {
  confirmed: "確認済み",
  edited: "手動修正済み",
  attention: "要確認",
  unconfirmed: "未確認",
};

function statusLine(item: ReviewedField): string {
  if (item.status === "missing") return "";
  const status = STATUS_TEXT[item.status];
  if (item.status === "edited" && item.original) {
    return `状態: ${status}(元の読取値: ${formatValue(item.field.type, item.original.value)})`;
  }
  return `状態: ${status}`;
}

/** 1つの書類の抽出結果から、すべてのページのハイライト注釈を作る */
export function annotationsFromReviewed(
  documentTitle: string,
  groupId: string,
  documentId: string,
  items: readonly ReviewedField[],
): PdfHighlightAnnotation[] {
  const byKey = new Map(items.map((i) => [`${groupId}:${i.field.key}`, i]));
  const pages = [...new Set(items.flatMap((i) => (i.page === undefined ? [] : [i.page])))].sort((a, b) => a - b);
  return pages.flatMap((page) =>
    highlightsFromReviewed(groupId, documentId, items, page).flatMap((h): PdfHighlightAnnotation[] => {
      const item = byKey.get(h.id);
      if (!item || h.kind.type !== "field") return [];
      const category = categoryOf(item.field.key);
      return [
        {
          page,
          rects: h.rects,
          color: rgb(COLORS[category]),
          title: documentTitle,
          subject: CATEGORIES[category].label,
          contents: `${h.label}\n${statusLine(item)}`,
        },
      ];
    }),
  );
}

/** ダウンロードするPDFのファイル名(「源泉徴収票_2025.pdf」→「源泉徴収票_2025.highlighted.pdf」) */
export function annotatedFileName(pdfName: string): string {
  return `${pdfName.replace(/\.pdf$/i, "")}.highlighted.pdf`;
}
