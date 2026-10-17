import { createReadStream } from "node:fs";
import { readdir, readFile, stat } from "node:fs/promises";
import { createRequire } from "node:module";
import { basename, dirname, extname, join, normalize, sep } from "node:path";
import type { Plugin } from "vite";

// pdf.js が実行時に読み込むデータファイル(CMap・標準フォント・wasm・ICCプロファイル)を、
// CDN ではなくこのアプリと同じオリジンから配信するための Vite プラグイン。
// 開発サーバーでは node_modules から直接返し、ビルド時は dist/pdfjs/ にコピーする。

export const PDFJS_ASSET_DIRS = ["cmaps", "standard_fonts", "wasm", "iccs"] as const;
const URL_PREFIX = "pdfjs";

const PDFJS_ROOT = dirname(createRequire(import.meta.url).resolve("pdfjs-dist/package.json"));

const CONTENT_TYPES: Record<string, string> = {
  ".bcmap": "application/octet-stream",
  ".pfb": "application/octet-stream",
  ".ttf": "font/ttf",
  ".wasm": "application/wasm",
  ".js": "text/javascript",
  ".icc": "application/vnd.iccprofile",
};

// PDF に埋め込まれた JavaScript を実行するためのエンジン。このアプリでは PDF 内のスクリプトを
// 実行しないので配信しない
const EXCLUDED_FILES = /^quickjs-eval\./;

function isServed(name: string): boolean {
  return !EXCLUDED_FILES.test(name);
}

async function listFiles(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  return entries.filter((e) => e.isFile() && isServed(e.name)).map((e) => e.name);
}

export function pdfjsAssets(): Plugin {
  let base = "/";
  return {
    name: "pdfjs-assets",
    configResolved(config) {
      base = config.base;
    },
    configureServer(server) {
      const mount = `${base}${URL_PREFIX}/`;
      server.middlewares.use(async (req, res, next) => {
        const url = req.url?.split("?")[0];
        if (!url?.startsWith(mount)) return next();
        const relative = normalize(decodeURIComponent(url.slice(mount.length)));
        const [dir] = relative.split(sep);
        // ディレクトリ外への参照(../)や、配信対象外のディレクトリは返さない
        if (relative.startsWith("..") || !PDFJS_ASSET_DIRS.some((d) => d === dir) || !isServed(basename(relative))) {
          return next();
        }
        const file = join(PDFJS_ROOT, relative);
        try {
          if (!(await stat(file)).isFile()) return next();
        } catch {
          return next();
        }
        res.setHeader("Content-Type", CONTENT_TYPES[extname(file)] ?? "application/octet-stream");
        createReadStream(file).pipe(res);
      });
    },
    async generateBundle() {
      for (const dir of PDFJS_ASSET_DIRS) {
        for (const name of await listFiles(join(PDFJS_ROOT, dir))) {
          this.emitFile({
            type: "asset",
            fileName: `${URL_PREFIX}/${dir}/${name}`,
            source: await readFile(join(PDFJS_ROOT, dir, name)),
          });
        }
      }
    },
  };
}
