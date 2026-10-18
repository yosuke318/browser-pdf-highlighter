import { normalizeText } from "./normalize.ts";

// 前回と今回の文字列を比べるための「比較用の文字列」。
// 正規化(空白・全角半角・康熙部首)に加えて、表記ゆれを揃える。規則は
// .claude/skills/japanese-real-estate-docs/references/normalization.md のとおり。
// 比較用の文字列が同じでも元の文字列が違えば、差分では「表記の違い」として控えめに出す。

/** 法人の種類の略記(NFKC で「㈱」は「(株)」になっている) */
const COMPANY_ABBREVIATIONS: ReadonlyArray<readonly [string, string]> = [
  ["(株)", "株式会社"],
  ["(有)", "有限会社"],
  ["(同)", "合同会社"],
  ["(社)", "社団法人"],
  ["(財)", "財団法人"],
];

/** 比較では同じとみなす異体字(人名・地名に出てくるもの) */
const VARIANTS: Readonly<Record<string, string>> = {
  髙: "高",
  﨑: "崎",
  邊: "辺",
  邉: "辺",
  齋: "斎",
  齊: "斎",
  斉: "斎",
  德: "徳",
};

const KANJI_DIGITS: Readonly<Record<string, number>> = {
  〇: 0,
  一: 1,
  二: 2,
  三: 3,
  四: 4,
  五: 5,
  六: 6,
  七: 7,
  八: 8,
  九: 9,
};

/** 「十二」「二十三」「三」のような漢数字(99まで)を数字にする */
function kanjiToNumber(text: string): string {
  if (!text.includes("十")) return [...text].map((c) => KANJI_DIGITS[c] ?? c).join("");
  const [tens = "", ones = ""] = text.split("十");
  return String((tens === "" ? 1 : (KANJI_DIGITS[tens] ?? 0)) * 10 + (ones === "" ? 0 : (KANJI_DIGITS[ones] ?? 0)));
}

/** 住所の「1丁目2番3号」「一丁目二番三号」「1-2-3」を同じ形(1-2-3)にする */
function normalizeAddress(text: string): string {
  return text
    .replace(/([〇一二三四五六七八九十]+)(?=丁目|番地|番|号)/g, (m) => kanjiToNumber(m))
    .replace(/(\d+)丁目(\d+)番地?(\d+)号?/g, "$1-$2-$3")
    .replace(/(\d+)丁目(\d+)番地?/g, "$1-$2")
    .replace(/(\d+)番地(\d+)/g, "$1-$2")
    .replace(/(\d+)番地/g, "$1");
}

export function compareKey(text: string): string {
  let s = normalizeText(text).text;
  for (const [from, to] of COMPANY_ABBREVIATIONS) s = s.split(from).join(to);
  s = [...s].map((c) => VARIANTS[c] ?? c).join("");
  // 地名の「ヶ」「ケ」「が」(霞ヶ関・霞ケ関・霞が関)。「が」は漢字に挟まれているときだけ
  s = s.replace(/ヶ/g, "ケ").replace(/(?<=\p{Script=Han})が(?=\p{Script=Han})/gu, "ケ");
  return normalizeAddress(s);
}
