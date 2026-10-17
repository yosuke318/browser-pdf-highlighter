import { describe, expect, it } from "vitest";
import { convertValue } from "./convert.ts";

describe("convertValue", () => {
  it("yearMonth を YYYY-MM に変換する", () => {
    expect(convertValue("yearMonth", "令和3年4月")).toEqual({ value: "2021-04", warnings: [] });
    expect(convertValue("yearMonth", "平成元年1月")).toEqual({ value: "1989-01", warnings: [] });
    expect(convertValue("yearMonth", "2024/12")).toEqual({ value: "2024-12", warnings: [] });
    expect(convertValue("yearMonth", "2024-3")).toEqual({ value: "2024-03", warnings: [] });
  });

  it("number を数値に変換する", () => {
    expect(convertValue("number", "42歳")).toEqual({ value: 42, warnings: [] });
    expect(convertValue("number", "3.5人")).toEqual({ value: 3.5, warnings: [] });
    expect(convertValue("number", "12件")).toEqual({ value: 12, warnings: [] });
    expect(convertValue("number", "3400")).toEqual({ value: 3400, warnings: [] });
  });

  it("boolean を真偽値に変換する", () => {
    expect(convertValue("boolean", "有")).toEqual({ value: true, warnings: [] });
    expect(convertValue("boolean", "○")).toEqual({ value: true, warnings: [] });
    expect(convertValue("boolean", "なし")).toEqual({ value: false, warnings: [] });
    expect(convertValue("boolean", "無")).toEqual({ value: false, warnings: [] });
  });

  it("変換不能な値は null を返す", () => {
    expect(convertValue("yearMonth", "2024-13")).toBeNull();
    expect(convertValue("number", "3,500円")).toBeNull();
    expect(convertValue("boolean", "不明")).toBeNull();
  });
});
