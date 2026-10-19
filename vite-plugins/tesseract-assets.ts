import { createReadStream } from "node:fs";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, extname, join } from "node:path";
import type { Plugin } from "vite";

// OCR(tesseract.js)が実行時に読み込むファイルを、CDN ではなくこのアプリと同じオリジンから配信する Vite プラグイン。
// 開発サーバーでは node_modules から直接返し、ビルド時は dist/tesseract/ にコピーする。
//
// - worker.min.js: OCR を実行する Web Worker のスクリプト
// - core/: 文字認識の本体(WebAssembly を埋め込んだ JavaScript)。LSTM だけを使う版を、
//   ブラウザの対応状況(SIMD・Relaxed SIMD)に合わせて tesseract.js が1つ選んで読み込む
// - lang/jpn.traineddata.gz: 日本語の学習データ(src/ocr/tesseract.ts の JPN_DATA_DIR の版)

const URL_PREFIX = "tesseract";
const require = createRequire(import.meta.url);
const packageDir = (name: string) => dirname(require.resolve(`${name}/package.json`));

/** 配信するパス(tesseract/ からの相対パス) → node_modules のファイル */
export const TESSERACT_ASSETS: Record<string, string> = {
  "worker.min.js": join(packageDir("tesseract.js"), "dist/worker.min.js"),
  "core/tesseract-core-lstm.wasm.js": join(packageDir("tesseract.js-core"), "tesseract-core-lstm.wasm.js"),
  "core/tesseract-core-simd-lstm.wasm.js": join(packageDir("tesseract.js-core"), "tesseract-core-simd-lstm.wasm.js"),
  "core/tesseract-core-relaxedsimd-lstm.wasm.js": join(
    packageDir("tesseract.js-core"),
    "tesseract-core-relaxedsimd-lstm.wasm.js",
  ),
  // src/ocr/tesseract.ts の JPN_DATA_DIR と同じ版
  "lang/jpn.traineddata.gz": join(packageDir("@tesseract.js-data/jpn"), "4.0.0_best_int/jpn.traineddata.gz"),
};

const CONTENT_TYPES: Record<string, string> = {
  ".js": "text/javascript",
  // gzip のまま渡し、tesseract.js 側で展開する(Content-Encoding は付けない)
  ".gz": "application/octet-stream",
};

export function tesseractAssets(): Plugin {
  let base = "/";
  return {
    name: "tesseract-assets",
    configResolved(config) {
      base = config.base;
    },
    configureServer(server) {
      const mount = `${base}${URL_PREFIX}/`;
      server.middlewares.use((req, res, next) => {
        const url = req.url?.split("?")[0];
        if (!url?.startsWith(mount)) return next();
        // 一覧にあるファイルだけを返す(ディレクトリ外への参照もこれで防ぐ)
        const file = TESSERACT_ASSETS[decodeURIComponent(url.slice(mount.length))];
        if (!file) return next();
        res.setHeader("Content-Type", CONTENT_TYPES[extname(file)] ?? "application/octet-stream");
        createReadStream(file).pipe(res);
      });
    },
    async generateBundle() {
      for (const [path, file] of Object.entries(TESSERACT_ASSETS)) {
        this.emitFile({ type: "asset", fileName: `${URL_PREFIX}/${path}`, source: await readFile(file) });
      }
    },
  };
}
