import { GlobalWorkerOptions, getDocument, OPS, type PDFDocumentProxy, type PDFPageProxy } from "pdfjs-dist";
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import { classifyPdfjsError, hasPdfSignature, OpenPdfError } from "./open-file.ts";
import { type PageReading, readPage } from "./read-page.ts";

// pdf.js の初期設定。worker とデータファイルは、すべてこのアプリと同じオリジンから読み込む
// (データファイルの配信は vite-plugins/pdfjs-assets.ts)。

GlobalWorkerOptions.workerSrc = workerUrl;

/**
 * データファイルの URL。
 * worker 内でも読み込まれるため、相対パスではなく絶対 URL にする
 * (相対パスのままだと、worker のスクリプトの場所を基準に解決されてしまう)。
 */
function assetUrl(dir: string): string {
  return new URL(`${import.meta.env.BASE_URL}pdfjs/${dir}/`, document.baseURI).href;
}

export function documentOptions() {
  return {
    cMapUrl: assetUrl("cmaps"),
    cMapPacked: true,
    standardFontDataUrl: assetUrl("standard_fonts"),
    wasmUrl: assetUrl("wasm"),
    iccUrl: assetUrl("iccs"),
    // フォントの描画を速くするための eval を使わない(CSP で eval を禁止しているため)
    isEvalSupported: false,
  };
}

/**
 * ローカルのファイルを読み込む。ファイルの中身はブラウザの外へ送信しない。
 * 失敗したときは、理由の種類を持った OpenPdfError を投げる。
 */
export async function openPdf(file: File): Promise<PDFDocumentProxy> {
  const data = new Uint8Array(await file.arrayBuffer());
  if (!hasPdfSignature(data)) throw new OpenPdfError("not-pdf");
  try {
    return await getDocument({ ...documentOptions(), data }).promise;
  } catch (cause) {
    throw new OpenPdfError(classifyPdfjsError(cause), { cause });
  }
}

/** ページの種類を判別し、pdf.js で文字と座標を取り出す */
export function readPdfPage(page: PDFPageProxy): Promise<PageReading> {
  return readPage(page, OPS);
}
