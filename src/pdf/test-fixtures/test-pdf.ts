// テスト用の小さなPDFを組み立てる。
// 本文はすべて ASCII で書くので、文字数がそのままバイト数になり、xref の位置を計算できる。

type Rotation = 0 | 90 | 180 | 270;

export interface TestPage {
  /** ページに書く文字列。行ごとに分ける */
  text: string | string[];
  /** ページの /Rotate(表示するときの回転角度) */
  rotate?: Rotation;
  /** 用紙の大きさ(pt)。既定は A4 縦 */
  width?: number;
  height?: number;
  /**
   * ページに画像を置く。スキャンしたページの再現に使う。
   * "full" はページ全体、"small" はページの一部(1/4 の大きさ)に置く
   */
  image?: "full" | "small";
  /** 文字を透明(描画モード 3)で書く。透明テキスト付きPDF(サーチャブルPDF)の再現に使う */
  invisibleText?: boolean;
  /**
   * 文字の対応表(ToUnicode)を壊して、取り出すと私用領域の文字になるようにする。
   * 文字化けしたテキストPDFの再現に使う
   */
  garbled?: boolean;
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

function stream(content: string, dict = ""): string {
  return `<< /Length ${content.length} ${dict}>>\nstream\n${content}\nendstream`;
}

function escapePdfString(text: string): string {
  if (/[^\x20-\x7e]/.test(text)) throw new Error(`ASCII 以外の文字には対応していません: ${text}`);
  return text.replace(/[\\()]/g, (c) => `\\${c}`);
}

// 共通のオブジェクトの番号
const FONT = 3;
const GARBLED_FONT = 4;
const GARBLED_TO_UNICODE = 5;
const IMAGE = 6;
const FIRST_PAGE = 7;

/** 0x20〜0x7E の文字を、私用領域(U+E020〜)の文字として取り出させる対応表 */
const GARBLED_CMAP = [
  "/CIDInit /ProcSet findresource begin 12 dict begin begincmap",
  "/CMapName /Garbled def /CMapType 2 def",
  "1 begincodespacerange <00> <FF> endcodespacerange",
  "1 beginbfrange <20> <7E> <E020> endbfrange",
  "endcmap CMapName currentdict /CMap defineresource pop end end",
].join("\n");

/**
 * 標準フォント(Helvetica)で文字を書いたページを並べたPDF。
 * 複数ページ・回転したページの表示や、ページの種類の判別を確かめるのに使う。
 */
export function buildTestPdf(pages: TestPage[]): Uint8Array {
  // 1: カタログ, 2: ページツリー, 3〜6: フォントと画像, 7以降: ページとその内容を交互に置く
  const pageId = (i: number) => FIRST_PAGE + i * 2;
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    `<< /Type /Pages /Kids [${pages.map((_, i) => `${pageId(i)} 0 R`).join(" ")}] /Count ${pages.length} >>`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    `<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /ToUnicode ${GARBLED_TO_UNICODE} 0 R >>`,
    stream(GARBLED_CMAP),
    // 2x2 の灰色の画像。中身を ASCII にするため ASCIIHexDecode で書く
    stream(
      "80808080>",
      "/Type /XObject /Subtype /Image /Width 2 /Height 2 /ColorSpace /DeviceGray /BitsPerComponent 8 /Filter /ASCIIHexDecode ",
    ),
  ];
  for (const [i, page] of pages.entries()) {
    const width = page.width ?? 595;
    const height = page.height ?? 842;
    const lines = Array.isArray(page.text) ? page.text : [page.text];
    const ops: string[] = [];
    if (page.image === "full") ops.push(`q ${width} 0 0 ${height} 0 0 cm /Im1 Do Q`);
    if (page.image === "small") ops.push(`q ${width / 2} 0 0 ${height / 2} 0 0 cm /Im1 Do Q`);
    const font = page.garbled ? "/F2" : "/F1";
    lines.forEach((line, k) => {
      if (line === "") return;
      ops.push(
        `BT ${font} 12 Tf ${page.invisibleText ? "3 Tr " : ""}72 ${height - 72 - k * 18} Td (${escapePdfString(line)}) Tj ET`,
      );
    });
    objects.push(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${width} ${height}] /Rotate ${page.rotate ?? 0} /Resources << /Font << /F1 ${FONT} 0 R /F2 ${GARBLED_FONT} 0 R >> /XObject << /Im1 ${IMAGE} 0 R >> >> /Contents ${pageId(i) + 1} 0 R >>`,
      stream(ops.join("\n")),
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
