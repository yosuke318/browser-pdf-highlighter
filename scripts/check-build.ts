// ビルドの成果物(dist/)が、外部のURLから何も読み込まないことを確かめる。
//   npm run build && npm run check:build
//
// 1. HTML と CSS の src / href / url() が、すべて相対パスか同じオリジンを指していること
// 2. JavaScript に含まれるURLが、下の一覧(読み込みには使われない文字列)だけであること
// 一覧にないURLが見つかったら失敗する。ライブラリの更新でURLが増えたときは、
// 実際に通信に使われるものかを確かめてから一覧に追加する。

import { readdir, readFile } from "node:fs/promises";
import { extname, join, relative } from "node:path";

const DIST = join(import.meta.dirname, "../dist");

/** 読み込みには使われないことを確認済みのURLのホスト名と、その理由 */
const ALLOWED_HOSTS: Record<string, string> = {
  "www.w3.org": "SVG・XML の名前空間(pdf.js、React)",
  "www.xfa.org": "XFA フォームの名前空間(pdf.js)",
  "ns.adobe.com": "XMP メタデータの名前空間(pdf.js)",
  "www.apache.org": "ライセンス表記(pdf.js)",
  "react.dev": "本番ビルドのエラーメッセージに入る説明ページのURL(React)",
  "example.com": "URL を解析するための仮のベースURL(pdf.js)",
  "foo.bar": "URL を解析するための仮のベースURL(pdf.js)",
  "cdn.jsdelivr.net":
    "worker・文字認識の本体・学習データの取得先の既定値(tesseract.js)。src/ocr/browser.ts ですべて同じオリジンの URL を指定しているので使われない",
  "github.com": "tesseract.js が取り込む package.json のリポジトリの URL(tesseract.js)",
  "opencollective.com": "tesseract.js が取り込む package.json の寄付先の URL(tesseract.js)",
  "rolldown.rs": "CommonJS の require を呼べないときのエラーメッセージに入る説明ページの URL(Vite のビルド)",
};

const URL_PATTERN = /\b(?:https?:)?\/\/([a-z0-9-]+(?:\.[a-z0-9-]+)+)/gi;
// HTML の src / href 属性と、CSS の url()
const RESOURCE_PATTERN = /(?:\b(?:src|href)\s*=\s*["']([^"']*)["'])|(?:url\(\s*["']?([^"')]*)["']?\s*\))/gi;

async function listFiles(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { recursive: true, withFileTypes: true });
  return entries.filter((e) => e.isFile()).map((e) => join(e.parentPath, e.name));
}

function isExternal(ref: string): boolean {
  return /^(?:[a-z][a-z0-9+.-]*:)?\/\//i.test(ref) && !ref.startsWith("data:");
}

const problems: string[] = [];
const files = await listFiles(DIST);
if (files.length === 0) throw new Error("dist/ が空です。先に npm run build を実行してください");

for (const file of files) {
  const ext = extname(file);
  if (![".html", ".css", ".js", ".mjs"].includes(ext)) continue;
  const text = await readFile(file, "utf8");
  const name = relative(DIST, file);

  if (ext === ".html" || ext === ".css") {
    for (const match of text.matchAll(RESOURCE_PATTERN)) {
      const ref = match[1] ?? match[2] ?? "";
      if (isExternal(ref)) problems.push(`${name}: 外部のリソースを参照しています: ${ref}`);
    }
  }

  for (const match of text.matchAll(URL_PATTERN)) {
    const host = match[1]?.toLowerCase() ?? "";
    if (!(host in ALLOWED_HOSTS)) problems.push(`${name}: 確認されていないURLがあります: ${match[0]}`);
  }
}

if (problems.length > 0) {
  console.error([...new Set(problems)].join("\n"));
  process.exit(1);
}
console.log(`OK: ${files.length} ファイルを確認しました。外部から読み込むURLはありません。`);
