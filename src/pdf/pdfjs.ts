import { GlobalWorkerOptions, getDocument, type PDFDocumentProxy } from "pdfjs-dist";
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";

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
  };
}

/** ローカルのファイルを読み込む。ファイルの中身はブラウザの外へ送信しない */
export async function openPdf(file: File): Promise<PDFDocumentProxy> {
  const data = new Uint8Array(await file.arrayBuffer());
  return getDocument({ ...documentOptions(), data }).promise;
}
