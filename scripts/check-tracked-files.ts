// 実在の書類(個人情報を含むPDFや画像)を、誤ってリポジトリに入れていないかを確かめる。
//   npm run check:files
//
// git で管理しているファイルのうち、次のものがあれば失敗する:
// - samples/ の外にある PDF・画像ファイル(使い方のページのスクリーンショットは除く。下を参照)
// - samples/ にあるが、samples/manifest.json に載っていない PDF(生成スクリプトで作ったダミーではない可能性がある)
//
// 使い方のページのスクリーンショット(src/help/screenshots/)は、ダミーPDFから npm run help:screenshots で作り、
// src/help/screenshots/manifest.json に記録したものだけを認める。
//
// 実データ(マスク済みのものを含む)は local-samples/ に置く。このディレクトリは .gitignore で除外している。

import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

const ROOT = join(import.meta.dirname, "..");

/** 書類の画像やスキャンが入りうるファイルの拡張子 */
const DOCUMENT_EXTENSIONS = /\.(pdf|png|jpe?g|tiff?|heic|heif|bmp|gif|webp)$/i;

const tracked = execFileSync("git", ["ls-files", "-z"], { cwd: ROOT, encoding: "utf8" }).split("\0").filter(Boolean);

const manifest: unknown = JSON.parse(await readFile(join(ROOT, "samples/manifest.json"), "utf8"));
const listed = new Set(
  Array.isArray(manifest)
    ? manifest.flatMap((entry: unknown) =>
        typeof entry === "object" && entry !== null && "file" in entry && typeof entry.file === "string"
          ? [`samples/${entry.file}`]
          : [],
      )
    : [],
);

const SCREENSHOTS = "src/help/screenshots";
const screenshotManifest: unknown = JSON.parse(await readFile(join(ROOT, SCREENSHOTS, "manifest.json"), "utf8"));
const screenshots = new Set(
  Array.isArray(screenshotManifest)
    ? screenshotManifest.flatMap((entry: unknown) =>
        typeof entry === "object" && entry !== null && "file" in entry && typeof entry.file === "string"
          ? [`${SCREENSHOTS}/${entry.file}`]
          : [],
      )
    : [],
);

const errors: string[] = [];
for (const file of tracked.filter((f) => DOCUMENT_EXTENSIONS.test(f))) {
  if (screenshots.has(file)) continue;
  if (!file.startsWith("samples/")) {
    errors.push(`${file}: samples/ の外にあるPDF・画像です。実データなら local-samples/ に移してください`);
  } else if (file.toLowerCase().endsWith(".pdf") && !listed.has(file)) {
    errors.push(`${file}: samples/manifest.json に載っていないPDFです。生成したダミーなら manifest.json に追加してください`);
  }
}

if (errors.length > 0) {
  for (const e of errors) console.error(`NG  ${e}`);
  process.exit(1);
}
console.log(`OK  管理しているファイル ${tracked.length} 件に、実データらしいPDF・画像はありません`);
