import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { getDocument, OPS } from "pdfjs-dist/legacy/build/pdf.mjs";
import { describe, expect, it } from "vitest";
import { normalizeText, rangeBBox } from "../text/normalize.ts";
import type { TextSegment } from "../text/types.ts";
import { readPage } from "./read-page.ts";
import { layoutText, type TextItemLike } from "./text-layout.ts";

const SAMPLES_DIR = join(import.meta.dirname, "../../samples");
const PDFJS_ROOT = dirname(createRequire(import.meta.url).resolve("pdfjs-dist/package.json"));
const STYLES = { f: { ascent: 0.8, descent: -0.2 } };

/** 横書きのテキスト片。1文字の幅は文字の大きさと同じ(全角文字を想定) */
function item(str: string, x: number, y: number, size = 10): TextItemLike {
  return { str, transform: [size, 0, 0, size, x, y], width: [...str].length * size, height: size, fontName: "f" };
}

const texts = (segments: TextSegment[]) => segments.map((s) => s.text);

describe("行・セルへのまとめ方", () => {
  it("1文字ずつ分かれた片を、1つの文字列につなげる", () => {
    const segments = layoutText([item("山", 100, 700), item("田", 110, 700), item("太", 120, 700)], STYLES);
    expect(texts(segments)).toEqual(["山田太"]);
  });

  it("少し離れた片の間には空白を入れ、大きく離れた片は別のセルにする", () => {
    const segments = layoutText([item("山田", 100, 700), item("太郎", 124, 700), item("5,800,000", 300, 700)], STYLES);
    expect(texts(segments)).toEqual(["山田 太郎", "5,800,000"]);
  });

  it("文字の大きさが違う片は、間が狭くても別のセルにする(ラベルと値)", () => {
    const segments = layoutText([item("住所", 50, 700, 8), item("見本県", 72, 698, 10)], STYLES);
    expect(texts(segments)).toEqual(["住所", "見本県"]);
  });

  it("行は上から、セルは左から並べる", () => {
    const segments = layoutText([item("下", 100, 600), item("右", 300, 700), item("左", 100, 700)], STYLES);
    expect(texts(segments)).toEqual(["左", "右", "下"]);
  });

  it("縦に1文字ずつ並んだ片は、縦書きの文字列として上から順につなげる", () => {
    const vertical = ["支", "払", "者"].map((c, i) => item(c, 40, 700 - i * 8, 8));
    // 同じ高さに横書きのラベルがあっても、縦書きの文字とはつなげない
    const segments = layoutText([...vertical, item("住所", 55, 700, 8)], STYLES);
    expect(texts(segments)).toContain("支払者");
    expect(texts(segments)).toContain("住所");
  });

  it("空白だけの片は捨てる", () => {
    expect(texts(layoutText([item(" ", 100, 700), item("A", 200, 700)], STYLES))).toEqual(["A"]);
  });

  it("1文字ごとの長方形を、ベースラインとフォントの上端・下端から求める", () => {
    const [segment] = layoutText([item("AB", 100, 700)], STYLES);
    expect(segment?.charBoxes).toEqual([
      { x0: 100, y0: 698, x1: 110, y1: 708 },
      { x0: 110, y0: 698, x1: 120, y1: 708 },
    ]);
    expect(segment?.bbox).toEqual({ x0: 100, y0: 698, x1: 120, y1: 708 });
    expect(segment?.source).toBe("pdf");
    expect(segment?.confidence).toBe(1);
  });
});

describe("サンプルの源泉徴収票", async () => {
  const data = new Uint8Array(await readFile(join(SAMPLES_DIR, "withholding-slip/text.pdf")));
  const doc = await getDocument({ data, cMapUrl: join(PDFJS_ROOT, "cmaps/"), cMapPacked: true }).promise;
  const reading = await readPage(await doc.getPage(1), OPS);
  await doc.loadingTask.destroy();
  const normalized = reading.pdfSegments.map((s) => ({ segment: s, n: normalizeText(s.text) }));
  const find = (text: string) => normalized.find((x) => x.n.text === text);

  it("表のセルごとに文字列を取り出せる", () => {
    for (const text of [
      "支払金額",
      "5,800,000",
      "4,200,000",
      "給与所得控除後の金額",
      "所得控除の額の合計額",
      "山田太郎",
      "株式会社サンプル商事",
    ]) {
      expect(find(text), text).toBeDefined();
    }
  });

  it("縦書きのラベルを取り出せる", () => {
    expect(find("支払を受ける者")).toBeDefined();
    expect(find("支払者")).toBeDefined();
  });

  it("支払金額の「内」と金額は別のセルになる", () => {
    expect(find("内")).toBeDefined();
    expect(normalized.some((x) => x.n.text.includes("内5,800,000"))).toBe(false);
  });

  it("任意の文字範囲の長方形を求められる", () => {
    const amount = find("5,800,000");
    if (!amount) throw new Error("支払金額が見つかりません");
    const whole = amount.segment.bbox;
    // 「800」の部分は、金額全体の長方形の内側で、左右が狭い
    const part = rangeBBox(amount.segment, amount.n, 2, 5);
    expect(part).not.toBeNull();
    if (!part) return;
    expect(part.x0).toBeGreaterThan(whole.x0);
    expect(part.x1).toBeLessThan(whole.x1);
    expect(part.y0).toBeCloseTo(whole.y0);
    expect(part.y1).toBeCloseTo(whole.y1);
  });
});

describe("少し傾いた文字", () => {
  /** 角度 deg だけ回転した1文字の片 */
  function tilted(str: string, x: number, y: number, deg: number, size = 11): TextItemLike {
    const r = (deg * Math.PI) / 180;
    const [cos, sin] = [Math.cos(r) * size, Math.sin(r) * size];
    return { str, transform: [cos, sin, -sin, cos, x, y], width: size, height: size, fontName: "f" };
  }

  it("1文字ずつ少し傾いた手書き風の文字を、横書きとしてつなげる", () => {
    const items = [tilted("サ", 107, 716, -3), tilted("ン", 118, 717, 4), tilted("プ", 129, 718, -1), tilted("ル", 140, 716, 5)];
    expect(texts(layoutText(items, STYLES))).toEqual(["サンプル"]);
  });

  it("大きく回転した文字(15度以上)は、横書きとしてつなげない", () => {
    const items = [tilted("A", 107, 716, 30), tilted("B", 118, 716, 30)];
    expect(texts(layoutText(items, STYLES))).toEqual(["A", "B"]);
  });
});
