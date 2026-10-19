import type { ImageLike, Worker } from "tesseract.js";
import type { Recognize } from "./ocr-page.ts";
import type { GrayImage } from "./preprocess.ts";
import { linesFromBlocks } from "./segments.ts";

// tesseract.js の worker を、OCR の流れ(ocr-page.ts)で使える形にする。
// ブラウザとNode.js(テスト)で画像の渡し方が違うので、変換する関数を受け取る。

/** 日本語の学習データ(@tesseract.js-data/jpn)のうち使うもの。精度の高い best を整数化した版(約2MB) */
export const JPN_DATA_DIR = "4.0.0_best_int";

export function tesseractRecognizer(worker: Worker, toImage: (image: GrayImage) => Promise<ImageLike>): Recognize {
  return async (image) => {
    const result = await worker.recognize(await toImage(image), {}, { blocks: true, text: false });
    return linesFromBlocks(result.data.blocks);
  };
}
