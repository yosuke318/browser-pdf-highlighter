import { diffArrays, diffChars } from "diff";
import { groupLines } from "../text/lines.ts";
import { normalizeText } from "../text/normalize.ts";
import type { Rect, TextSegment } from "../text/types.ts";

// 前回と今回の書類の文字を、行ごとに比べる(テキスト差分)。
// 抽出する項目に入らない欄(備考・特記事項など)の書き換えを見つけるための補助として使う。
// レイアウトの違いによる見かけ上の差分を減らすため、次の2つを差分にしない。
// - 空白・全角と半角・康熙部首などの表記の違い(正規化してから比べる)
// - 改行の位置だけの違い(続けて読むと同じ文字列になる行のまとまり)

/** 書類の1行 */
export interface DocumentLine {
  page: number;
  /** 画面に出す文字列(正規化した後の文字列から、空白を除いたもの) */
  text: string;
  /** 行を作るセルの長方形(PDFページ座標) */
  rects: Rect[];
  /** 読み取りの方法(OCR の行は、読み違いで差分が出ることがある) */
  source: "pdf" | "ocr";
}

export interface DiffPart {
  text: string;
  /** 前回の行では削除された部分、今回の行では追加された部分 */
  changed: boolean;
}

export type TextDiffKind = "same" | "changed" | "added" | "removed";

export interface TextDiffRow {
  kind: TextDiffKind;
  previous?: DocumentLine;
  current?: DocumentLine;
  /** 変更された行の、文字ごとの違い */
  parts?: { previous: DiffPart[]; current: DiffPart[] };
}

/** 比較用の文字列。正規化して、空白を除く */
function compareText(text: string): string {
  return normalizeText(text).text.replace(/\s/gu, "");
}

/** ページの文字を、上の行から順に並べた行にする */
export function documentLines(pages: readonly { pageNumber: number; segments: readonly TextSegment[] }[]): DocumentLine[] {
  return pages.flatMap((page) =>
    groupLines(page.segments).flatMap((line): DocumentLine[] => {
      const text = compareText(line.segments.map((s) => s.text).join(""));
      if (text === "") return [];
      return [
        {
          page: page.pageNumber,
          text,
          rects: line.segments.map((s) => s.bbox),
          source: line.segments.some((s) => s.source === "ocr") ? "ocr" : "pdf",
        },
      ];
    }),
  );
}

/** 2つの行の、文字ごとの違い */
function charParts(previous: string, current: string): { previous: DiffPart[]; current: DiffPart[] } {
  const parts = { previous: [] as DiffPart[], current: [] as DiffPart[] };
  for (const change of diffChars(previous, current)) {
    if (!change.added) parts.previous.push({ text: change.value, changed: change.removed });
    if (!change.removed) parts.current.push({ text: change.value, changed: change.added });
  }
  return parts;
}

/** 削除された行と追加された行のまとまりを、差分の行にする */
function pairChanges(removed: DocumentLine[], added: DocumentLine[]): TextDiffRow[] {
  // 続けて読むと同じなら、改行の位置が違うだけなので差分にしない
  if (removed.map((l) => l.text).join("") === added.map((l) => l.text).join("")) {
    return Array.from({ length: Math.max(removed.length, added.length) }, (_, i) => ({
      kind: "same" as const,
      previous: removed[i],
      current: added[i],
    }));
  }
  const rows: TextDiffRow[] = [];
  const paired = Math.min(removed.length, added.length);
  for (let i = 0; i < paired; i++) {
    const previous = removed[i];
    const current = added[i];
    if (previous && current) rows.push({ kind: "changed", previous, current, parts: charParts(previous.text, current.text) });
  }
  for (const previous of removed.slice(paired)) rows.push({ kind: "removed", previous });
  for (const current of added.slice(paired)) rows.push({ kind: "added", current });
  return rows;
}

/** 前回と今回の行を比べる。結果は今回の書類の順(削除された行は、前回の位置に入る) */
export function diffDocumentLines(previous: readonly DocumentLine[], current: readonly DocumentLine[]): TextDiffRow[] {
  const changes = diffArrays([...previous], [...current], { comparator: (a, b) => a.text === b.text });
  const rows: TextDiffRow[] = [];
  let i = 0;
  let j = 0;
  let removed: DocumentLine[] = [];
  let added: DocumentLine[] = [];
  const flush = () => {
    rows.push(...pairChanges(removed, added));
    removed = [];
    added = [];
  };
  for (const change of changes) {
    const count = change.count ?? change.value.length;
    if (change.removed) {
      removed.push(...previous.slice(i, i + count));
      i += count;
    } else if (change.added) {
      added.push(...current.slice(j, j + count));
      j += count;
    } else {
      flush();
      for (let k = 0; k < count; k++) rows.push({ kind: "same", previous: previous[i + k], current: current[j + k] });
      i += count;
      j += count;
    }
  }
  flush();
  return rows;
}

export function countTextDiffs(rows: readonly TextDiffRow[]): Record<Exclude<TextDiffKind, "same">, number> {
  return {
    changed: rows.filter((r) => r.kind === "changed").length,
    added: rows.filter((r) => r.kind === "added").length,
    removed: rows.filter((r) => r.kind === "removed").length,
  };
}
