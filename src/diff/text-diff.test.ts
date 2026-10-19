import { describe, expect, it } from "vitest";
import type { TextSegment } from "../text/types.ts";
import { countTextDiffs, type DocumentLine, diffDocumentLines, documentLines } from "./text-diff.ts";

/** 上から順に並んだ行(1行に1つのセル) */
function seg(text: string, row: number, x = 50, source: "pdf" | "ocr" = "pdf"): TextSegment {
  const y1 = 800 - row * 20;
  const bbox = { x0: x, y0: y1 - 12, x1: x + 12 * [...text].length, y1 };
  return { text, bbox, charBoxes: [...text].map(() => bbox), confidence: 1, source };
}

function lines(texts: string[]): DocumentLine[] {
  return documentLines([{ pageNumber: 1, segments: texts.map((t, i) => seg(t, i)) }]);
}

const kinds = (rows: ReturnType<typeof diffDocumentLines>) => rows.map((r) => r.kind);

describe("documentLines", () => {
  it("同じ高さのセルを1行にまとめ、空白を除いて正規化する", () => {
    const result = documentLines([{ pageNumber: 2, segments: [seg("特記事項", 0), seg("ペット可", 0, 200), seg("⽀払 金額", 1)] }]);
    expect(result.map((l) => l.text)).toEqual(["特記事項ペット可", "支払金額"]);
    expect(result[0]?.page).toBe(2);
    expect(result[0]?.rects).toHaveLength(2);
  });

  it("OCR のセルを含む行は source を ocr にする", () => {
    expect(documentLines([{ pageNumber: 1, segments: [seg("備考", 0, 50, "ocr")] }])[0]?.source).toBe("ocr");
  });
});

describe("diffDocumentLines", () => {
  it("同じ行は same、書き換わった行は changed にして、変わった文字を示す", () => {
    const rows = diffDocumentLines(lines(["入居申込書", "特記事項:ペット不可", "以上"]), lines(["入居申込書", "特記事項:ペット可", "以上"]));
    expect(kinds(rows)).toEqual(["same", "changed", "same"]);
    expect(rows[1]?.parts?.previous.filter((p) => p.changed).map((p) => p.text)).toEqual(["不"]);
    expect(rows[1]?.parts?.current.every((p) => !p.changed)).toBe(true);
  });

  it("増えた行は added、なくなった行は removed にする", () => {
    const rows = diffDocumentLines(lines(["A", "B", "C"]), lines(["A", "C", "D"]));
    expect(kinds(rows)).toEqual(["same", "removed", "same", "added"]);
    expect(countTextDiffs(rows)).toEqual({ changed: 0, added: 1, removed: 1 });
  });

  it("空白・全角と半角の違いは差分にしない", () => {
    const rows = diffDocumentLines(lines(["賃料 85,000円"]), lines(["賃料８５，０００円"]));
    expect(kinds(rows)).toEqual(["same"]);
  });

  it("改行の位置だけが違うときは差分にしない", () => {
    const rows = diffDocumentLines(
      lines(["本申込書は契約締結後、", "建物賃貸借契約書の一部として取り扱います。"]),
      lines(["本申込書は契約締結後、建物賃貸借契約書の", "一部として取り扱います。"]),
    );
    expect(kinds(rows)).toEqual(["same", "same"]);
  });

  it("空のときは空", () => {
    expect(diffDocumentLines([], [])).toEqual([]);
  });
});
