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
}

export interface DocumentResults {
  /** ページごとの状態。読み取りが終わっていないページは null */
  pages: (PageState | null)[];
  documents: DocumentResult[];
  /** すべてのページを読み終えたか */
  complete: boolean;
}

export function useDocumentResults(
  doc: PDFDocumentProxy | null,
  methodOverrides: Readonly<Record<number, ReadMethod>>,
  typeOverrides: Readonly<Record<number, string>>,
  onError: (message: string) => void,
): DocumentResults {
  const [readings, setReadings] = useState<(PageReading | null)[]>([]);

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
          if (!cancelled) onError(`${i}ページ目の文字を読み取れませんでした。`);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [doc, onError]);

  const pages = useMemo(
    () =>
      readings.map((reading): PageState | null => {
        if (!reading) return null;
        const method = methodOverrides[reading.pageNumber] ?? reading.classification.method;
        const guess = guessDocumentType(method === "pdf" ? reading.pdfSegments : []);
        return { reading, method, guess, documentType: typeOverrides[reading.pageNumber] ?? guess.documentId };
      }),
    [readings, methodOverrides, typeOverrides],
  );

  const documents = useMemo(() => {
    const groups = groupPagesByDocument(pages.map((p) => p?.documentType ?? null));
    return groups.map((group): DocumentResult => {
      const rules = DOCUMENT_DEFINITIONS.find((d) => d.id === group.documentId);
      // OCR で読むページは、OCR に対応するまで文字がないので、pdf.js の文字を使うページだけを渡す
      const extractionPages = group.pages
        .map((n) => pages[n - 1])
        .filter((p): p is PageState => p != null && p.method === "pdf")
        .map((p) => ({ pageNumber: p.reading.pageNumber, view: p.reading.view, segments: p.reading.pdfSegments }));
      return { ...group, extraction: rules ? extractDocument(rules, extractionPages) : null };
    });
  }, [pages]);

  return { pages, documents, complete: readings.length > 0 && readings.every((r) => r !== null) };
}
