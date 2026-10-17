import { describe, expect, it } from "vitest";
import { groupLines } from "./lines.ts";
import type { TextSegment } from "./types.ts";

function segment(text: string, x0: number, y0: number, x1: number, y1: number): TextSegment {
  return {
    text,
    bbox: { x0, y0, x1, y1 },
    charBoxes: Array.from({ length: [...text].length }, (_, i) => ({
      x0: x0 + i * 10,
      y0,
      x1: x0 + i * 10 + 10,
      y1,
    })),
    confidence: 1,
    source: "pdf",
  };
}

describe("groupLines", () => {
  it("縦長のセルは独立した行になる", () => {
    const lines = groupLines([segment("A", 0, 10, 20, 30), segment("B", 40, 10, 60, 30), segment("縦書き", 10, 0, 30, 80)]);

    expect(lines.map((line) => line.segments.map((s) => s.text))).toEqual([["縦書き"], ["A", "B"]]);
  });
});
