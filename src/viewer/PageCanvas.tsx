import { type PDFPageProxy, RenderingCancelledException } from "pdfjs-dist";
import { useEffect, useRef } from "react";

interface Props {
  page: PDFPageProxy;
  /** 表示倍率。1 で PDF の 1pt を CSS の 1px で表示する */
  scale: number;
  onError: (error: unknown) => void;
}

/**
 * PDFの1ページを canvas に描画する。
 * 高解像度の画面でもぼやけないよう、canvas の画素数は devicePixelRatio 倍にし、
 * 表示上の大きさ(CSS)は倍率どおりにする。ページの回転(/Rotate)は pdf.js が反映する。
 */
export function PageCanvas({ page, scale, onError }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const viewport = page.getViewport({ scale });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const outputScale = window.devicePixelRatio || 1;
    const vp = page.getViewport({ scale });
    canvas.width = Math.floor(vp.width * outputScale);
    canvas.height = Math.floor(vp.height * outputScale);
    const task = page.render({
      canvas,
      viewport: vp,
      transform: outputScale === 1 ? undefined : [outputScale, 0, 0, outputScale, 0, 0],
    });
    task.promise.catch((e: unknown) => {
      // ページやズームを切り替えたときの描画中断はエラーではない
      if (e instanceof RenderingCancelledException) return;
      onError(e);
    });
    return () => task.cancel();
  }, [page, scale, onError]);

  return (
    <canvas
      ref={canvasRef}
      className="page-canvas"
      style={{ width: `${viewport.width}px`, height: `${viewport.height}px` }}
      aria-label={`${page.pageNumber}ページ目`}
      role="img"
    />
  );
}
