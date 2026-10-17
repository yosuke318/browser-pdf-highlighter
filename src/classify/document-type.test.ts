import { describe, expect, it } from "vitest";
import { loadManifest, readSample } from "../test-support/samples.ts";
import type { TextSegment } from "../text/types.ts";
import { DOCUMENT_KEYWORDS, DOCUMENT_TYPES, guessDocumentType } from "./document-type.ts";

/** 横書きのセル。size は文字の大きさ(高さ) */
function cell(text: string, y: number, size = 8): TextSegment {
  return {
    text,
    bbox: { x0: 50, y0: y, x1: 50 + [...text].length * size, y1: y + size },
    charBoxes: [],
    confidence: 1,
    source: "pdf",
  };
}

describe("書類タイプの判定", () => {
  it("書類名と欄の名前から判定し、根拠を返す", () => {
    const guess = guessDocumentType([cell("給与所得の源泉徴収票", 780, 12), cell("支払金額", 700), cell("源泉徴収税額", 690)]);
    expect(guess.documentId).toBe("withholding-slip");
    const first = guess.candidates[0];
    expect(first?.hits.map((h) => h.label)).toEqual(["給与所得の源泉徴収票", "源泉徴収票", "源泉徴収税額"]);
    // 大きな文字で書かれた書類名は点数を倍にする
    expect(first?.hits[0]).toMatchObject({ inTitle: true, weight: 20 });
  });

  it("本文でほかの書類に触れているだけなら、タイトルの書類を選ぶ", () => {
    const guess = guessDocumentType([
      cell("住宅ローン借入申込書", 780, 15),
      cell("提出書類: 源泉徴収票(直近1年分)", 300),
      cell("返済期間", 600),
    ]);
    expect(guess.documentId).toBe("home-loan-application");
    expect(guess.candidates.map((c) => c.documentId)).toContain("withholding-slip");
  });

  it("全角・康熙部首・空白の違いがあっても見つける", () => {
    expect(guessDocumentType([cell("⼊ 居 申 込 書", 780, 15), cell("連帯保証⼈", 600)]).documentId).toBe("rental-application");
  });

  it("課税証明書の表記ゆれ(「課税(所得)証明書」「所得証明書」)を見分ける", () => {
    expect(guessDocumentType([cell("課税(所得)証明書", 780, 15)]).documentId).toBe("tax-certificate");
    expect(guessDocumentType([cell("所得証明書", 780, 15)]).documentId).toBe("tax-certificate");
  });

  it("様式が似ている別の書類(退職所得の源泉徴収票)は、源泉徴収票と判定しない", () => {
    const guess = guessDocumentType([cell("退職所得の源泉徴収票", 780, 12), cell("支払金額", 700)]);
    expect(guess.documentId).toBeNull();
  });

  it("文字がないページ(スキャンPDF)は判定しない", () => {
    expect(guessDocumentType([])).toEqual({ documentId: null, candidates: [], reason: "no-text" });
  });

  it("手がかりが少なければ判定しない", () => {
    expect(guessDocumentType([cell("号室", 700)])).toMatchObject({ documentId: null, reason: "low-score" });
  });

  it("候補が拮抗していれば判定しない", () => {
    const guess = guessDocumentType([cell("確定申告書", 700), cell("入居申込書", 690)]);
    expect(guess).toMatchObject({ documentId: null, reason: "close-candidates" });
    expect(guess.candidates).toHaveLength(2);
  });

  it("判定する書類タイプは、抽出項目の定義にある書類と同じ", () => {
    expect(Object.keys(DOCUMENT_KEYWORDS).sort()).toEqual(DOCUMENT_TYPES.map((t) => t.id).sort());
  });
});

describe("ダミーPDFの判定", async () => {
  const manifest = await loadManifest();

  it.each(manifest.map((e) => [e.file, e] as const))("%s", async (_, entry) => {
    const pages = await readSample(entry.file);
    const guesses = pages.map((p) => (p.classification.method === "pdf" ? guessDocumentType(p.pdfSegments).documentId : "(OCR)"));
    // テキストPDFのページは書類タイプを判定でき、OCR で読むページ(まだ文字がない)は判定しない
    const expected = entry.pages.map((kind, i) => {
      if (kind !== "text") return "(OCR)";
      // 混在PDFの1ページ目は確定申告書
      if (entry.file === "pdf-kinds/mixed.pdf" && i === 0) return "tax-return";
      return entry.documentId;
    });
    expect(guesses).toEqual(expected);
  });
});
