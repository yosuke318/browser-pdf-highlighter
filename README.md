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
```

`npm test` には、ダミーPDFを使ったリグレッションテストも含まれます。仕組みと、実データの扱いのルールは [samples/README.md](samples/README.md) を見てください。

CI(GitHub Actions)では、上のチェックとビルドをすべて実行します。

## 外部への通信をしない仕組み

- PDF はブラウザの File API で読み込み、どこにも送信しません
- pdf.js の worker と、実行時に読み込むデータファイル(CMap・標準フォント・wasm・ICCプロファイル)は、
  CDN を使わずアプリと同じオリジンから配信します(`vite-plugins/pdfjs-assets.ts`)
- PDF に埋め込まれた JavaScript を実行するためのファイルは配信しません
