import { readFile } from "node:fs/promises";
import fontkit from "@pdf-lib/fontkit";
import {
  degrees,
  PDFDocument,
  popGraphicsState,
  pushGraphicsState,
  setTextRenderingMode,
  TextRenderingMode,
} from "pdf-lib";
import { A4_CSS_PX, type ScannedPage } from "./render.ts";

// pdf-lib でスキャンPDF・透明テキスト付きPDF・混在PDFを組み立てる。

const A4_PT = { width: 595.28, height: 841.89 };
const PT_PER_CSS_PX = 72 / 96;

/** 透明テキストに使う日本語フォント(macOS標準)。サブセットだけを埋め込む */
const JAPANESE_FONT = "/System/Library/Fonts/Supplemental/Arial Unicode.ttf";

/** 画像だけのPDF(スキャンPDF) */
export async function buildScanPdf(scans: ScannedPage[]): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  for (const scan of scans) {
    const image = await doc.embedJpg(scan.jpeg);
    const page = doc.addPage([A4_PT.width, A4_PT.height]);
    page.drawImage(image, { x: 0, y: 0, width: A4_PT.width, height: A4_PT.height });
  }
  return doc.save();
}

/**
 * 透明テキスト付きPDF(サーチャブルPDF)。複合機のOCR機能が作るものと同じく、
 * スキャン画像の上に、見えない文字(テキスト描画モード3)を重ねる。
 */
export async function buildSearchablePdf(scan: ScannedPage, skewDegrees: number): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  const font = await doc.embedFont(await readFile(JAPANESE_FONT), { subset: true });
  const image = await doc.embedJpg(scan.jpeg);
  const page = doc.addPage([A4_PT.width, A4_PT.height]);
  page.drawImage(image, { x: 0, y: 0, width: A4_PT.width, height: A4_PT.height });

  // 画像は中心を軸に傾けてあるので、文字の位置も同じだけ回転させる
  const angle = (skewDegrees * Math.PI) / 180;
  const cx = A4_CSS_PX.width / 2;
  const cy = A4_CSS_PX.height / 2;

  page.pushOperators(pushGraphicsState(), setTextRenderingMode(TextRenderingMode.Invisible));
  for (const box of scan.textBoxes) {
    const size = box.height * PT_PER_CSS_PX * 0.8;
    // 文字列の左下(ベースライン付近)を基準点にする
    const dx = box.x - cx;
    const dy = box.y + box.height * 0.85 - cy;
    const x = cx + dx * Math.cos(angle) - dy * Math.sin(angle);
    const y = cy + dx * Math.sin(angle) + dy * Math.cos(angle);
    page.drawText(box.text, {
      x: x * PT_PER_CSS_PX,
      y: A4_PT.height - y * PT_PER_CSS_PX,
      size,
      font,
      rotate: degrees(-skewDegrees),
    });
  }
  page.pushOperators(popGraphicsState());
  return doc.save();
}

/** 複数のPDFのページを順に1つにまとめる(テキストPDFとスキャンPDFの混在用) */
export async function concatPdfs(sources: Uint8Array[]): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  for (const bytes of sources) {
    const src = await PDFDocument.load(bytes);
    const pages = await doc.copyPages(src, src.getPageIndices());
    for (const p of pages) doc.addPage(p);
  }
  return doc.save();
}
