import type { PDFDocumentProxy } from "pdfjs-dist";
import { useEffect, useMemo, useState } from "react";
import { type DocumentTypeGuess, guessDocumentType } from "../classify/document-type.ts";
import { type ExtractionResult, extractDocument } from "../extract/engine.ts";
import { DOCUMENT_DEFINITIONS } from "../extract/load-definitions.ts";
import type { ReadMethod } from "../pdf/page-kind.ts";
import { readPdfPage } from "../pdf/pdfjs.ts";
import type { PageReading } from "../pdf/read-page.ts";
import { type DocumentGroup, groupPagesByDocument } from "./document-groups.ts";

// PDFの全ページを読み取り、ページごとの読み取り方法と書類タイプを決め、書類ごとに値を抽出する。

export interface PageState {
  reading: PageReading;
  /** 読み取り方法(手動で選んだもの、なければ自動判別) */
  method: ReadMethod;
  /** 書類タイプの自動判定の結果(pdf.js の文字を使うページだけで判定する) */
  guess: DocumentTypeGuess;
  /** 書類タイプ(手動で選んだもの、なければ自動判定。分からなければ null) */
  documentType: string | null;
}

export interface DocumentResult extends DocumentGroup {
  /** 書類定義がまだない書類タイプでは null */
  extraction: ExtractionResult | null;
  /** 文字を読み取れたページがあったか(OCR で読むページだけの書類では false) */
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
  /** すべてのページを読み終えたか */
  complete: boolean;
}

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
  const guess = guessDocumentType(method === "pdf" ? reading.pdfSegments : []);
  return { reading, method, guess, documentType: typeOverrides[reading.pageNumber] ?? guess.documentId };
}

/** ページを書類のまとまりに分け、書類ごとに値を抽出する */
export function documentsOf(pages: readonly (PageState | null)[]): DocumentResult[] {
  return groupPagesByDocument(pages.map((p) => p?.documentType ?? null)).map((group): DocumentResult => {
    const rules = DOCUMENT_DEFINITIONS.find((d) => d.id === group.documentId);
    // OCR で読むページは、OCR に対応するまで文字がないので、pdf.js の文字を使うページだけを渡す
    const extractionPages = group.pages
      .map((n) => pages[n - 1])
      .filter((p): p is PageState => p != null && p.method === "pdf")
      .map((p) => ({ pageNumber: p.reading.pageNumber, view: p.reading.view, segments: p.reading.pdfSegments }));
    return { ...group, extraction: rules ? extractDocument(rules, extractionPages) : null, readable: extractionPages.length > 0 };
  });
}

/** PDFの全ページを読み取って、書類ごとに抽出する(前回の資料として読み込んだPDFに使う) */
export async function analyzePdf(doc: PDFDocumentProxy): Promise<DocumentResult[]> {
  const pages: PageState[] = [];
  for (let i = 1; i <= doc.numPages; i++) pages.push(pageState(await readPdfPage(await doc.getPage(i))));
  return documentsOf(pages);
}

export function useDocumentResults(
  doc: PDFDocumentProxy | null,
  methodOverrides: Readonly<Record<number, ReadMethod>>,
  typeOverrides: Readonly<Record<number, string>>,
  onError: (message: string) => void,
): DocumentResults {
  const [readings, setReadings] = useState<PageReadingSlot[]>([]);

  // 全ページを順に読み取る。読み終えたページから表示に反映する
  useEffect(() => {
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

  const pages = useMemo(
    () => readings.map((r) => (r === null || r === PAGE_READ_FAILED ? null : pageState(r, methodOverrides, typeOverrides))),
    [readings, methodOverrides, typeOverrides],
  );
  const documents = useMemo(() => documentsOf(pages), [pages]);

  return { pages, documents, complete: isPagesComplete(readings) };
}
