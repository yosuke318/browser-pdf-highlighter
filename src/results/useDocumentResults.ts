import type { PDFDocumentProxy } from "pdfjs-dist";
import { useEffect, useMemo, useRef, useState } from "react";
import { type DocumentTypeGuess, guessDocumentType } from "../classify/document-type.ts";
import { type ExtractionResult, extractDocument } from "../extract/engine.ts";
import { DOCUMENT_DEFINITIONS } from "../extract/load-definitions.ts";
import { ocrPdfPage } from "../ocr/browser.ts";
import type { OcrReading } from "../ocr/ocr-page.ts";
import type { ReadMethod } from "../pdf/page-kind.ts";
import { readPdfPage } from "../pdf/pdfjs.ts";
import { type PageReading, pageSegments } from "../pdf/read-page.ts";
import { type DocumentGroup, groupPagesByDocument } from "./document-groups.ts";

// PDFの全ページを読み取り、ページごとの読み取り方法と書類タイプを決め、書類ごとに値を抽出する。
// OCR で読むページは、全ページの読み取りの後に1ページずつ OCR し、終わったページから抽出に反映する。

export interface PageState {
  reading: PageReading;
  /** 読み取り方法(手動で選んだもの、なければ自動判別) */
  method: ReadMethod;
  /** 書類タイプの自動判定の結果(OCR で読むページは、OCR が終わってから判定する) */
  guess: DocumentTypeGuess;
  /** 書類タイプ(手動で選んだもの、なければ自動判定。分からなければ null) */
  documentType: string | null;
}

export interface DocumentResult extends DocumentGroup {
  /** 書類定義がまだない書類タイプでは null */
  extraction: ExtractionResult | null;
  /** 文字を読み取れたページがあったか(OCR がまだ終わっていないページだけの書類では false) */
  readable: boolean;
}

export interface DocumentResults {
  /**
   * 1ページごとの状態。
   * null は「まだ読み取っていない」または「読み取りが失敗した」ことを表す。
   * complete を見ると、すべてのページが解決済みかどうかを確認できる。
   */
  pages: (PageState | null)[];
  documents: DocumentResult[];
  /** すべてのページを読み終えたか(OCR を除く) */
  complete: boolean;
  /** ページごとの OCR の状態。OCR で読まないページは undefined */
  ocr: (OcrState | undefined)[];
}

/** 1ページの OCR の状態 */
export type OcrState =
  | { status: "waiting" }
  | { status: "running"; progress: number }
  | { status: "done"; reading: OcrReading }
  | { status: "failed" };

export const PAGE_READ_FAILED = Symbol("page-read-failed");

type PageReadingSlot = PageReading | typeof PAGE_READ_FAILED | null;

export function isPagesComplete(readings: readonly PageReadingSlot[]): boolean {
  return readings.length > 0 && readings.every((reading) => reading !== null);
}

/** 1ページの読み取り結果に、読み取り方法と書類タイプ(手動で選んだもの、なければ自動)を決める */
export function pageState(
  reading: PageReading,
  methodOverrides: Readonly<Record<number, ReadMethod>> = {},
  typeOverrides: Readonly<Record<number, string>> = {},
): PageState {
  const method = methodOverrides[reading.pageNumber] ?? reading.classification.method;
  const guess = guessDocumentType(pageSegments(reading, method));
  return { reading, method, guess, documentType: typeOverrides[reading.pageNumber] ?? guess.documentId };
}

/** ページを書類のまとまりに分け、書類ごとに値を抽出する */
export function documentsOf(pages: readonly (PageState | null)[]): DocumentResult[] {
  return groupPagesByDocument(pages.map((p) => p?.documentType ?? null)).map((group): DocumentResult => {
    const rules = DOCUMENT_DEFINITIONS.find((d) => d.id === group.documentId);
    // OCR で読むページは、OCR が終わったページだけを渡す
    const extractionPages = group.pages
      .map((n) => pages[n - 1])
      .filter((p): p is PageState => p != null && (p.method === "pdf" || p.reading.ocr !== undefined))
      .map((p) => ({ pageNumber: p.reading.pageNumber, view: p.reading.view, segments: pageSegments(p.reading, p.method) }));
    return { ...group, extraction: rules ? extractDocument(rules, extractionPages) : null, readable: extractionPages.length > 0 };
  });
}

/** PDFの全ページを読み取って(OCR で読むページは OCR して)、書類ごとに抽出する(前回の資料として読み込んだPDFに使う) */
export async function analyzePdf(doc: PDFDocumentProxy): Promise<DocumentResult[]> {
  const pages: PageState[] = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const reading = await readPdfPage(page);
    if (reading.classification.method === "ocr") reading.ocr = await ocrPdfPage(page);
    pages.push(pageState(reading));
  }
  return documentsOf(pages);
}

export function useDocumentResults(
  doc: PDFDocumentProxy | null,
  methodOverrides: Readonly<Record<number, ReadMethod>>,
  typeOverrides: Readonly<Record<number, string>>,
  onError: (message: string) => void,
): DocumentResults {
  const [readings, setReadings] = useState<PageReadingSlot[]>([]);
  // ページ番号 → OCR の状態
  const [ocr, setOcr] = useState<Record<number, OcrState>>({});
  // OCR 中のページ番号。1ページずつ処理する
  const [busy, setBusy] = useState<number | null>(null);
  // 別のPDFを開いたら増やす。前のPDFの OCR の結果が後から届いても捨てるために使う
  const generation = useRef(0);

  // 全ページを順に読み取る。読み終えたページから表示に反映する
  useEffect(() => {
    generation.current += 1;
    setOcr({});
    setBusy(null);
    if (!doc) {
      setReadings([]);
      return;
    }
    let cancelled = false;
    setReadings(Array.from({ length: doc.numPages }, () => null));
    void (async () => {
      for (let i = 1; i <= doc.numPages; i++) {
        try {
          const reading = await readPdfPage(await doc.getPage(i));
          if (cancelled) return;
          setReadings((current) => current.map((r, k) => (k === i - 1 ? reading : r)));
        } catch (e) {
          console.error(e);
          if (cancelled) return;
          onError(`${i}ページ目の文字を読み取れませんでした。`);
          setReadings((current) => current.map((r, k) => (k === i - 1 ? PAGE_READ_FAILED : r)));
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [doc, onError]);

  // OCR で読むページ(自動判別、または手動で OCR に切り替えたページ)を、全ページの読み取りの後に1ページずつ OCR する
  const complete = isPagesComplete(readings);
  const nextOcrPage = useMemo(() => {
    if (!complete) return null;
    const index = readings.findIndex(
      (r) =>
        r !== null &&
        r !== PAGE_READ_FAILED &&
        (methodOverrides[r.pageNumber] ?? r.classification.method) === "ocr" &&
        ocr[r.pageNumber] === undefined,
    );
    return index < 0 ? null : index + 1;
  }, [complete, readings, methodOverrides, ocr]);

  useEffect(() => {
    if (!doc || busy !== null || nextOcrPage === null) return;
    // 後片付けで取り消さない(OCR を始めると次のページが変わり、この effect が作り直されるため)。
    // 別のPDFに切り替わったかどうかは generation で確かめる
    const current = generation.current;
    const isCurrent = () => current === generation.current;
    const pageNumber = nextOcrPage;
    setBusy(pageNumber);
    setOcr((all) => ({ ...all, [pageNumber]: { status: "running", progress: 0 } }));
    void (async () => {
      let state: OcrState;
      try {
        const reading = await ocrPdfPage(await doc.getPage(pageNumber), (progress) => {
          if (isCurrent()) setOcr((all) => ({ ...all, [pageNumber]: { status: "running", progress } }));
        });
        state = { status: "done", reading };
      } catch (e) {
        console.error(e);
        if (isCurrent()) onError(`${pageNumber}ページ目を OCR で読み取れませんでした。`);
        state = { status: "failed" };
      }
      if (!isCurrent()) return;
      setOcr((all) => ({ ...all, [pageNumber]: state }));
      setBusy(null);
    })();
  }, [doc, busy, nextOcrPage, onError]);

  const pages = useMemo(
    () =>
      readings.map((r) => {
        if (r === null || r === PAGE_READ_FAILED) return null;
        const state = ocr[r.pageNumber];
        const reading = state?.status === "done" ? { ...r, ocr: state.reading } : r;
        return pageState(reading, methodOverrides, typeOverrides);
      }),
    [readings, ocr, methodOverrides, typeOverrides],
  );
  const documents = useMemo(() => documentsOf(pages), [pages]);
  const ocrStates = useMemo(
    () =>
      pages.map((p) => {
        if (p?.method !== "ocr") return undefined;
        return ocr[p.reading.pageNumber] ?? { status: "waiting" as const };
      }),
    [pages, ocr],
  );

  return { pages, documents, complete, ocr: ocrStates };
}
