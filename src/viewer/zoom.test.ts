import { describe, expect, it } from "vitest";
import { fitWidthScale, formatPercent, MAX_ZOOM, MIN_ZOOM, resolveScale, ZOOM_STEPS, zoomIn, zoomOut } from "./zoom.ts";

describe("ズームの段階", () => {
  it("1段ずつ拡大・縮小する", () => {
    expect(zoomIn(1)).toBe(1.1);
    expect(zoomOut(1)).toBe(0.9);
  });

  it("段階の途中の倍率(幅に合わせたとき)からは、次の段階へ進む", () => {
    expect(zoomIn(1.03)).toBe(1.1);
    expect(zoomOut(1.03)).toBe(1);
  });

  it("最大・最小を超えない", () => {
    expect(zoomIn(MAX_ZOOM)).toBe(MAX_ZOOM);
    expect(zoomOut(MIN_ZOOM)).toBe(MIN_ZOOM);
  });
});

describe("幅に合わせる", () => {
  it("表示領域の幅 ÷ ページの幅", () => {
    expect(fitWidthScale(595, 1190)).toBe(2);
  });

  it("極端に狭い・広い表示領域でも、最小・最大の倍率に収める", () => {
    expect(fitWidthScale(595, 100)).toBe(MIN_ZOOM);
    expect(fitWidthScale(100, 10000)).toBe(MAX_ZOOM);
  });

  it("大きさがまだ分からないときは 1 にする", () => {
    expect(fitWidthScale(0, 800)).toBe(1);
    expect(fitWidthScale(595, 0)).toBe(1);
  });

  it("倍率指定のときは、表示領域の幅に関係なくその倍率を使う", () => {
    expect(resolveScale({ mode: "scale", scale: 1.5 }, 595, 300)).toBe(1.5);
    expect(resolveScale({ mode: "fit-width" }, 595, 1190)).toBe(2);
  });
});

it("倍率を百分率で表示する", () => {
  expect(formatPercent(1)).toBe("100%");
  expect(formatPercent(0.666)).toBe("67%");
});

it("最小・最大の倍率は、段階の両端と同じ", () => {
  expect(MIN_ZOOM).toBe(ZOOM_STEPS[0]);
  expect(MAX_ZOOM).toBe(ZOOM_STEPS[ZOOM_STEPS.length - 1]);
});
