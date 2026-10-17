import { normalizeText } from "./normalize.ts";

// 書類に書かれた金額・日付・年を、比較できる値(円単位の整数、西暦の日付)に変える。
// 読み取れないものは null を返し、推測で埋めない。

// ---- 金額 ----

export interface ParsedMoney {
  /** 円単位の整数。△・▲ が付いたものは負の数 */
  yen: number;
}

/**
 * 金額の文字列を円単位の整数にする。
 * 「5,800,000」「¥5,800,000」「5,800,000円」「580万円」「420.5万円」「1,234千円」「△12,000」に対応する。
 * 空欄や「-」(該当なし)は null。
 */
export function parseMoney(raw: string): ParsedMoney | null {
  let text = normalizeText(raw).text.replace(/[※*]/g, "");
  let sign = 1;
  if (/^[△▲]/.test(text)) {
    sign = -1;
    text = text.slice(1);
  } else if (text.startsWith("-") && text.length > 1) {
    sign = -1;
    text = text.slice(1);
  }
  text = text.replace(/^[¥\\]/, "");
  const match = /^(\d{1,3}(?:,\d{3})+|\d+)(?:\.(\d+))?(万円|千円|万|千|円)?$/.exec(text);
  if (!match) return null;
  const [, integer = "", fraction, unit] = match;
  const value = Number(`${integer.replace(/,/g, "")}${fraction ? `.${fraction}` : ""}`);
  const multiplier = unit?.startsWith("万") ? 10_000 : unit?.startsWith("千") ? 1_000 : 1;
  const yen = Math.round(value * multiplier);
  // 小数のある円単位の金額(「1.5円」など)は書類には出てこないので、読み取り誤りとみなす
  if (multiplier === 1 && fraction) return null;
  return { yen: sign * yen };
}

// ---- 和暦 ----

interface Era {
  name: string;
  /** 略記(1文字の漢字・ローマ字) */
  abbreviations: readonly string[];
  /** 元年の西暦 - 1 */
  offset: number;
  /** この元号が始まった日(ISO形式) */
  start: string;
}

const ERAS: readonly Era[] = [
  { name: "令和", abbreviations: ["令", "R"], offset: 2018, start: "2019-05-01" },
  { name: "平成", abbreviations: ["平", "H"], offset: 1988, start: "1989-01-08" },
  { name: "昭和", abbreviations: ["昭", "S"], offset: 1925, start: "1926-12-25" },
  { name: "大正", abbreviations: ["大", "T"], offset: 1911, start: "1912-07-30" },
  { name: "明治", abbreviations: ["明", "M"], offset: 1867, start: "1868-01-25" },
];

const ERA_PATTERN = ERAS.flatMap((e) => [e.name, ...e.abbreviations]).join("|");

function findEra(token: string): Era | undefined {
  const upper = token.toUpperCase();
  return ERAS.find((e) => e.name === token || e.abbreviations.includes(upper));
}

function eraYear(era: Era, yearToken: string): number {
  return era.offset + (yearToken === "元" ? 1 : Number(yearToken));
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

function isValidDate(year: number, month: number, day: number): boolean {
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

export interface ParsedDate {
  /** 西暦の日付(YYYY-MM-DD) */
  iso: string;
  /** 確認が必要な点(元号の期間外の日付など) */
  warnings: string[];
}

/**
 * 日付の文字列を西暦の日付にする。
 * 和暦(「昭和63年4月15日」「平成元年1月8日」「R7.4.1」「H8/4/15」)と
 * 西暦(「1988年4月15日」「1988/4/15」「1988-04-15」)に対応する。
 */
export function parseDate(raw: string): ParsedDate | null {
  const text = normalizeText(raw).text;
  const wareki = new RegExp(`^(${ERA_PATTERN})(元|\\d{1,2})[年./-](\\d{1,2})[月./-](\\d{1,2})日?$`, "i").exec(text);
  if (wareki) {
    const [, eraToken = "", yearToken = "", m = "", d = ""] = wareki;
    const era = findEra(eraToken);
    if (!era) return null;
    return toParsedDate(eraYear(era, yearToken), Number(m), Number(d), era);
  }
  const western = /^(\d{4})[年./-](\d{1,2})[月./-](\d{1,2})日?$/.exec(text);
  if (western) {
    const [, y = "", m = "", d = ""] = western;
    return toParsedDate(Number(y), Number(m), Number(d));
  }
  return null;
}

function toParsedDate(year: number, month: number, day: number, era?: Era): ParsedDate | null {
  if (!isValidDate(year, month, day)) return null;
  const iso = `${year}-${pad(month)}-${pad(day)}`;
  const warnings: string[] = [];
  if (era) {
    const next = ERAS[ERAS.indexOf(era) - 1];
    if (iso < era.start || (next && iso >= next.start)) {
      warnings.push(`${era.name}の期間外の日付です。書き間違いの可能性があります`);
    }
    if (era.name === "明治") warnings.push("明治の日付です。読み取り誤りの可能性があります");
  }
  return { iso, warnings };
}

/**
 * 年の文字列を西暦の年にする。「令和7年分」「令和8年度」「2025年」「R7」に対応する。
 */
export function parseYear(raw: string): number | null {
  const text = normalizeText(raw).text.replace(/(年分|年度|年)$/, "");
  const wareki = new RegExp(`^(${ERA_PATTERN})(元|\\d{1,2})$`, "i").exec(text);
  if (wareki) {
    const era = findEra(wareki[1] ?? "");
    return era ? eraYear(era, wareki[2] ?? "") : null;
  }
  return /^\d{4}$/.test(text) ? Number(text) : null;
}
