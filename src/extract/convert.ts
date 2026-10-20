import type { FieldType } from "../schema/fields.ts";
import { normalizeForDisplay, normalizeText } from "../text/normalize.ts";
import { parseDate, parseMoney, parseYear } from "../text/values.ts";

// 値の候補の文字列を、項目の型に合わせて値にする。変換できなければ null(その候補は使わない)。

export interface Converted {
  value: unknown;
  /** 確認が必要な点(元号の期間外の日付など) */
  warnings: string[];
}

const ERA = "令和|平成|昭和|大正|明治|[令平昭大明RHSTM]";
const DATE_PREFIX = new RegExp(`^(?:(?:${ERA})(?:元|\\d{1,2})|\\d{4})[年./-]\\d{1,2}[月./-]\\d{1,2}日?`, "i");
/**
 * 元号・年・月・日が空白で区切られただけの日付。源泉徴収票の生年月日の欄のように、「年」「月」「日」が
 * 値の上の見出しにだけ書かれ、値は「昭和」「63」「4」「15」と別々のマスに入っているもの(マスをつなげると空白区切りになる)
 */
const SPACED_DATE = new RegExp(`^((?:${ERA})\\s*(?:元|\\d{1,2})|\\d{4})\\s+(\\d{1,2})\\s+(\\d{1,2})$`, "i");
const YEAR_MONTH = new RegExp(`^((?:${ERA})(?:元|\\d{1,2})|\\d{4})[年./-](\\d{1,2})月?$`, "i");

export function convertValue(type: FieldType, raw: string): Converted | null {
  const normalized = normalizeText(raw).text;
  if (normalized === "") return null;
  switch (type) {
    case "text": {
      // 記号だけの文字列(OCR が罫線の切れ端や汚れを「。」「|」と読んだものなど)は値にしない
      if (!/[\p{L}\p{N}]/u.test(normalized)) return null;
      // 前後に付いた句読点や縦線(OCR の汚れ)は除く。括弧や長音記号は値の一部なので残す
      const trimmed = raw.replace(/^[\s。、・|｜_.,]+|[\s。、・|｜_.,]+$/gu, "");
      // 康熙部首・全角英数字などは通常の文字にするが、空白は残す(氏名の「山田 太郎」など)
      return { value: normalizeForDisplay(trimmed), warnings: [] };
    }
    case "money": {
      const money = parseMoney(raw);
      return money ? { value: money.yen, warnings: [] } : null;
    }
    case "date": {
      // 「平成8年9月3日(30歳)」のように後ろに年齢などが続くときは、先頭の日付の部分だけを使う
      const spaced = SPACED_DATE.exec(raw.normalize("NFKC").trim());
      const date =
        parseDate(raw) ??
        parseDate(DATE_PREFIX.exec(normalized)?.[0] ?? "") ??
        (spaced ? parseDate(`${spaced[1]}年${spaced[2]}月${spaced[3]}日`) : null);
      return date ? { value: date.iso, warnings: date.warnings } : null;
    }
    case "year": {
      const year = parseYear(normalized.replace(/(分|度|中)$/, ""));
      return year ? { value: year, warnings: [] } : null;
    }
    case "yearMonth": {
      const m = YEAR_MONTH.exec(normalized);
      if (!m) return null;
      const year = parseYear(`${m[1] ?? ""}年`);
      const month = Number(m[2]);
      return year && month >= 1 && month <= 12 ? { value: `${year}-${String(month).padStart(2, "0")}`, warnings: [] } : null;
    }
    case "number": {
      const m = /^(\d+(?:\.\d+)?)(歳|年|ヶ月|か月|カ月|人|件)?$/.exec(normalized);
      return m ? { value: Number(m[1]), warnings: [] } : null;
    }
    case "boolean":
      if (/^(○|〇|◯|✓|✔|レ|有|あり)$/.test(normalized)) return { value: true, warnings: [] };
      if (/^(無|なし)$/.test(normalized)) return { value: false, warnings: [] };
      return null;
    case "list":
      // 表の行を取る抽出には、まだ対応していない
      return null;
  }
}
