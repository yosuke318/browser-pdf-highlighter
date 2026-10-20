# browser-pdf-highlighter
Extract key fields from PDFs and highlight them, entirely in your browser. Rule-based (regex + coordinates), with diff against previous documents.

## 開発

Node.js 22 以上が必要です。

```bash
npm install
npm run dev          # 開発サーバー(http://localhost:5173)
npm run build        # dist/ に静的ファイルを出力
npm run preview      # ビルド結果をローカルで確認
```

## チェック

```bash
npm run lint         # Biome による Lint とフォーマットの確認(npm run format で自動修正)
npm run typecheck    # TypeScript の型チェック
npm test             # Vitest によるユニットテスト
npm run check:build  # dist/ が外部のURLから何も読み込まないことの確認(build の後に実行)
npm run check:files  # 実データらしいPDF・画像をリポジトリに入れていないことの確認
npm run samples:check  # ダミーPDFのページの種類と、正解データの形式の確認
npm run test:e2e     # E2Eテスト: PDFの処理中に外部ドメインへの通信がないことの確認(build の後に実行)
```

`npm test` には、ダミーPDFを使ったリグレッションテストも含まれます。仕組みと、実データの扱いのルールは [samples/README.md](samples/README.md) を見てください。

CI(GitHub Actions)では、上のチェックとビルドをすべて実行します。

## 外部への通信をしない仕組み

- PDF はブラウザの File API で読み込み、どこにも送信しません
- pdf.js の worker と、実行時に読み込むデータファイル(CMap・標準フォント・wasm・ICCプロファイル)は、
  CDN を使わずアプリと同じオリジンから配信します(`vite-plugins/pdfjs-assets.ts`)
- PDF に埋め込まれた JavaScript を実行するためのファイルは配信しません
- スキャンPDFの OCR(tesseract.js)も、ブラウザの中で行います。OCR の worker・文字認識の本体(WebAssembly)・
  日本語の学習データも、CDN を使わずアプリと同じオリジンから配信します(`vite-plugins/tesseract-assets.ts`)
- コンテンツセキュリティポリシー(CSP)で、読み込みと通信をアプリと同じオリジンだけに限っています
  (`vite-plugins/security-headers.ts`)。ビルドした `index.html` に `<meta>` で入れるほか、`npm run preview` の応答と
  Cloudflare Pages 用の `dist/_headers` にもヘッダーで付けます(worker には `<meta>` が効かないため)。
  開発サーバー(`npm run dev`)では付けません
- アナリティクス・外部フォント・CDN は使いません。フォントもアプリに同梱しています
- 抽出した値や読み込んだPDFは、ブラウザの保存領域(localStorage・sessionStorage・IndexedDB)に保存しません。
  画面を閉じると消えます。残したいときは、利用者が「JSONで保存」で自分の端末に書き出します
- 保存領域に残すのは、ヘッダーで選んだ画面のテーマ(標準・魔法の書庫)だけです。魔法の書庫を選んだときだけ
  localStorage の `theme` に保存し、標準に戻すと消します(`src/theme/theme.ts`)
- E2Eテスト(`e2e/network.spec.ts`)で、スキャンPDFの OCR と前回の資料との比較を行い、その間に外部ドメインへの
  リクエストと CSP の違反が1件もないこと、ブラウザの保存領域に何も残っていないことを確かめます

### E2Eテストを手元で動かすとき

インストール済みの Google Chrome を使います(ブラウザのダウンロードは不要)。
Apple Silicon の Mac では、arm64 版の Node.js を使ってください。Intel 版の Node.js から起動すると、Chrome も
Intel 版として Rosetta の変換を通して動くため、OCR に10倍ほどの時間がかかります
(`node -p process.arch` が `arm64` なら問題ありません)。
