import type { PDFDocumentProxy, RenderTask } from "pdfjs-dist";
import { type ChangeEvent, useEffect, useRef, useState } from "react";
import { openPdf } from "./pdf/pdfjs.ts";

// 雛形の画面。PDFを選ぶと1ページ目を描画する。
// ページ送り・ズーム・ハイライトなどの本格的なビューアは、この上に作っていく。

export function App() {
  const [pdf, setPdf] = useState<PDFDocumentProxy | null>(null);
  const [error, setError] = useState<string | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  async function handleFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setError(null);
    try {
      setPdf(await openPdf(file));
    } catch {
      setPdf(null);
      setError("PDFを読み込めませんでした。ファイルが壊れていないか確認してください。");
    }
  }

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!pdf || !canvas) return;
    let cancelled = false;
    let renderTask: RenderTask | null = null;
    void (async () => {
      const page = await pdf.getPage(1);
      if (cancelled) return;
      const viewport = page.getViewport({ scale: 1.5 });
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      renderTask = page.render({ canvas, viewport });
      await renderTask.promise.catch(() => {});
    })();
    return () => {
      cancelled = true;
      renderTask?.cancel();
    };
  }, [pdf]);

  useEffect(() => {
    return () => {
      void pdf?.loadingTask.destroy();
    };
  }, [pdf]);

  return (
    <main>
      <header>
        <h1>PDF項目抽出</h1>
        <p className="notice">PDFはこの端末の外へ送信されません。</p>
      </header>
      <label>
        PDFを選択
        <input type="file" accept="application/pdf" onChange={handleFile} />
      </label>
      {error && <p role="alert">{error}</p>}
      {pdf && <p>{pdf.numPages} ページ</p>}
      <canvas ref={canvasRef} data-testid="page-canvas" />
    </main>
  );
}
