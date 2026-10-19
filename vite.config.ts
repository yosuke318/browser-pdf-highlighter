import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";
import { pdfjsAssets } from "./vite-plugins/pdfjs-assets.ts";
import { tesseractAssets } from "./vite-plugins/tesseract-assets.ts";

export default defineConfig({
  // どのパスに置いても動くように、相対パスで出力する
  base: "./",
  plugins: [react(), pdfjsAssets(), tesseractAssets()],
  build: {
    // pdf.js の worker が ES モジュールなので、モジュールワーカーに対応したブラウザを対象にする
    target: "es2022",
    sourcemap: true,
  },
  test: {
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
    // 変換したファイルをディスクに保存して再利用する仕組みは、ファイルの中身が変わらないと作り直されない。
    // 書類定義を読み込む import.meta.glob は、src/extract/definitions/ にファイルを足しても
    // load-definitions.ts の中身は変わらないので、足した書類定義が読み込まれなくなる。そのため使わない
    fsModuleCache: false,
  },
});
