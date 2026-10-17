import { expect, it } from "vitest";
import { isNormalChar, normalCharRatio } from "./char-class.ts";

it("日本語の書類に出てくる文字は正常とみなす", () => {
  for (const c of ["あ", "ア", "ｱ", "漢", "A", "1", "１", "、", "〒", "㈱", "①", "△", "¥", "⽀", "⺠", "𠮷"]) {
    expect(isNormalChar(c), c).toBe(true);
  }
});

it("私用領域の文字や制御文字は正常とみなさない", () => {
  for (const c of ["", "\u0001", "�", "ÿ", "Ж"]) {
    expect(isNormalChar(c), c).toBe(false);
  }
});

it("空白を除いた文字のうち、正常な文字の割合を求める", () => {
  expect(normalCharRatio("山田 太郎")).toBe(1);
  expect(normalCharRatio("ab")).toBe(0.5);
  expect(normalCharRatio("   ")).toBe(1);
});
