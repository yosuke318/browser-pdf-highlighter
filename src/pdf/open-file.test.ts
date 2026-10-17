import { getDocument, InvalidPDFException, PasswordException } from "pdfjs-dist/legacy/build/pdf.mjs";
import { describe, expect, it } from "vitest";
import { classifyPdfjsError, hasPdfSignature } from "./open-file.ts";
import { buildTestPdf } from "./test-fixtures/test-pdf.ts";

const encode = (s: string) => new TextEncoder().encode(s);

describe("PDFかどうかの確認", () => {
  it("先頭が %PDF- ならPDF", () => {
    expect(hasPdfSignature(buildTestPdf([{ text: "a" }]))).toBe(true);
  });

  it("%PDF- の前に余計なバイトがあっても、1024バイト以内ならPDF", () => {
    expect(hasPdfSignature(encode(`${" ".repeat(100)}%PDF-1.7`))).toBe(true);
    expect(hasPdfSignature(encode(`${" ".repeat(1100)}%PDF-1.7`))).toBe(false);
  });

  it("画像やテキストはPDFではない", () => {
    expect(hasPdfSignature(new Uint8Array([0x89, 0x50, 0x4e, 0x47]))).toBe(false);
    expect(hasPdfSignature(encode("hello"))).toBe(false);
    expect(hasPdfSignature(new Uint8Array())).toBe(false);
  });
});

describe("pdf.js の例外の分類", () => {
  it("パスワード付き・壊れたPDFを見分ける", () => {
    expect(classifyPdfjsError(new PasswordException("need password", 1))).toBe("password");
    expect(classifyPdfjsError(new InvalidPDFException("broken"))).toBe("broken");
    expect(classifyPdfjsError(new Error("other"))).toBe("unknown");
    expect(classifyPdfjsError("not an error")).toBe("unknown");
  });

  it("先頭だけPDFで中身が壊れたファイルは broken になる", async () => {
    const error = await getDocument({ data: encode("%PDF-1.7\nこわれたファイル") }).promise.catch((e: unknown) => e);
    expect(classifyPdfjsError(error)).toBe("broken");
  });
});
