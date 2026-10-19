import type { Plugin } from "vite";

// コンテンツセキュリティポリシー(CSP)。PDFや抽出結果が外部へ送られないよう、読み込みと通信を
// このアプリと同じオリジンだけに限る。
// - ビルドした index.html に <meta> で入れる(どこに置いても効くように)
// - `vite preview` の応答と、Cloudflare Pages 用の dist/_headers にも同じ値をヘッダーで付ける
//   (worker のスクリプトには <meta> が効かないので、ヘッダーでも付ける必要がある)
// 開発サーバー(`npm run dev`)では、Vite が埋め込むスクリプトを妨げないよう付けない。

/** CSP の指示と、その理由 */
export const CSP_DIRECTIVES: ReadonlyArray<readonly [string, string, string]> = [
  ["default-src", "'self'", "指定のない種類も、同じオリジンだけから読み込む"],
  // WebAssembly(pdf.js の画像の展開、OCR の文字認識の本体)のコンパイルに 'wasm-unsafe-eval' が要る。
  // JavaScript の eval は許さない
  ["script-src", "'self' 'wasm-unsafe-eval'", "スクリプトは同じオリジンのファイルだけ"],
  ["worker-src", "'self'", "pdf.js と OCR の worker は同じオリジンのファイルから起動する"],
  ["connect-src", "'self'", "fetch などの通信先は同じオリジンだけ(PDFや抽出結果を外へ送れない)"],
  // pdf.js はPDFに埋め込まれたフォントを data: URL で読み込むことがある
  ["font-src", "'self' data:", "フォントはアプリに同梱したものと、PDFに埋め込まれたもの"],
  ["img-src", "'self' data: blob:", "画像は同じオリジンと、ページの描画で作るもの"],
  // React と pdf.js は style 属性を JavaScript から設定するので、'unsafe-inline' が要る
  ["style-src", "'self' 'unsafe-inline'", "スタイルシートは同じオリジンのファイルと、要素の style 属性"],
  ["object-src", "'none'", "プラグイン(object / embed)は使わない"],
  ["base-uri", "'none'", "<base> で読み込み先を変えさせない"],
  ["form-action", "'none'", "フォームの送信先を作らない"],
];

export const CSP = CSP_DIRECTIVES.map(([name, value]) => `${name} ${value}`).join("; ");

/**
 * ヘッダーでだけ使える指示を足したもの。frame-ancestors は <meta> では効かない。
 * ほかのサイトの iframe の中に表示させない(クリックジャッキングの対策)
 */
export const CSP_HEADER = `${CSP}; frame-ancestors 'none'`;

export function securityHeaders(): Plugin {
  return {
    name: "security-headers",
    transformIndexHtml: {
      order: "post",
      handler(html, ctx) {
        // 開発サーバーでは付けない(ctx.server があるのは開発サーバーのとき)
        if (ctx.server) return html;
        // 文字コードの宣言の直後に置く
        return html.replace(
          /(<meta charset="[^"]*" \/>)/,
          `$1\n    <meta http-equiv="Content-Security-Policy" content="${CSP}" />`,
        );
      },
    },
    configurePreviewServer(server) {
      server.middlewares.use((_req, res, next) => {
        res.setHeader("Content-Security-Policy", CSP_HEADER);
        next();
      });
    },
    generateBundle() {
      // Cloudflare Pages の _headers の形式。すべてのパスに付ける
      this.emitFile({ type: "asset", fileName: "_headers", source: `/*\n  Content-Security-Policy: ${CSP_HEADER}\n` });
    },
  };
}
