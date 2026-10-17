// テスト用の小さな日本語PDFを組み立てる。
// フォントを埋め込まず、Adobe の定義済み CMap(UniJIS-UTF16-H)で文字を指定する。
// pdf.js はこの種のPDFを描画・文字抽出するときに CMap ファイルを読み込むので、
// CMap の配信設定が正しいかを確かめるのに使う。

function utf16beHex(text: string): string {
  return [...text]
    .map((c) => {
      const code = c.codePointAt(0);
      if (code === undefined || code > 0xffff) throw new Error(`BMP外の文字には対応していません: ${c}`);
      return code.toString(16).toUpperCase().padStart(4, "0");
    })
    .join("");
}

export function buildPredefinedCmapPdf(text: string): Uint8Array {
  const content = `BT /F1 24 Tf 72 720 Td <${utf16beHex(text)}> Tj ET`;
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>",
    `<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
    "<< /Type /Font /Subtype /Type0 /BaseFont /HeiseiKakuGo-W5 /Encoding /UniJIS-UTF16-H /DescendantFonts [6 0 R] >>",
    "<< /Type /Font /Subtype /CIDFontType0 /BaseFont /HeiseiKakuGo-W5 /CIDSystemInfo << /Registry (Adobe) /Ordering (Japan1) /Supplement 5 >> /FontDescriptor 7 0 R /DW 1000 >>",
    "<< /Type /FontDescriptor /FontName /HeiseiKakuGo-W5 /Flags 4 /FontBBox [-92 -250 1010 922] /ItalicAngle 0 /Ascent 880 /Descent -120 /CapHeight 737 /StemV 80 >>",
  ];

  // 本文はすべて ASCII なので、文字数がそのままバイト数になる
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
