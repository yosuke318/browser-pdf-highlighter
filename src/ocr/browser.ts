import type { PDFPageProxy } from "pdfjs-dist";
import { createWorker, OEM, type Worker } from "tesseract.js";
import { OCR_DPI, type OcrReading, ocrRenderedPage } from "./ocr-page.ts";
import type { GrayImage } from "./preprocess.ts";
import { tesseractRecognizer } from "./tesseract.ts";

// ブラウザで PDF のページを OCR する。
// tesseract.js の worker・文字認識の本体・学習データは、すべてこのアプリと同じオリジンから読み込む
// (配信は vite-plugins/tesseract-assets.ts)。ページの画像はブラウザの外へ送信しない。

/** 進み具合(0〜1)を受け取る関数 */
export type OcrProgress = (progress: number) => void;

function assetUrl(path: string): string {
  // worker の中で解決されるので、絶対 URL にする
  return new URL(`${import.meta.env.BASE_URL}tesseract/${path}`, document.baseURI).href;
}

let worker: Promise<Worker> | null = null;
let reportProgress: OcrProgress | null = null;

function getWorker(): Promise<Worker> {
  worker ??= createWorker("jpn", OEM.LSTM_ONLY, {
    workerPath: assetUrl("worker.min.js"),
    corePath: assetUrl("core/"),
    langPath: assetUrl("lang"),
    // worker のスクリプトを blob: URL 経由ではなく、同じオリジンの URL から直接読み込む
    workerBlobURL: false,
    // 学習データを IndexedDB に保存しない(ブラウザの通常のキャッシュに任せる)
    cacheMethod: "none",
    gzip: true,
    logger: (message) => {
      if (message.status === "recognizing text") reportProgress?.(message.progress);
    },
  }).catch((error: unknown) => {
    // 失敗したら、次の呼び出しで作り直す
    worker = null;
    throw error;
  });
  return worker;
}

function toCanvas(image: GrayImage): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = image.width;
  canvas.height = image.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas を使えません");
  const data = ctx.createImageData(image.width, image.height);
  for (let i = 0; i < image.data.length; i++) {
    const v = image.data[i] ?? 255;
    data.data[i * 4] = v;
    data.data[i * 4 + 1] = v;
    data.data[i * 4 + 2] = v;
    data.data[i * 4 + 3] = 255;
  }
  ctx.putImageData(data, 0, 0);
  return canvas;
}

/** ページを描画して OCR する。同時に1ページずつ呼ぶこと(worker は1つ) */
export async function ocrPdfPage(page: PDFPageProxy, onProgress?: OcrProgress): Promise<OcrReading> {
  // ページの /Rotate は反映しない(PDFページ座標と同じ向きで描く)
  const viewport = page.getViewport({ scale: OCR_DPI / 72, rotation: 0 });
  const canvas = document.createElement("canvas");
  canvas.width = Math.ceil(viewport.width);
  canvas.height = Math.ceil(viewport.height);
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("canvas を使えません");
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  await page.render({ canvas, canvasContext: ctx, viewport }).promise;
  const { width, height } = canvas;
  const rgba = ctx.getImageData(0, 0, width, height).data;
  // 大きな canvas のメモリをすぐに手放す
  canvas.width = 0;
  canvas.height = 0;

  reportProgress = onProgress ?? null;
  try {
    const recognize = tesseractRecognizer(await getWorker(), async (image) => toCanvas(image));
    return await ocrRenderedPage(
      { rgba, width, height, dpi: OCR_DPI, toPdf: (x, y) => viewport.convertToPdfPoint(x, y) as [number, number] },
      recognize,
    );
  } finally {
    reportProgress = null;
  }
}
