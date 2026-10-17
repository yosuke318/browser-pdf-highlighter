import type { PDFDocumentProxy, PDFPageProxy } from "pdfjs-dist";
import { type ChangeEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { guessDocumentType } from "./classify/document-type.ts";
import { DocumentTypeCard } from "./components/DocumentTypeCard.tsx";
import { EmptyState } from "./components/EmptyState.tsx";
import { AlertIcon, DocumentIcon, LockIcon, UploadIcon } from "./components/icons.tsx";
import { ResultPanel } from "./components/ResultPanel.tsx";
import { extractDocument } from "./extract/engine.ts";
import { DOCUMENT_DEFINITIONS } from "./extract/load-definitions.ts";
import { HighlightLayer } from "./highlight/HighlightLayer.tsx";
import { HighlightLegend } from "./highlight/HighlightLegend.tsx";
import { highlightsFromExtraction, type ToScreen } from "./highlight/highlights.ts";
import { OpenPdfError, openErrorMessage } from "./pdf/open-file.ts";
import type { ReadMethod } from "./pdf/page-kind.ts";
import { openPdf, readPdfPage } from "./pdf/pdfjs.ts";
import type { PageReading } from "./pdf/read-page.ts";
import { PageCanvas } from "./viewer/PageCanvas.tsx";
import { OcrNotice, ReadMethodStatus } from "./viewer/ReadMethodStatus.tsx";
import { useElementWidth } from "./viewer/useElementWidth.ts";
import { useFileDrop } from "./viewer/useFileDrop.ts";
import { ViewerToolbar } from "./viewer/ViewerToolbar.tsx";
import { resolveScale, type Zoom, zoomIn, zoomOut } from "./viewer/zoom.ts";

interface OpenedPdf {
  doc: PDFDocumentProxy;
  fileName: string;
}

export function App() {
  const [opened, setOpened] = useState<OpenedPdf | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pageNumber, setPageNumber] = useState(1);
  const [page, setPage] = useState<PDFPageProxy | null>(null);
  const [zoom, setZoom] = useState<Zoom>({ mode: "fit-width" });
  // ページごとの読み取り結果と、利用者が手動で選んだ読み取り方法(ページ番号 → 方法)
  const [reading, setReading] = useState<PageReading | null>(null);
  const [methodOverrides, setMethodOverrides] = useState<Record<number, ReadMethod>>({});
  // 利用者が手動で選んだ書類タイプ(ページ番号 → 書類ID)。複数の書類を結合したPDFのため、ページごとに持つ
  const [typeOverrides, setTypeOverrides] = useState<Record<number, string>>({});
  // 選択中のハイライト(項目のキー)
  const [selectedHighlight, setSelectedHighlight] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [pageAreaRef, areaWidth] = useElementWidth<HTMLDivElement>();
  // 後から始めた読み込みだけを反映するための番号
  const openRequest = useRef(0);

  const openFile = useCallback(async (file: File) => {
    const request = ++openRequest.current;
    setError(null);
    setLoading(true);
    try {
      const doc = await openPdf(file);
      if (request !== openRequest.current) {
        void doc.loadingTask.destroy();
        return;
      }
      setOpened((previous) => {
        // 前に開いていたPDFのメモリを解放する
        void previous?.doc.loadingTask.destroy();
        return { doc, fileName: file.name };
      });
      setPage(null);
      setReading(null);
      setMethodOverrides({});
      setTypeOverrides({});
      setPageNumber(1);
      setZoom({ mode: "fit-width" });
    } catch (e) {
      if (request !== openRequest.current) return;
      console.error(e);
      setError(openErrorMessage(e instanceof OpenPdfError ? e.kind : "unknown"));
    } finally {
      if (request === openRequest.current) setLoading(false);
    }
  }, []);

  const dragging = useFileDrop((file) => void openFile(file));

  function handleFileInput(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    // 同じファイルを続けて選んでも change が起きるように、選択を空に戻す
    event.target.value = "";
    if (file) void openFile(file);
  }

  // 表示するページを読み込む
  useEffect(() => {
    if (!opened) return;
    let cancelled = false;
    opened.doc.getPage(pageNumber).then(
      (p) => {
        if (!cancelled) setPage(p);
      },
      (e: unknown) => {
        console.error(e);
        if (!cancelled) setError("ページを読み込めませんでした。");
      },
    );
    return () => {
      cancelled = true;
    };
  }, [opened, pageNumber]);

  // 表示中のページの種類を判別し、文字と座標を取り出す
  useEffect(() => {
    if (!page) return;
    let cancelled = false;
    setReading(null);
    readPdfPage(page).then(
      (r) => {
        if (!cancelled) setReading(r);
      },
      (e: unknown) => {
        console.error(e);
        if (!cancelled) setError("ページの文字を読み取れませんでした。");
      },
    );
    return () => {
      cancelled = true;
    };
  }, [page]);

  const handleRenderError = useCallback((e: unknown) => {
    console.error(e);
    setError("ページを描画できませんでした。");
  }, []);

  // 倍率 1 のときのページの幅(回転を反映した後の幅)
  const pageWidth = page ? page.getViewport({ scale: 1 }).width : 0;
  const scale = resolveScale(zoom, pageWidth, areaWidth);
  const numPages = opened?.doc.numPages ?? 0;
  const openDialog = () => fileInputRef.current?.click();
  const override = reading ? methodOverrides[reading.pageNumber] : undefined;
  const method = override ?? reading?.classification.method;
  const overridden = override !== undefined && override !== reading?.classification.method;

  // 書類タイプの判定は、pdf.js の文字を使うページだけで行う(OCR のページは OCR に対応したら判定する)
  const typeGuess = useMemo(
    () => (reading ? guessDocumentType(method === "pdf" ? reading.pdfSegments : []) : null),
    [reading, method],
  );

  // 表示中のページの書類タイプ(手動で選んだもの、なければ自動判定)の書類定義で、値を抽出する。
  // 書類定義がまだない書類タイプでは抽出しない。複数ページにまたがる書類の扱いは、抽出結果の一覧を作るときに決める
  const documentType = reading ? (typeOverrides[reading.pageNumber] ?? typeGuess?.documentId ?? null) : null;
  const extraction = useMemo(() => {
    const rules = DOCUMENT_DEFINITIONS.find((d) => d.id === documentType);
    if (!reading || method !== "pdf" || !rules) return null;
    return extractDocument(rules, [{ pageNumber: reading.pageNumber, view: reading.view, segments: reading.pdfSegments }]);
  }, [reading, method, documentType]);
  const highlights = useMemo(
    () =>
      extraction && reading && page?.pageNumber === reading.pageNumber
        ? highlightsFromExtraction(extraction, reading.pageNumber)
        : [],
    [extraction, reading, page],
  );
  const toScreen = useMemo<ToScreen | null>(() => {
    if (!page) return null;
    const viewport = page.getViewport({ scale });
    return (rect) => {
      // 長方形の4つの角を画面の座標に変換し、それを囲む長方形にする(ページが回転していても正しく囲める)
      const corners = [
        [rect.x0, rect.y0],
        [rect.x1, rect.y0],
        [rect.x0, rect.y1],
        [rect.x1, rect.y1],
      ].map(([x = 0, y = 0]) => viewport.convertToViewportPoint(x, y) as [number, number]);
      const xs = corners.map((c) => c[0]);
      const ys = corners.map((c) => c[1]);
      const left = Math.min(...xs);
      const top = Math.min(...ys);
      return { left, top, width: Math.max(...xs) - left, height: Math.max(...ys) - top };
    };
  }, [page, scale]);

  function changeDocumentType(documentId: string | null) {
    if (!reading) return;
    const pageNumber = reading.pageNumber;
    setTypeOverrides((current) => {
      const next = { ...current };
      if (documentId === null) delete next[pageNumber];
      else next[pageNumber] = documentId;
      return next;
    });
  }

  function toggleMethod() {
    if (!reading || !method) return;
    const next: ReadMethod = method === "pdf" ? "ocr" : "pdf";
    setMethodOverrides((current) => ({ ...current, [reading.pageNumber]: next }));
  }

  return (
    <div className="app">
      <header className="app-header">
        <div className="brand">
          <span className="brand__icon">
            <DocumentIcon size={22} />
          </span>
          <span className="brand__name">PDF抽出ビューア</span>
        </div>
        <button type="button" className={opened ? "button" : "button button--primary"} onClick={openDialog}>
          PDFを開く
        </button>
        <button type="button" className="button" disabled>
          前回と比較
        </button>
        {opened && <span className="mono file-name">{opened.fileName}</span>}
        {opened && page && (
          <ViewerToolbar
            pageNumber={pageNumber}
            numPages={numPages}
            onPageStep={(delta) =>
              // ボタンを続けて押しても1回ずつ進むように、直前の値から計算する
              setPageNumber((current) => Math.min(numPages, Math.max(1, current + delta)))
            }
            zoom={zoom}
            scale={scale}
            onZoomIn={() => setZoom({ mode: "scale", scale: zoomIn(scale) })}
            onZoomOut={() => setZoom({ mode: "scale", scale: zoomOut(scale) })}
            onFitWidth={() => setZoom({ mode: "fit-width" })}
          />
        )}
        {reading && method && (
          <ReadMethodStatus kind={reading.classification.kind} method={method} overridden={overridden} onToggle={toggleMethod} />
        )}
        <div className="spacer" />
        <div className="safe-badge">
          <LockIcon size={16} />
          PDFはこの端末の外へ送信されません
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept="application/pdf,.pdf"
          className="visually-hidden"
          tabIndex={-1}
          aria-hidden="true"
          onChange={handleFileInput}
        />
      </header>

      <div className="app-body">
        <main className="viewer">
          {error && (
            <div className="error-banner" role="alert">
              <AlertIcon />
              {error}
            </div>
          )}
          {loading && (
            <p className="loading" role="status">
              読み込み中…
            </p>
          )}
          {reading && method === "ocr" && <OcrNotice kind={reading.classification.kind} overridden={overridden} />}
          {opened ? (
            <div ref={pageAreaRef} className="page-area">
              {page && (
                <div className="page-view">
                  <PageCanvas page={page} scale={scale} onError={handleRenderError} />
                  {toScreen && highlights.length > 0 && (
                    <HighlightLayer
                      highlights={highlights}
                      toScreen={toScreen}
                      rotation={page.rotate}
                      selectedId={selectedHighlight}
                      onSelect={setSelectedHighlight}
                    />
                  )}
                </div>
              )}
            </div>
          ) : (
            !loading && <EmptyState onChooseFile={openDialog} />
          )}
        </main>
        <ResultPanel>
          {reading && typeGuess && (
            <DocumentTypeCard
              pageNumber={reading.pageNumber}
              guess={typeGuess}
              override={typeOverrides[reading.pageNumber]}
              onChange={changeDocumentType}
            />
          )}
          <HighlightLegend />
        </ResultPanel>
      </div>

      {dragging && (
        <div className="drop-overlay" aria-hidden="true">
          <div className="drop-overlay__box">
            <UploadIcon size={48} />
            ドロップしてPDFを開く
          </div>
        </div>
      )}
    </div>
  );
}
