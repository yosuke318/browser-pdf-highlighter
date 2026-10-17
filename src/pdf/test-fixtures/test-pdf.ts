// テスト用の小さなPDFを組み立てる。
// 本文はすべて ASCII で書くので、文字数がそのままバイト数になり、xref の位置を計算できる。

type Rotation = 0 | 90 | 180 | 270;

export interface TestPage {
  /** ページに書く文字列 */
  text: string;
  /** ページの /Rotate(表示するときの回転角度) */
  rotate?: Rotation;
  /** 用紙の大きさ(pt)。既定は A4 縦 */
  width?: number;
  height?: number;
}

/** オブジェクトの本文(1始まりの番号順)から、PDFファイルを組み立てる */
function assemble(objects: string[]): Uint8Array {
  let pdf = "%PDF-1.7\n";
  const offsets: number[] = [];
  objects.forEach((body, i) => {
    offsets.push(pdf.length);
    pdf += `${i + 1} 0 obj\n${body}\nendobj\n`;
  });
  const xrefOffset = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets) pdf += `${String(offset).padStart(10, "0")} 00000 n \n`;
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;
  return new TextEncoder().encode(pdf);
}

function stream(content: string): string {
  return `<< /Length ${content.length} >>\nstream\n${content}\nendstream`;
}

function escapePdfString(text: string): string {
  if (/[^\x20-\x7e]/.test(text)) throw new Error(`ASCII 以外の文字には対応していません: ${text}`);
  return text.replace(/[\\()]/g, (c) => `\\${c}`);
}

/**
 * 標準フォント(Helvetica)で1行ずつ文字を書いたページを並べたPDF。
 * 複数ページや回転したページの表示を確かめるのに使う。
 */
export function buildTestPdf(pages: TestPage[]): Uint8Array {
  // 1: カタログ, 2: ページツリー, 3: フォント, 4以降: ページとその内容を交互に置く
  const pageId = (i: number) => 4 + i * 2;
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    `<< /Type /Pages /Kids [${pages.map((_, i) => `${pageId(i)} 0 R`).join(" ")}] /Count ${pages.length} >>`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];
  for (const [i, page] of pages.entries()) {
    const width = page.width ?? 595;
    const height = page.height ?? 842;
    const content = `BT /F1 24 Tf 72 ${height - 96} Td (${escapePdfString(page.text)}) Tj ET`;
    objects.push(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${width} ${height}] /Rotate ${page.rotate ?? 0} /Resources << /Font << /F1 3 0 R >> >> /Contents ${pageId(i) + 1} 0 R >>`,
      stream(content),
    );
  }
  return assemble(objects);
}

function utf16beHex(text: string): string {
  return [...text]
    .map((c) => {
      const code = c.codePointAt(0);
      if (code === undefined || code > 0xffff) throw new Error(`BMP外の文字には対応していません: ${c}`);
      return code.toString(16).toUpperCase().padStart(4, "0");
    })
    .join("");
}

/**
 * フォントを埋め込まず、Adobe の定義済み CMap(UniJIS-UTF16-H)で文字を指定した日本語PDF。
 * pdf.js はこの種のPDFを描画・文字抽出するときに CMap ファイルを読み込むので、
 * CMap の配信設定が正しいかを確かめるのに使う。
 */
export function buildPredefinedCmapPdf(text: string): Uint8Array {
  return assemble([
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>",
    stream(`BT /F1 24 Tf 72 720 Td <${utf16beHex(text)}> Tj ET`),
    "<< /Type /Font /Subtype /Type0 /BaseFont /HeiseiKakuGo-W5 /Encoding /UniJIS-UTF16-H /DescendantFonts [6 0 R] >>",
    "<< /Type /Font /Subtype /CIDFontType0 /BaseFont /HeiseiKakuGo-W5 /CIDSystemInfo << /Registry (Adobe) /Ordering (Japan1) /Supplement 5 >> /FontDescriptor 7 0 R /DW 1000 >>",
    "<< /Type /FontDescriptor /FontName /HeiseiKakuGo-W5 /Flags 4 /FontBBox [-92 -250 1010 922] /ItalicAngle 0 /Ascent 880 /Descent -120 /CapHeight 737 /StemV 80 >>",
  ]);
}
