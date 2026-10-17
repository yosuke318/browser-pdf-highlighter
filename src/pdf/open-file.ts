// 読み込むファイルの確認と、読み込みに失敗したときの説明文。
// pdf.js 本体に依存しないので、Node.js のユニットテストからも使える。

/** PDFの先頭に必ずある "%PDF-" */
const PDF_SIGNATURE = [0x25, 0x50, 0x44, 0x46, 0x2d];
/** 仕様上、"%PDF-" は先頭1024バイト以内にあればよい */
const SIGNATURE_SEARCH_LIMIT = 1024;

/** ファイルの中身がPDFらしいか(先頭付近に "%PDF-" があるか)を確かめる */
export function hasPdfSignature(head: Uint8Array): boolean {
  const end = Math.min(head.length, SIGNATURE_SEARCH_LIMIT) - PDF_SIGNATURE.length;
  for (let i = 0; i <= end; i++) {
    if (PDF_SIGNATURE.every((byte, k) => head[i + k] === byte)) return true;
  }
  return false;
}

export type OpenErrorKind = "not-pdf" | "password" | "broken" | "unknown";

export class OpenPdfError extends Error {
  constructor(
    readonly kind: OpenErrorKind,
    options?: ErrorOptions,
  ) {
    super(`PDFを読み込めませんでした: ${kind}`, options);
    this.name = "OpenPdfError";
  }
}

/** pdf.js が投げた例外を、利用者に見せる失敗の種類に分ける */
export function classifyPdfjsError(error: unknown): OpenErrorKind {
  // pdf.js の例外クラスは name で見分けられる
  const name = error instanceof Error ? error.name : "";
  if (name === "PasswordException") return "password";
  if (name === "InvalidPDFException") return "broken";
  return "unknown";
}

const MESSAGES: Record<OpenErrorKind, string> = {
  "not-pdf": "PDFファイルではありません。PDFを選んでください。",
  password: "パスワードで保護されたPDFは開けません。パスワードを外したPDFを読み込んでください。",
  broken: "PDFを読み込めませんでした。ファイルが壊れていないか確認してください。",
  unknown: "PDFを読み込めませんでした。",
};

export function openErrorMessage(kind: OpenErrorKind): string {
  return MESSAGES[kind];
}
