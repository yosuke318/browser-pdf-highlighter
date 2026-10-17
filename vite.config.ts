import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";
import { pdfjsAssets } from "./vite-plugins/pdfjs-assets.ts";

export default defineConfig({
  // どのパスに置いても動くように、相対パスで出力する
  base: "./",
  plugins: [react(), pdfjsAssets()],
  build: {
    // pdf.js の worker が ES モジュールなので、モジュールワーカーに対応したブラウザを対象にする
    target: "es2022",
    sourcemap: true,
  },
  test: {
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
  },
});
