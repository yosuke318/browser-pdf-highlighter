// PDFのページを、書類ごとのまとまりに分ける。
// 1つのPDFに複数の書類が結合されていることがあるので、書類タイプが同じページが続く範囲を1つの書類とみなす。

export interface DocumentGroup {
  /** 画面の中で一意な ID(書類タイプと最初のページ) */
  id: string;
  documentId: string;
  /** この書類のページ番号(昇順) */
  pages: number[];
}

/**
 * ページごとの書類タイプ(判定できなかったページは null)から、書類のまとまりを作る。
 * 書類タイプが分からないページは、どのまとまりにも入れない
 */
export function groupPagesByDocument(types: readonly (string | null)[]): DocumentGroup[] {
  const groups: DocumentGroup[] = [];
  types.forEach((documentId, index) => {
    const pageNumber = index + 1;
    if (!documentId) return;
    const last = groups.at(-1);
    if (last && last.documentId === documentId && last.pages.at(-1) === pageNumber - 1) {
      last.pages.push(pageNumber);
    } else {
      groups.push({ id: `${documentId}@${pageNumber}`, documentId, pages: [pageNumber] });
    }
  });
  return groups;
}
