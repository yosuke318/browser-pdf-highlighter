import { AlertIcon, DocumentIcon } from "../components/icons.tsx";
import type { PageKind, ReadMethod } from "../pdf/page-kind.ts";
import type { OcrState } from "../results/useDocumentResults.ts";

/** 自動で判別したページの種類の短い名前 */
const KIND_LABELS: Record<PageKind, string> = {
  text: "テキストPDF",
  scanned: "スキャンPDF",
  searchable: "透明テキスト付きPDF",
  garbled: "文字化けしたPDF",
  other: "文字データなし",
};

/** OCR で読む理由 */
const OCR_REASONS: Record<PageKind, string> = {
  text: "",
  scanned: "スキャンPDFのため",
  searchable: "透明テキスト付きPDFのため(埋め込まれた文字は精度が分からないので使いません)",
  garbled: "PDFの文字が文字化けしているため",
  other: "文字データがほとんどないため",
};

interface Props {
  kind: PageKind;
  method: ReadMethod;
  /** 利用者が手動で切り替えたか */
  overridden: boolean;
  onToggle: () => void;
}

function badgeLabel({ kind, method, overridden }: Omit<Props, "onToggle">): string {
  if (overridden) return method === "pdf" ? "PDFの文字を使用(手動で切り替え)" : "OCRで読み取り(手動で切り替え)";
  return method === "pdf" ? KIND_LABELS[kind] : `${KIND_LABELS[kind]}・OCRで読み取り`;
}

/** ページの読み取り方法(PDFの文字 / OCR)の表示と、手動の切り替え */
export function ReadMethodStatus(props: Props) {
  const ocr = props.method === "ocr";
  return (
    <div className="read-method">
      <span className={ocr ? "badge badge--warning" : "badge badge--neutral"}>
        {ocr ? <AlertIcon size={14} /> : <DocumentIcon size={14} />}
        {badgeLabel(props)}
      </span>
      <button type="button" className="link-button" onClick={props.onToggle}>
        読み取り方法を変える
      </button>
    </div>
  );
}

function ocrStatusText(state: OcrState | undefined): string {
  switch (state?.status) {
    case "running":
      return `読み取り中… ${Math.round(state.progress * 100)}%`;
    case "done":
      return `読み取りました(${(state.reading.elapsedMs / 1000).toFixed(1)}秒)。`;
    case "failed":
      return "読み取りに失敗しました。";
    default:
      return "前のページの読み取りが終わるのを待っています。";
  }
}

/** OCR で読むページの上に出す注意と、OCR の進み具合 */
export function OcrNotice({ kind, overridden, state }: { kind: PageKind; overridden: boolean; state?: OcrState }) {
  const reason = overridden ? "手動でOCRに切り替えたため" : OCR_REASONS[kind];
  return (
    <div className="ocr-notice" role="note">
      <AlertIcon size={18} />
      <span>
        このページは{reason}、OCRで文字を読み取ります。読み取った値は必ず画面で確認してください。
        <span role="status" aria-live="polite">
          {ocrStatusText(state)}
        </span>
      </span>
    </div>
  );
}
