import { describe, expect, it } from "vitest";
import {
  binarizeWithoutLines,
  estimateSkew,
  type GrayImage,
  otsuThreshold,
  preprocess,
  rotate,
  toGray,
  unrotatePoint,
} from "./preprocess.ts";

function blank(width: number, height: number): GrayImage {
  return { width, height, data: new Uint8Array(width * height).fill(255) };
}

function fillRect(image: GrayImage, x0: number, y0: number, x1: number, y1: number, value = 0) {
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) image.data[y * image.width + x] = value;
}

/** 文字の行に見立てた、横に並んだ小さな四角の列 */
function textLines(width: number, height: number): GrayImage {
  const image = blank(width, height);
  for (let y = 40; y < height - 40; y += 30) {
    for (let x = 40; x < width - 40; x += 14) fillRect(image, x, y, x + 9, y + 12);
  }
  return image;
}

const at = (image: GrayImage, x: number, y: number) => image.data[y * image.width + x];

describe("toGray", () => {
  it("RGBA をグレースケールにし、透明な部分は白にする", () => {
    const rgba = [0, 0, 0, 255, 255, 255, 255, 255, 0, 0, 0, 0];
    expect([...toGray(rgba, 3, 1).data]).toEqual([0, 255, 255]);
  });
});

describe("otsuThreshold", () => {
  it("文字と背景の間にしきい値を置く", () => {
    const image = blank(10, 10);
    fillRect(image, 0, 0, 10, 3, 30);
    const threshold = otsuThreshold(image);
    expect(threshold).toBeGreaterThan(30);
    expect(threshold).toBeLessThanOrEqual(255);
  });

  it("薄い灰色の地紋は背景の側に入る", () => {
    const image = blank(100, 100);
    fillRect(image, 0, 0, 100, 40, 205); // 地紋
    fillRect(image, 10, 50, 90, 60, 20); // 文字
    const threshold = otsuThreshold(image);
    expect(threshold).toBeGreaterThan(20);
    expect(threshold).toBeLessThanOrEqual(205);
  });
});

describe("estimateSkew と rotate", () => {
  it.each([0.6, -0.9, 1.5])("%f 度傾けた文字の行の傾きを推定できる", (degrees) => {
    const tilted = rotate(textLines(600, 500), degrees);
    expect(estimateSkew(tilted, 128)).toBeCloseTo(degrees, 1);
  });

  it("傾いていない画像は 0 度", () => {
    expect(estimateSkew(textLines(600, 500), 128)).toBeCloseTo(0, 1);
  });

  it("インクがほとんどない画像は 0 度", () => {
    expect(estimateSkew(blank(200, 200), 128)).toBe(0);
  });

  it("unrotatePoint は rotate の後の位置を元の画像の位置に戻す", () => {
    const image = blank(200, 100);
    fillRect(image, 150, 20, 152, 22);
    const rotated = rotate(image, 2);
    // 回転後にインクがある位置を探して戻すと、元の位置の近くになる
    let found: [number, number] | null = null;
    for (let y = 0; y < 100 && !found; y++)
      for (let x = 0; x < 200 && !found; x++) if ((at(rotated, x, y) ?? 255) < 128) found = [x, y];
    expect(found).not.toBeNull();
    const [x, y] = unrotatePoint(found?.[0] ?? 0, found?.[1] ?? 0, 2, 200, 100);
    expect(Math.abs(x - 150)).toBeLessThan(2);
    expect(Math.abs(y - 20)).toBeLessThan(2);
  });
});

describe("binarizeWithoutLines", () => {
  it("長い横線・縦線を消し、文字は残す", () => {
    const image = blank(200, 100);
    fillRect(image, 0, 10, 200, 12); // 横の罫線
    fillRect(image, 100, 0, 102, 100); // 縦の罫線
    fillRect(image, 20, 40, 30, 50); // 文字
    const { image: out, verticalLines } = binarizeWithoutLines(image, 128, 80, 60, 0);
    expect(verticalLines).toEqual([{ x0: 100, y0: 0, x1: 102, y1: 100 }]);
    expect(at(out, 50, 10)).toBe(255);
    expect(at(out, 100, 70)).toBe(255);
    expect(at(out, 25, 45)).toBe(0);
  });

  it("確定申告書のマス目のような短い縦線は、しきい値より長ければ消す", () => {
    const image = blank(100, 100);
    fillRect(image, 10, 10, 11, 60); // マス目の縦線(高さ 50)
    fillRect(image, 30, 20, 31, 50); // 数字「1」の縦画(高さ 30)
    const { image: out } = binarizeWithoutLines(image, 128, 1000, 45, 0);
    expect(at(out, 10, 30)).toBe(255);
    expect(at(out, 30, 30)).toBe(0);
  });

  it("罫線のすぐ隣のにじみも消す", () => {
    const image = blank(200, 20);
    fillRect(image, 0, 10, 200, 11);
    image.data[9 * 200 + 50] = 0; // 罫線に接したにじみ
    expect(at(binarizeWithoutLines(image, 128, 80, 1000, 1).image, 50, 9)).toBe(255);
    expect(at(binarizeWithoutLines(image, 128, 80, 1000, 0).image, 50, 9)).toBe(0);
  });
});

describe("preprocess", () => {
  it("傾きを補正し、白黒にする", () => {
    const tilted = rotate(textLines(600, 500), 0.8);
    const result = preprocess(tilted, 300);
    expect(result.skewDegrees).toBeCloseTo(0.8, 1);
    expect(new Set(result.image.data)).toEqual(new Set([0, 255]));
  });
});
