import { PDFArray, type PDFDict, PDFDocument, PDFHexString, PDFName, type PDFRef, PDFString } from "pdf-lib";
import { type Rect, unionRect } from "../text/types.ts";

// 元のPDFに、ハイライト注釈(/Subtype /Highlight)を書き足す。
// 注釈は Acrobat やプレビュー.app などで普通のハイライトとして表示され、コメントに項目名と値が出る。
// ページの中身(文字や画像)は変えずに、注釈だけを足す。

/** PDFに書き込むハイライト注釈ひとつ分 */
export interface PdfHighlightAnnotation {
  /** 1始まりのページ番号 */
  page: number;
  /** PDFページ座標の長方形。値が複数のセルに分かれていれば、セルごと */
  rects: Rect[];
  /** 塗る色(0〜1 の RGB) */
  color: [number, number, number];
  /** 注釈の作成者の欄に出す文字列 */
  title: string;
  /** 注釈の件名 */
  subject: string;
  /** コメントの本文 */
  contents: string;
}

export class AnnotatePdfError extends Error {
  constructor(
    message: string,
    readonly kind: "encrypted" | "broken",
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = "AnnotatePdfError";
  }
}

const round = (n: number) => Math.round(n * 100) / 100;
/** 色は 0〜255 に戻したときにずれないよう、小数第3位までにする */
const roundColor = (c: number) => Math.round(c * 1000) / 1000;

/**
 * 長方形ごとの4つの角(QuadPoints)。順番は左上・右上・左下・右下。
 * PDFの仕様書の説明とは順番が違うが、Acrobat をはじめ多くの閲覧ソフトがこの順番で書き、読む
 */
function quadPoints(rects: readonly Rect[]): number[] {
  return rects.flatMap((r) => [r.x0, r.y1, r.x1, r.y1, r.x0, r.y0, r.x1, r.y0].map(round));
}

/**
 * 注釈の見た目(appearance stream)。描画データを持たない注釈を自分で描かない閲覧ソフトがあるため、入れておく。
 * 乗算で塗るので、下の文字が隠れない
 */
function appearance(doc: PDFDocument, box: Rect, a: PdfHighlightAnnotation): PDFRef {
  const [r, g, b] = a.color.map(roundColor);
  const fills = a.rects
    .map((rect) => `${round(rect.x0)} ${round(rect.y0)} ${round(rect.x1 - rect.x0)} ${round(rect.y1 - rect.y0)} re f`)
    .join("\n");
  const stream = doc.context.stream(`/GS0 gs\n${r} ${g} ${b} rg\n${fills}\n`, {
    Type: "XObject",
    Subtype: "Form",
    BBox: [box.x0, box.y0, box.x1, box.y1].map(round),
    Resources: { ExtGState: { GS0: { Type: "ExtGState", BM: "Multiply" } } },
  });
  return doc.context.register(stream);
}

/** PDFの日付の形式(D:YYYYMMDDHHmmSSZ) */
function pdfDate(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `D:${date.getUTCFullYear()}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}${pad(date.getUTCHours())}${pad(date.getUTCMinutes())}${pad(date.getUTCSeconds())}Z`;
}

function addAnnotation(doc: PDFDocument, page: PDFDict, pageRef: PDFRef, a: PdfHighlightAnnotation, index: number, now: Date) {
  const box = unionRect(a.rects);
  if (!box) return;
  const annotation = doc.context.obj({
    Type: "Annot",
    Subtype: "Highlight",
    Rect: [box.x0, box.y0, box.x1, box.y1].map(round),
    QuadPoints: quadPoints(a.rects),
    C: a.color.map(roundColor),
    // 印刷するときも表示する
    F: 4,
    P: pageRef,
    M: PDFString.of(pdfDate(now)),
    NM: PDFString.of(`pdf-extraction-viewer-${index + 1}`),
    T: PDFHexString.fromText(a.title),
    Subj: PDFHexString.fromText(a.subject),
    Contents: PDFHexString.fromText(a.contents),
    AP: { N: appearance(doc, box, a) },
  });
  const ref = doc.context.register(annotation);
  const annots = page.lookup(PDFName.of("Annots"));
  if (annots instanceof PDFArray) annots.push(ref);
  else page.set(PDFName.of("Annots"), doc.context.obj([ref]));
}

/**
 * PDFのデータにハイライト注釈を書き足して、新しいPDFのデータを返す。
 * 編集が制限された(暗号化された)PDFや、読めないPDFは AnnotatePdfError にする
 */
export async function addHighlightAnnotations(
  data: Uint8Array,
  annotations: readonly PdfHighlightAnnotation[],
  now: Date = new Date(),
): Promise<Uint8Array> {
  let doc: PDFDocument;
  try {
    // 作成日時・作成ソフトなどの文書情報は、元のPDFのままにする。
    // 暗号化されているかは読み込んだ後に isEncrypted で調べる(pdf-lib は ES5 向けにビルドされていて、
    // 読み込みで投げるエラーを instanceof で見分けられないため)
    doc = await PDFDocument.load(data, { updateMetadata: false, ignoreEncryption: true });
  } catch (cause) {
    throw new AnnotatePdfError("PDFを読み込めなかったため、ハイライトを書き込めません。", "broken", { cause });
  }
  if (doc.isEncrypted) {
    throw new AnnotatePdfError("編集が制限されたPDFのため、ハイライトを書き込めません。", "encrypted");
  }
  const pages = doc.getPages();
  annotations.forEach((a, index) => {
    const page = pages[a.page - 1];
    if (page) addAnnotation(doc, page.node, page.ref, a, index, now);
  });
  return doc.save();
}
