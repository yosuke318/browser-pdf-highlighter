import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { createCanvas } from "@napi-rs/canvas";
import type { PDFPageProxy } from "pdfjs-dist";
import { createWorker, OEM, type Worker } from "tesseract.js";
import { OCR_DPI, type OcrReading, ocrRenderedPage } from "../ocr/ocr-page.ts";
import type { GrayImage } from "../ocr/preprocess.ts";
import { JPN_DATA_DIR, tesseractRecognizer } from "../ocr/tesseract.ts";

// テストからダミーのスキャンPDFを OCR するための補助。Node.js でだけ使う。
// ページの描画には pdf.js が使う @napi-rs/canvas を、文字認識には tesseract.js を使う(ブラウザと同じ学習データ)。

const LANG_PATH = join(dirname(createRequire(import.meta.url).resolve("@tesseract.js-data/jpn/package.json")), JPN_DATA_DIR);

let worker: Promise<Worker> | null = null;

function getWorker(): Promise<Worker> {
  worker ??= createWorker("jpn", OEM.LSTM_ONLY, { langPath: LANG_PATH, cacheMethod: "none", gzip: true });
  return worker;
}

/** テストの最後に worker を止める */
export async function terminateOcr(): Promise<void> {
  const current = worker;
  worker = null;
  if (current) await (await current).terminate();
}

async function toPng(image: GrayImage): Promise<Buffer> {
  const canvas = createCanvas(image.width, image.height);
  const ctx = canvas.getContext("2d");
  const data = ctx.createImageData(image.width, image.height);
  for (let i = 0; i < image.data.length; i++) {
    const v = image.data[i] ?? 255;
    data.data[i * 4] = v;
    data.data[i * 4 + 1] = v;
    data.data[i * 4 + 2] = v;
    data.data[i * 4 + 3] = 255;
  }
  ctx.putImageData(data, 0, 0);
  return canvas.encode("png");
}

/** ページを描画して OCR する(ブラウザの src/ocr/browser.ts と同じ手順) */
export async function ocrPdfPageInNode(page: PDFPageProxy): Promise<OcrReading> {
  // ページの /Rotate は反映しない(PDFページ座標と同じ向きで描く)
  const viewport = page.getViewport({ scale: OCR_DPI / 72, rotation: 0 });
  const width = Math.ceil(viewport.width);
  const height = Math.ceil(viewport.height);
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, width, height);
  await page.render({ canvas: canvas as never, canvasContext: ctx as never, viewport }).promise;
  const rgba = ctx.getImageData(0, 0, width, height).data;
  const recognize = tesseractRecognizer(await getWorker(), toPng);
  return ocrRenderedPage(
    { rgba, width, height, dpi: OCR_DPI, toPdf: (x, y) => viewport.convertToPdfPoint(x, y) as [number, number] },
    recognize,
  );
}
