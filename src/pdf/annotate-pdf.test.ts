import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { PDFDocument } from "pdf-lib";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { describe, expect, it } from "vitest";
import type { FieldResult } from "../extract/engine.ts";
import { annotatedFileName, annotationsFromReviewed } from "../highlight/pdf-annotations.ts";
import { reviewFields } from "../results/review.ts";
import { AnnotatePdfError, addHighlightAnnotations, type PdfHighlightAnnotation } from "./annotate-pdf.ts";
import { buildTestPdf } from "./test-fixtures/test-pdf.ts";

// ハイライト付きPDFの書き出し: 抽出結果から注釈を作ること、PDFにハイライト注釈として書き込めること。
// 書き込んだPDFは pdf.js で読み直し、閲覧ソフトから注釈の種類・位置・コメントが読めることを確かめる。

const PDFJS_ROOT = dirname(createRequire(import.meta.url).resolve("pdfjs-dist/package.json"));

async function readAnnotations(data: Uint8Array, pageNumber: number) {
  // pdf.js は渡したデータを worker へ移すので、写しを渡す
  const task = getDocument({ data: data.slice(), cMapUrl: join(PDFJS_ROOT, "cmaps/"), cMapPacked: true });
  try {
    const page = await (await task.promise).getPage(pageNumber);
    return await page.getAnnotations();
  } finally {
    await task.destroy();
  }
}

function field(key: string, overrides: Partial<FieldResult>): FieldResult {
  return { key, label: key, type: "text", required: false, found: true, bbox: [], warnings: [], ...overrides };
}

const box = { x0: 100, y0: 700, x1: 200, y1: 720 };
const cell = { x0: 220, y0: 700, x1: 260, y1: 720 };

describe("抽出結果からハイライト注釈を作る", () => {
  const fields = [
    field("name", { label: "氏名", value: "山田 太郎", rawText: "山田 太郎", page: 1, bbox: [box], confidence: 1 }),
    field("paymentAmount", {
      label: "支払金額",
      type: "money",
      value: 5_800_000,
      rawText: "5,800,000",
      page: 2,
      bbox: [box, cell],
      confidence: 0.6,
    }),
    field("birthDate", { label: "生年月日", type: "date", value: "1990-04-01", rawText: "1990年4月1日", page: 1, bbox: [box] }),
    field("address", { label: "住所", found: false }),
  ];

  it("見つかった項目ごとに、項目名・値・確認の状態をコメントに入れ、種類ごとの色で塗る", () => {
    const items = reviewFields(fields, {
      name: { confirmed: true },
      birthDate: { confirmed: true, edit: { value: "1990-04-02", rawText: "1990-04-02" } },
    });
    const annotations = annotationsFromReviewed("給与所得の源泉徴収票", "g1", "withholding-slip", items);
    expect(annotations.map((a) => [a.page, a.contents])).toEqual([
      [1, "氏名: 山田 太郎\n状態: 確認済み"],
      [1, "生年月日: 1990-04-02\n状態: 手動修正済み(元の読取値: 1990-04-01)"],
      [2, "支払金額: 5,800,000円\n状態: 要確認"],
    ]);
    expect(annotations[0]).toMatchObject({ title: "給与所得の源泉徴収票", subject: "氏名", rects: [box] });
    expect(annotations[0]?.color.map((c) => Math.round(c * 255))).toEqual([0xff, 0xe4, 0x5c]);
    // セルに分かれた値は、セルごとの長方形を1つの注釈にまとめる
    expect(annotations[2]?.rects).toEqual([box, cell]);
  });

  it("ファイル名", () => {
    expect(annotatedFileName("源泉徴収票_2025.pdf")).toBe("源泉徴収票_2025.highlighted.pdf");
  });
});

describe("PDFにハイライト注釈を書き込む", () => {
  const annotation = (overrides: Partial<PdfHighlightAnnotation>): PdfHighlightAnnotation => ({
    page: 1,
    rects: [box],
    color: [1, 0.894, 0.361],
    title: "給与所得の源泉徴収票",
    subject: "氏名",
    contents: "氏名: 山田 太郎\n状態: 確認済み",
    ...overrides,
  });

  it("ハイライト注釈として、位置・色・日本語のコメントを読み取れる", async () => {
    const data = await addHighlightAnnotations(buildTestPdf([{ text: "page one" }, { text: "page two" }]), [
      annotation({}),
      annotation({ page: 2, rects: [box, cell], subject: "年収・所得", contents: "支払金額: 5,800,000円" }),
    ]);

    const [first] = await readAnnotations(data, 1);
    expect(first).toMatchObject({
      subtype: "Highlight",
      rect: [100, 700, 200, 720],
      titleObj: { str: "給与所得の源泉徴収票" },
      contentsObj: { str: "氏名: 山田 太郎\n状態: 確認済み" },
      color: new Uint8ClampedArray([255, 228, 92]),
      hasAppearance: true,
    });

    const second = await readAnnotations(data, 2);
    expect(second).toHaveLength(1);
    expect(second[0]).toMatchObject({ subtype: "Highlight", rect: [100, 700, 260, 720] });
    // セルごとに4つの角(左上・右上・左下・右下)
    expect(Array.from(second[0]?.quadPoints ?? [])).toEqual([
      100, 720, 200, 720, 100, 700, 200, 700, 220, 720, 260, 720, 220, 700, 260, 700,
    ]);
  });

  it("元からある注釈は残したまま、足す", async () => {
    const once = await addHighlightAnnotations(buildTestPdf([{ text: "page one" }]), [annotation({})]);
    const twice = await addHighlightAnnotations(once, [annotation({ contents: "2つめ" })]);
    expect((await readAnnotations(twice, 1)).map((a) => a.contentsObj.str)).toEqual(["氏名: 山田 太郎\n状態: 確認済み", "2つめ"]);
  });

  it("回転したページでも、PDFの座標のまま書き込む(閲覧ソフトがページと一緒に回転させる)", async () => {
    const data = await addHighlightAnnotations(buildTestPdf([{ text: "page one", rotate: 90 }]), [annotation({})]);
    const [first] = await readAnnotations(data, 1);
    expect(first?.rect).toEqual([100, 700, 200, 720]);
  });

  it("ページの数を超える注釈は書き込まない", async () => {
    const data = await addHighlightAnnotations(buildTestPdf([{ text: "page one" }]), [annotation({ page: 3 })]);
    expect(await readAnnotations(data, 1)).toEqual([]);
  });

  it("元のページの中身と文書情報は変えない", async () => {
    const source = await PDFDocument.create();
    source.addPage([300, 400]);
    source.setTitle("元のタイトル");
    source.setProducer("元の作成ソフト");
    const data = await addHighlightAnnotations(await source.save(), [
      annotation({ rects: [{ x0: 10, y0: 10, x1: 50, y1: 30 }] }),
    ]);
    const reloaded = await PDFDocument.load(data, { updateMetadata: false });
    expect(reloaded.getTitle()).toBe("元のタイトル");
    expect(reloaded.getProducer()).toBe("元の作成ソフト");
    expect(reloaded.getPage(0).getSize()).toEqual({ width: 300, height: 400 });
  });

  it("暗号化された(編集が制限された)PDFは、理由を付けて失敗する", async () => {
    const plain = new TextDecoder().decode(buildTestPdf([{ text: "page one" }]));
    const encrypted = new TextEncoder().encode(
      plain.replace("/Root 1 0 R >>", "/Root 1 0 R /Encrypt << /Filter /Standard /V 1 /R 2 >> >>"),
    );
    const error = await addHighlightAnnotations(encrypted, [annotation({})]).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(AnnotatePdfError);
    expect((error as AnnotatePdfError).kind).toBe("encrypted");
  });

  it("PDFとして読めないデータは、理由を付けて失敗する", async () => {
    const error = await addHighlightAnnotations(new TextEncoder().encode("not a pdf"), [annotation({})]).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(AnnotatePdfError);
    expect((error as AnnotatePdfError).kind).toBe("broken");
  });
});
