import type { PDFDocumentProxy, PDFPageProxy } from "pdfjs-dist";
import { type ChangeEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { DOCUMENT_TYPES } from "./classify/document-type.ts";
import { DocumentTypeCard } from "./components/DocumentTypeCard.tsx";
import { EmptyState } from "./components/EmptyState.tsx";
import { AlertIcon, DocumentIcon, LockIcon, UploadIcon } from "./components/icons.tsx";
import { ResultPanel } from "./components/ResultPanel.tsx";
import { type ComparisonSide, compareDocuments, type FieldDiff } from "./diff/compare-fields.ts";
import { DiffList } from "./diff/DiffList.tsx";
import { sideFromExported, sideFromReviewed } from "./diff/sides.ts";
import { convertValue } from "./extract/convert.ts";
import { HighlightLayer } from "./highlight/HighlightLayer.tsx";
import { HighlightLegend } from "./highlight/HighlightLegend.tsx";
import { highlightsFromDiffs, highlightsFromReviewed, type ToScreen } from "./highlight/highlights.ts";
import { OpenPdfError, openErrorMessage } from "./pdf/open-file.ts";
import type { ReadMethod } from "./pdf/page-kind.ts";
import { openPdf } from "./pdf/pdfjs.ts";
import { pageSegments } from "./pdf/read-page.ts";
import { ImportError, parseExportedExtraction } from "./results/export.ts";
import { ResultList } from "./results/ResultList.tsx";
import { type ReviewAction, type ReviewedField, type ReviewState, reviewFields, reviewReducer } from "./results/review.ts";
import { analyzePdf, useDocumentResults } from "./results/useDocumentResults.ts";
import { findDocument } from "./schema/fields.ts";
import { groupLines } from "./text/lines.ts";
import type { Rect } from "./text/types.ts";
import { PageCanvas } from "./viewer/PageCanvas.tsx";
import { RangeSelector, type ScreenRect } from "./viewer/RangeSelector.tsx";
import { OcrNotice, ReadMethodStatus } from "./viewer/ReadMethodStatus.tsx";
import { useElementWidth } from "./viewer/useElementWidth.ts";
import { useFileDrop } from "./viewer/useFileDrop.ts";
import { ViewerToolbar } from "./viewer/ViewerToolbar.tsx";
import { resolveScale, type Zoom, zoomIn, zoomOut } from "./viewer/zoom.ts";

interface OpenedPdf {
  doc: PDFDocumentProxy;
  fileName: string;
}

/** 前回の資料(前回のPDF、または前回書き出した抽出結果のJSON) */
interface PreviousDocument {
  fileName: string;
  documentType: string;
  side: ComparisonSide;
}

/** 書類のまとまりの中の1項目 */
interface FieldRef {
  groupId: string;
  key: string;
}

const titleOf = (documentId: string) => DOCUMENT_TYPES.find((t) => t.id === documentId)?.title ?? documentId;

export function App() {
  const [opened, setOpened] = useState<OpenedPdf | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pageNumber, setPageNumber] = useState(1);
  const [page, setPage] = useState<PDFPageProxy | null>(null);
  const [zoom, setZoom] = useState<Zoom>({ mode: "fit-width" });
  // 利用者が手動で選んだ読み取り方法と書類タイプ(ページ番号 → 値)。複数の書類を結合したPDFのため、ページごとに持つ
  const [methodOverrides, setMethodOverrides] = useState<Record<number, ReadMethod>>({});
  const [typeOverrides, setTypeOverrides] = useState<Record<number, string>>({});
  // 書類のまとまりごとの、確認・修正の状態
  const [reviews, setReviews] = useState<Record<string, ReviewState>>({});
  // 選択中の項目と、PDF上で範囲を選んでいる項目
  const [selected, setSelected] = useState<FieldRef | null>(null);
  const [rangeTarget, setRangeTarget] = useState<FieldRef | null>(null);
  const [rangeError, setRangeError] = useState<string | null>(null);
  // 前回と比較している資料
  const [previous, setPrevious] = useState<PreviousDocument | null>(null);
  const [comparing, setComparing] = useState(false);
  const compareInputRef = useRef<HTMLInputElement>(null);
  // 一覧から項目を選んだときだけ、PDF上のハイライトまでスクロールする
  const scrollToHighlight = useRef(false);
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
      setMethodOverrides({});
      setTypeOverrides({});
      setReviews({});
      setSelected(null);
      setRangeTarget(null);
      setPrevious(null);
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

  const reportError = useCallback((message: string) => setError(message), []);
  const results = useDocumentResults(opened?.doc ?? null, methodOverrides, typeOverrides, reportError);
  const current = results.pages[pageNumber - 1] ?? null;
  const currentOcr = results.ocr[pageNumber - 1];
  // OCR で読むページのうち、読み取りが終わったページ(失敗したページも含む)の数
  const ocrTotal = results.ocr.filter((s) => s !== undefined).length;
  const ocrFinished = results.ocr.filter((s) => s?.status === "done" || s?.status === "failed").length;

  // 書類ごとに、抽出結果へ確認・修正を重ねる
  const reviewed = useMemo(
    () =>
      results.documents.map((d) => ({
        document: d,
        items: d.extraction ? reviewFields(d.extraction.fields, reviews[d.id] ?? {}) : null,
      })),
    [results.documents, reviews],
  );

  const handleRenderError = useCallback((e: unknown) => {
    console.error(e);
    setError("ページを描画できませんでした。");
  }, []);

  // 倍率 1 のときのページの幅(回転を反映した後の幅)
  const pageWidth = page ? page.getViewport({ scale: 1 }).width : 0;
  const scale = resolveScale(zoom, pageWidth, areaWidth);
  const numPages = opened?.doc.numPages ?? 0;
  const openDialog = () => fileInputRef.current?.click();
  const methodOverridden =
    current !== null &&
    methodOverrides[pageNumber] !== undefined &&
    methodOverrides[pageNumber] !== current.reading.classification.method;

  // 前回と比べる今回の書類: 前回と同じ書類タイプの書類のうち、表示中のページを含むもの(なければ最初のもの)
  const comparison = useMemo(() => {
    if (!previous) return null;
    const candidates = reviewed.filter((r) => r.document.documentId === previous.documentType && r.items);
    const target = candidates.find((r) => r.document.pages.includes(pageNumber)) ?? candidates[0];
    const definition = findDocument(previous.documentType);
    if (!target?.items || !definition) return { target: null, result: null };
    const current = sideFromReviewed(target.items, target.document.readable);
    return { target: target.document, result: compareDocuments(definition, previous.side, current) };
  }, [previous, reviewed, pageNumber]);

  const highlights = useMemo(() => {
    if (!page || page.pageNumber !== pageNumber) return [];
    return reviewed.flatMap(({ document, items }) => {
      // 比較している書類は、差分の色でハイライトする
      if (comparison?.target?.id === document.id && comparison.result) {
        return highlightsFromDiffs(document.id, comparison.result.fields, pageNumber);
      }
      return items ? highlightsFromReviewed(document.id, document.documentId, items, pageNumber) : [];
    });
  }, [reviewed, page, pageNumber, comparison]);

  const viewport = useMemo(() => page?.getViewport({ scale }) ?? null, [page, scale]);
  const toScreen = useMemo<ToScreen | null>(() => {
    if (!viewport) return null;
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
  }, [viewport]);

  // 一覧から選んだ項目のハイライトを、画面の中に表示する
  const selectedId = selected ? `${selected.groupId}:${selected.key}` : null;
  // biome-ignore lint/correctness/useExhaustiveDependencies: ページを切り替えた後、ハイライトが描かれてからスクロールするため highlights も見る
  useEffect(() => {
    if (!selectedId || !scrollToHighlight.current) return;
    const element = document.querySelector(`[data-highlight-id="${CSS.escape(selectedId)}"]`);
    if (element) {
      element.scrollIntoView({ block: "center", inline: "center", behavior: "smooth" });
      scrollToHighlight.current = false;
    }
  }, [selectedId, highlights]);

  function selectFromList(groupId: string, item: ReviewedField) {
    setSelected({ groupId, key: item.field.key });
    if (item.page !== undefined) {
      scrollToHighlight.current = true;
      setPageNumber(item.page);
    }
  }

  function selectDiff(groupId: string, diff: FieldDiff) {
    setSelected({ groupId, key: diff.key });
    if (diff.current?.page !== undefined) {
      scrollToHighlight.current = true;
      setPageNumber(diff.current.page);
    }
  }

  /** 前回の資料(PDFまたはJSON)を読み込む */
  async function loadPrevious(file: File) {
    setError(null);
    setComparing(true);
    try {
      if (file.name.toLowerCase().endsWith(".json") || file.type === "application/json") {
        const exported = parseExportedExtraction(await file.text());
        setPrevious({ fileName: file.name, documentType: exported.documentType, side: sideFromExported(exported) });
        return;
      }
      const doc = await openPdf(file);
      try {
        const documents = await analyzePdf(doc);
        // 今回のPDFにある書類タイプと同じ書類を、前回の資料から選ぶ
        const currentTypes = new Set(reviewed.map((r) => r.document.documentId));
        const match =
          documents.find((d) => d.extraction && currentTypes.has(d.documentId)) ?? documents.find((d) => d.extraction);
        if (!match?.extraction) {
          setError("前回の資料から、書類の種類を判定できませんでした。");
          return;
        }
        setPrevious({
          fileName: file.name,
          documentType: match.documentId,
          side: sideFromReviewed(reviewFields(match.extraction.fields, {}), match.readable),
        });
      } finally {
        void doc.loadingTask.destroy();
      }
    } catch (e) {
      console.error(e);
      if (e instanceof ImportError) setError(`前回の資料を読み込めませんでした。${e.message}`);
      else if (e instanceof OpenPdfError) setError(`前回の資料を読み込めませんでした。${openErrorMessage(e.kind)}`);
      else setError("前回の資料を読み込めませんでした。");
    } finally {
      setComparing(false);
    }
  }

  function handleCompareInput(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (file) void loadPrevious(file);
  }

  function selectFromHighlight(id: string | null) {
    if (!id) {
      setSelected(null);
      return;
    }
    const separator = id.lastIndexOf(":");
    setSelected({ groupId: id.slice(0, separator), key: id.slice(separator + 1) });
  }

  function review(groupId: string, action: ReviewAction) {
    setReviews((all) => ({ ...all, [groupId]: reviewReducer(all[groupId] ?? {}, action) }));
  }

  /** PDF上で選んだ範囲の文字を、選んでいる項目の値にする */
  function pickRange(screen: ScreenRect) {
    if (!rangeTarget || !viewport || !current) return;
    const target = reviewed
      .find((r) => r.document.id === rangeTarget.groupId)
      ?.items?.find((i) => i.field.key === rangeTarget.key);
    if (!target) return;
    const segments = pageSegments(current.reading, current.method);
    if (segments.length === 0) {
      setRangeError(
        currentOcr && currentOcr.status !== "done" && currentOcr.status !== "failed"
          ? "OCRで文字を読み取っています。読み取りが終わってから、もう一度選んでください。"
          : "このページには使える文字データがないため、範囲から値を取れません。「修正する」から入力してください。",
      );
      return;
    }
    // 画面の長方形の4つの角を、PDF座標に変換する
    const corners = [
      [screen.left, screen.top],
      [screen.left + screen.width, screen.top],
      [screen.left, screen.top + screen.height],
      [screen.left + screen.width, screen.top + screen.height],
    ].map(([x = 0, y = 0]) => viewport.convertToPdfPoint(x, y) as [number, number]);
    const area: Rect = {
      x0: Math.min(...corners.map((c) => c[0])),
      y0: Math.min(...corners.map((c) => c[1])),
      x1: Math.max(...corners.map((c) => c[0])),
      y1: Math.max(...corners.map((c) => c[1])),
    };
    const inside = segments.filter((s) => {
      const cx = (s.bbox.x0 + s.bbox.x1) / 2;
      const cy = (s.bbox.y0 + s.bbox.y1) / 2;
      return cx >= area.x0 && cx <= area.x1 && cy >= area.y0 && cy <= area.y1;
    });
    const ordered = groupLines(inside).flatMap((line) => line.segments);
    const raw = ordered.map((s) => s.text).join(" ");
    const converted = raw.trim() ? convertValue(target.field.type, raw) : null;
    if (!converted) {
      setRangeError(
        raw.trim()
          ? `選んだ範囲の文字「${raw}」を、「${target.field.label}」の値として読めませんでした。`
          : "選んだ範囲に文字がありませんでした。",
      );
      return;
    }
    review(rangeTarget.groupId, {
      type: "edit",
      key: rangeTarget.key,
      edit: { value: converted.value, rawText: raw, page: pageNumber, bbox: ordered.map((s) => s.bbox) },
    });
    setSelected(rangeTarget);
    setRangeTarget(null);
    setRangeError(null);
  }

  function startPickRange(target: FieldRef) {
    setRangeTarget(target);
    setRangeError(null);
  }

  function changeDocumentType(documentId: string | null) {
    setTypeOverrides((all) => {
      const next = { ...all };
      if (documentId === null) delete next[pageNumber];
      else next[pageNumber] = documentId;
      return next;
    });
  }

  function toggleMethod() {
    if (!current) return;
    const next: ReadMethod = current.method === "pdf" ? "ocr" : "pdf";
    setMethodOverrides((all) => ({ ...all, [pageNumber]: next }));
  }

  const rangeTargetLabel = rangeTarget
    ? reviewed.find((r) => r.document.id === rangeTarget.groupId)?.items?.find((i) => i.field.key === rangeTarget.key)?.field
        .label
    : undefined;

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
        <button
          type="button"
          className="button"
          disabled={!opened || comparing}
          aria-pressed={previous !== null}
          onClick={() => compareInputRef.current?.click()}
        >
          前回と比較
        </button>
        {opened && <span className="mono file-name">{opened.fileName}</span>}
        {opened && page && (
          <ViewerToolbar
            pageNumber={pageNumber}
            numPages={numPages}
            onPageStep={(delta) =>
              // ボタンを続けて押しても1回ずつ進むように、直前の値から計算する
              setPageNumber((n) => Math.min(numPages, Math.max(1, n + delta)))
            }
            zoom={zoom}
            scale={scale}
            onZoomIn={() => setZoom({ mode: "scale", scale: zoomIn(scale) })}
            onZoomOut={() => setZoom({ mode: "scale", scale: zoomOut(scale) })}
            onFitWidth={() => setZoom({ mode: "fit-width" })}
          />
        )}
        {current && (
          <ReadMethodStatus
            kind={current.reading.classification.kind}
            method={current.method}
            overridden={methodOverridden}
            onToggle={toggleMethod}
          />
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
        <input
          ref={compareInputRef}
          type="file"
          accept="application/pdf,.pdf,application/json,.json"
          className="visually-hidden"
          tabIndex={-1}
          aria-hidden="true"
          onChange={handleCompareInput}
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
          {current && current.method === "ocr" && (
            <OcrNotice kind={current.reading.classification.kind} overridden={methodOverridden} state={currentOcr} />
          )}
          {rangeTarget && (
            <div className="range-notice" role="status">
              <span>
                「{rangeTargetLabel}」の値の範囲を、PDFの上でドラッグして選んでください。
                {rangeError && <strong className="range-notice__error">{rangeError}</strong>}
              </span>
              <button type="button" className="button button--small" onClick={() => setRangeTarget(null)}>
                やめる
              </button>
            </div>
          )}
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
                      selectedId={selectedId}
                      onSelect={selectFromHighlight}
                    />
                  )}
                  {rangeTarget && <RangeSelector onSelect={pickRange} />}
                </div>
              )}
            </div>
          ) : (
            !loading && <EmptyState onChooseFile={openDialog} />
          )}
        </main>
        <ResultPanel opened={opened !== null}>
          {comparing && (
            <p className="loading" role="status">
              前回の資料を読み取っています…
            </p>
          )}
          {previous && comparison && !comparison.target && (
            <div className="result-panel__note" role="alert">
              今回のPDFに「{titleOf(previous.documentType)}」がないため、前回の資料と比較できません。
              <button type="button" className="link-button" onClick={() => setPrevious(null)}>
                比較をやめる
              </button>
            </div>
          )}
          {previous && comparison?.target && comparison.result && (
            <DiffList
              documentTitle={titleOf(previous.documentType)}
              previousName={previous.fileName}
              currentName={opened?.fileName ?? ""}
              result={comparison.result}
              selectedKey={selected?.groupId === comparison.target.id ? selected.key : null}
              onSelect={(diff) => {
                if (comparison.target) selectDiff(comparison.target.id, diff);
              }}
              onClose={() => setPrevious(null)}
            />
          )}
          {!previous && current && (
            <DocumentTypeCard
              pageNumber={pageNumber}
              guess={current.guess}
              override={typeOverrides[pageNumber]}
              onChange={changeDocumentType}
              ocrPending={currentOcr !== undefined && currentOcr.status !== "done" && currentOcr.status !== "failed"}
            />
          )}
          {opened && !results.complete && (
            <p className="loading" role="status">
              ページを読み取っています…
            </p>
          )}
          {results.complete && ocrFinished < ocrTotal && (
            <p className="loading" role="status">
              OCRで読み取っています…({ocrFinished}/{ocrTotal}ページ)。読み取りが終わったページから、抽出結果に反映します。
            </p>
          )}
          {!previous &&
            reviewed.map(({ document, items }) =>
              items ? (
                <ResultList
                  key={document.id}
                  title={titleOf(document.documentId)}
                  documentId={document.documentId}
                  pages={document.pages}
                  fileName={opened?.fileName ?? ""}
                  items={items}
                  selectedKey={selected?.groupId === document.id ? selected.key : null}
                  onSelect={(item) => selectFromList(document.id, item)}
                  onReview={(action) => review(document.id, action)}
                  onPickRange={(key) => startPickRange({ groupId: document.id, key })}
                />
              ) : (
                <p key={document.id} className="result-panel__note">
                  「{titleOf(document.documentId)}」の抽出ルールはまだありません。
                </p>
              ),
            )}
          {results.complete && ocrFinished === ocrTotal && reviewed.length === 0 && (
            <p className="result-panel__note">
              書類の種類が分からないため、項目を抽出していません。「書類の種類を変える」から選んでください。
            </p>
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
