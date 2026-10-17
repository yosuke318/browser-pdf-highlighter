import { describe, expect, it } from "vitest";
import { parseDate, parseMoney, parseYear } from "./values.ts";

describe("金額", () => {
  it.each([
    ["5,800,000", 5_800_000],
    ["５，８００，０００", 5_800_000],
    ["¥5,800,000", 5_800_000],
    ["￥5,800,000", 5_800_000],
    ["5,800,000円", 5_800_000],
    ["580万円", 5_800_000],
    ["420.5万円", 4_205_000],
    ["1,234千円", 1_234_000],
    ["△12,000", -12_000],
    ["▲12,000", -12_000],
    ["※ 166,900", 166_900],
    ["0", 0],
  ])("%s → %i 円", (raw, yen) => {
    expect(parseMoney(raw)).toEqual({ yen });
  });

  it.each(["", "-", "なし", "5,80,000", "1.5円", "580万円くらい"])("読み取れない「%s」は null", (raw) => {
    expect(parseMoney(raw)).toBeNull();
  });
});

describe("日付", () => {
  it.each([
    ["昭和63年4月15日", "1988-04-15"],
    ["昭和６３年４月１５日", "1988-04-15"],
    ["平成元年1月8日", "1989-01-08"],
    ["令和7年10月1日", "2025-10-01"],
    ["R7.4.1", "2025-04-01"],
    ["H8/4/15", "1996-04-15"],
    ["s63.4.15", "1988-04-15"],
    ["1988年4月15日", "1988-04-15"],
    ["1988/4/15", "1988-04-15"],
    ["1988-04-15", "1988-04-15"],
  ])("%s → %s", (raw, iso) => {
    expect(parseDate(raw)).toEqual({ iso, warnings: [] });
  });

  it("元号の期間外の日付は、変換したうえで注意を付ける", () => {
    // 令和は 2019-05-01 から。令和元年4月1日は存在しない
    const result = parseDate("令和元年4月1日");
    expect(result?.iso).toBe("2019-04-01");
    expect(result?.warnings).toHaveLength(1);
  });

  it("存在しない日付や、日付でない文字列は null", () => {
    expect(parseDate("令和7年2月30日")).toBeNull();
    expect(parseDate("昭和63年13月1日")).toBeNull();
    expect(parseDate("山田太郎")).toBeNull();
  });
});

describe("年", () => {
  it.each([
    ["令和7年分", 2025],
    ["令和8年度", 2026],
    ["令和元年", 2019],
    ["R7", 2025],
    ["2025年", 2025],
  ])("%s → %i", (raw, year) => {
    expect(parseYear(raw)).toBe(year);
  });

  it("年でない文字列は null", () => {
    expect(parseYear("年分")).toBeNull();
    expect(parseYear("12345")).toBeNull();
  });
});
