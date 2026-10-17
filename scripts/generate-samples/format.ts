// HTMLテンプレートで使う書式変換。値はすべてダミーデータ。

export type IsoDate = `${number}-${number}-${number}`;

/** 3桁区切りの金額表記 */
export function yen(value: number): string {
  return value.toLocaleString("ja-JP");
}

/** 万円単位の表記(住宅ローン・入居申込書の年収欄など) */
export function manYen(value: number): string {
  return (value / 10_000).toLocaleString("ja-JP");
}

const ERAS = [
  { name: "令和", start: "2019-05-01" },
  { name: "平成", start: "1989-01-08" },
  { name: "昭和", start: "1926-12-25" },
] as const;

export interface Wareki {
  era: (typeof ERAS)[number]["name"];
  year: number;
  month: number;
  day: number;
}

/** 西暦の日付を和暦に変換する */
export function toWareki(date: IsoDate): Wareki {
  const [y, m, d] = date.split("-").map(Number) as [number, number, number];
  const era = ERAS.find((e) => date >= e.start);
  if (!era) throw new Error(`昭和より前の日付には対応していません: ${date}`);
  const eraStartYear = Number(era.start.slice(0, 4));
  return { era: era.name, year: y - eraStartYear + 1, month: m, day: d };
}

/** 「昭和63年4月15日」形式 */
export function warekiText(date: IsoDate): string {
  const w = toWareki(date);
  return `${w.era}${w.year}年${w.month}月${w.day}日`;
}

/** 満年齢 */
export function age(birth: IsoDate, at: IsoDate): number {
  const [by, bm, bd] = birth.split("-").map(Number) as [number, number, number];
  const [ay, am, ad] = at.split("-").map(Number) as [number, number, number];
  return ay - by - (am < bm || (am === bm && ad < bd) ? 1 : 0);
}

export function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/** 確定申告書のように、金額を1桁ずつマス目に入れて右詰めで表示する */
export function digitCells(value: number | null, cells: number): string {
  const digits = value === null ? "" : String(value);
  if (digits.length > cells) throw new Error(`${value} は ${cells} 桁に収まりません`);
  const padded = digits.padStart(cells, " ");
  return `<span class="digits">${[...padded].map((c) => `<span class="digit">${c === " " ? "" : c}</span>`).join("")}</span>`;
}
