import { type FieldDefinition, type FieldType, findDocument } from "../schema/fields.ts";
import { groupLines } from "../text/lines.ts";
import { type NormalizedText, normalizeText } from "../text/normalize.ts";
import type { Rect, TextSegment } from "../text/types.ts";
import { convertValue } from "./convert.ts";
import type {
  ColumnRule,
  DocumentRules,
  LabelRule,
  PatternRule,
  RegionRule,
  RelativeRect,
  Rule,
  Section,
  TableRule,
} from "./rules.ts";

// 抽出ルールの実行。書類定義(DocumentRules)のルールを、ページから取り出した文字(TextSegment)に当てはめ、
// 項目ごとに値と、その値がPDF上のどこにあったか(ページ・長方形)を返す。
// 文字の取り出し方法(pdf.js / OCR)は意識しない。

/** ルールを当てはめる1ページ分の文字 */
export interface ExtractionPage {
  pageNumber: number;
  /** ページの範囲 [x0, y0, x1, y1](PDFページ座標) */
  view: [number, number, number, number];
  segments: TextSegment[];
}

/** 1項目の抽出結果 */
export interface FieldResult {
  key: string;
  label: string;
  type: FieldType;
  required: boolean;
  /** false なら「未検出」 */
  found: boolean;
  value?: unknown;
  /** 値の部分の、取り出したままの文字列 */
  rawText?: string;
  /** 値の部分を囲む長方形(PDFページ座標)。セルに分かれた値はセルごと */
  bbox: Rect[];
  page?: number;
  /** 確からしさ(0〜1)。文字の読み取りの確からしさと、何番目のルールで取れたかから決める */
  confidence?: number;
  /** 値を取ったルール(rules.ts の id。なければ「種類#番号」) */
  ruleId?: string;
  source?: "pdf" | "ocr";
  /** 確認が必要な点 */
  warnings: string[];
  /** ほかの項目から計算した値のとき、もとの項目のキー(derive ルール) */
  derivedFrom?: string;
}

export interface ExtractionResult {
  documentId: string;
  fields: FieldResult[];
}

/** ルールが見つけた値の候補 */
interface Candidate {
  page: number;
  raw: string;
  value: unknown;
  warnings: string[];
  boxes: Rect[];
  segments: TextSegment[];
  /** ラベルからの距離など。小さいほど優先する */
  distance: number;
  /** 文字の大きさ(セルの高さの最大) */
  size: number;
}

const DEFAULT_MAX_DISTANCE = { right: 25, below: 5 } as const;
const DEFAULT_MAX_CELLS = 6;
/** 値が複数のセルに分かれているとき、セルとセルの間の最大の距離(文字の高さの何倍か) */
const MAX_CELL_GAP = 3;
/** 金額の単位だけのセル */
const UNIT_ONLY = /^(万円|千円|円|万|千)$/;
/** 2番目以降のルールで取れた値の確からしさを、1つ下がるごとにこれだけ下げる */
const RULE_PENALTY = 0.1;
/** avoid に合う値の候補の距離に足す値(向きの優先順位より大きくする) */
const AVOIDED = 1e9;
/**
 * PDF の文字と OCR の文字が混ざったページ(画像の様式に値の文字を重ねたPDF)で、OCR の文字だけでできた値の候補の
 * 距離に足す値。このページの値は PDF の文字で、OCR の文字は様式の欄の名前なので、PDF の文字の候補を先に使う
 */
const OCR_ON_OVERLAY = 1e8;

// ---- 文字列と座標の補助 ----

const normalizedCache = new WeakMap<TextSegment, NormalizedText>();
function norm(segment: TextSegment): NormalizedText {
  let n = normalizedCache.get(segment);
  if (!n) {
    n = normalizeText(segment.text);
    normalizedCache.set(segment, n);
  }
  return n;
}

const height = (r: Rect) => r.y1 - r.y0;
const centerX = (r: Rect) => (r.x0 + r.x1) / 2;
const centerY = (r: Rect) => (r.y0 + r.y1) / 2;

function verticalOverlap(a: Rect, b: Rect): number {
  return Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0);
}

/** セルの中の、元の文字位置 [start, end) の文字列と長方形 */
function sliceSegment(segment: TextSegment, start: number, end: number): { raw: string; boxes: Rect[] } {
  const chars = [...segment.text].slice(start, end);
  const boxes = segment.charBoxes.slice(start, end);
  return { raw: chars.join(""), boxes: boxes.length > 0 ? [unionAll(boxes)] : [segment.bbox] };
}

function unionAll(rects: Rect[]): Rect {
  return {
    x0: Math.min(...rects.map((r) => r.x0)),
    y0: Math.min(...rects.map((r) => r.y0)),
    x1: Math.max(...rects.map((r) => r.x1)),
    y1: Math.max(...rects.map((r) => r.y1)),
  };
}

// ---- 探す範囲 ----

function inRelativeRect(segment: TextSegment, rect: RelativeRect, view: ExtractionPage["view"]): boolean {
  const [vx0, vy0, vx1, vy1] = view;
  const x = (centerX(segment.bbox) - vx0) / (vx1 - vx0);
  const y = (vy1 - centerY(segment.bbox)) / (vy1 - vy0);
  return x >= rect.x0 && x <= rect.x1 && y >= rect.y0 && y <= rect.y1;
}

// ---- 分かれて読まれた欄の名前・見出しをつなげる ----

/** つなげて作ったセルの、もとのセルと文字の高さ */
const joinedParts = new WeakMap<TextSegment, { members: TextSegment[]; charHeight: number }>();

function joinSegments(members: TextSegment[], separator: string): TextSegment {
  const charBoxes: Rect[] = [];
  members.forEach((m, i) => {
    if (i > 0 && separator) charBoxes.push(m.bbox);
    charBoxes.push(...m.charBoxes);
  });
  const joined: TextSegment = {
    text: members.map((m) => m.text).join(separator),
    bbox: unionAll(members.map((m) => m.bbox)),
    charBoxes,
    confidence: Math.min(...members.map((m) => m.confidence)),
    source: members.some((m) => m.source === "ocr") ? "ocr" : "pdf",
  };
  joinedParts.set(joined, { members, charHeight: Math.max(...members.map((m) => height(m.bbox))) });
  return joined;
}

/** 欄の名前の文字の高さ。縦につなげたセルは、1文字の高さ */
function charHeightOf(segment: TextSegment): number {
  return joinedParts.get(segment)?.charHeight ?? height(segment.bbox);
}

/** 縦書きの欄の名前とみなす、1文字ずつのセルの間の最大の距離(文字の高さの何倍か) */
const MAX_VERTICAL_GAP = 2.5;
/** 縦につなげるセルの最大の数 */
const MAX_VERTICAL_CELLS = 8;

/**
 * 縦書きの欄の名前(源泉徴収票の「氏名」など)は、OCR では1文字ずつ別のセルとして読まれる。
 * 1〜2文字のセルが縦に並んでいれば、上から順につなげたセルを作る(並びの途中から始まるもの・途中で終わるものも作る)。
 * もとのセルはそのまま残し、つなげたセルは欄の名前を探すときにだけ使う
 */
function verticalLabels(segments: readonly TextSegment[]): TextSegment[] {
  const short = segments
    .filter((s) => {
      const length = [...norm(s).text].length;
      return length >= 1 && length <= 2;
    })
    .sort((p, q) => q.bbox.y1 - p.bbox.y1);
  const used = new Set<TextSegment>();
  const joined: TextSegment[] = [];
  for (const start of short) {
    if (used.has(start)) continue;
    const chain = [start];
    for (let last = start; chain.length < MAX_VERTICAL_CELLS; ) {
      const h = height(last.bbox);
      const next = short.find(
        (s) =>
          !used.has(s) &&
          !chain.includes(s) &&
          s.bbox.y1 <= last.bbox.y0 + h / 3 &&
          last.bbox.y0 - s.bbox.y1 <= MAX_VERTICAL_GAP * h &&
          Math.abs(centerX(s.bbox) - centerX(last.bbox)) <= h / 2,
      );
      if (!next) break;
      chain.push(next);
      last = next;
    }
    if (chain.length < 2) continue;
    for (const s of chain) used.add(s);
    for (let i = 0; i < chain.length; i++) {
      for (let j = i + 2; j <= chain.length; j++) joined.push(joinSegments(chain.slice(i, j), ""));
    }
  }
  return joined;
}

/**
 * 見出しを探す。見つからなければ、同じ行で別々のセルに分かれた見出し(OCR の「給与所得」「の源泉徴収票」など)と、
 * 縦書きで1文字ずつ読まれた見出しも探す
 */
function findHeading(segments: TextSegment[], headings: readonly string[]): TextSegment | undefined {
  const targets = headings.map((h) => normalizeText(h).text);
  const find = (candidates: readonly TextSegment[]) =>
    candidates.filter((s) => targets.some((t) => norm(s).text.includes(t))).sort((p, q) => q.bbox.y1 - p.bbox.y1)[0];
  return (
    find(segments) ??
    find([
      ...groupLines(segments)
        .filter((line) => line.segments.length >= 2)
        .map((line) => joinSegments(line.segments, "")),
      ...verticalLabels(segments),
    ])
  );
}

function inSection(segments: TextSegment[], section: Section): TextSegment[] {
  const start = findHeading(segments, section.start);
  if (!start) return [];
  const below = segments.filter((s) => centerY(s.bbox) <= start.bbox.y1);
  const end = section.end
    ? findHeading(
        below.filter((s) => s.bbox.y1 < start.bbox.y0),
        section.end,
      )
    : undefined;
  return below.filter((s) => !end || centerY(s.bbox) > end.bbox.y1);
}

function scope(page: ExtractionPage, rule: { section?: Section; region?: RelativeRect; pdfTextOnly?: boolean }): TextSegment[] {
  let segments = rule.pdfTextOnly ? page.segments.filter((s) => s.source === "pdf") : page.segments;
  if (rule.region) {
    const region = rule.region;
    segments = segments.filter((s) => inRelativeRect(s, region, page.view));
  }
  if (rule.section) segments = inSection(segments, rule.section);
  return segments;
}

/** 縦書きの見出し(縦長で2文字以上のセル) */
function isVerticalHeading(s: TextSegment): boolean {
  return height(s.bbox) > (s.bbox.x1 - s.bbox.x0) * 1.5 && [...s.text].length >= 2;
}

/**
 * ラベルの区分(左にある縦書きの見出し)。左にある縦書きの見出しのうち、最も近い列にあるものから、
 * 縦の位置が最も近いものを選ぶ
 */
function sideHeadingOf(anchor: TextSegment, segments: TextSegment[]): TextSegment | undefined {
  const left = segments.filter((s) => isVerticalHeading(s) && s.bbox.x1 <= anchor.bbox.x0 + height(anchor.bbox) / 2);
  if (left.length === 0) return undefined;
  const nearestColumn = Math.max(...left.map((s) => s.bbox.x1));
  return left
    .filter((s) => nearestColumn - s.bbox.x1 < height(anchor.bbox) * 2)
    .sort((p, q) => Math.abs(centerY(p.bbox) - centerY(anchor.bbox)) - Math.abs(centerY(q.bbox) - centerY(anchor.bbox)))[0];
}

// ---- 値の候補を、型に合わせて変換する ----

function accepted(rule: { accept?: RegExp; reject?: RegExp }, raw: string): boolean {
  const n = normalizeText(raw).text;
  if (rule.accept && !rule.accept.test(n)) return false;
  if (rule.reject?.test(n)) return false;
  return true;
}

function toCandidate(
  type: FieldType,
  rule: { accept?: RegExp; reject?: RegExp; remove?: RegExp },
  page: number,
  parts: { raw: string; boxes: Rect[]; segment: TextSegment }[],
  distance: number,
): Candidate | null {
  const raw = parts.map((p) => p.raw).join(" ");
  if (!accepted(rule, raw)) return null;
  // 敬称(「様」)など、値に含めない部分を除いてから変換する。取り出したままの文字列(raw)には残す
  const converted = convertValue(type, rule.remove ? raw.replace(rule.remove, "") : raw);
  if (!converted) return null;
  return {
    page,
    raw,
    value: converted.value,
    warnings: converted.warnings,
    boxes: parts.flatMap((p) => p.boxes),
    segments: parts.map((p) => p.segment),
    distance,
    size: Math.max(...parts.map((p) => height(p.segment.bbox))),
  };
}

const whole = (segment: TextSegment) => ({ raw: segment.text, boxes: [segment.bbox], segment });

/** 1〜3桁の数字だけのセル */
const LONE_DIGITS = /^\d{1,3}$/;
/** 3桁ずつ区切った数字のセル(「800 000」「800,000」「800」) */
const DIGIT_GROUPS = /^\d{3}(?:[ ,]\d{3})*$/;
/** 金額の続きとみなす、セルとセルの間の最大の距離(文字の高さの何倍か) */
const MAX_AMOUNT_GAP = 2;

/**
 * 金額が、先頭の桁と残りの桁で別々のセルに分かれているか(「5」「800 000」)。
 * 源泉徴収票の電子交付のPDFには、様式の「千」「円」の区切りに合わせて数字を置くため、
 * 先頭の桁だけが離れて別の文字列になっているものがある。
 * 実物では、同じ金額の中の間は文字の高さの1〜1.6倍、別の金額との間は2倍以上だった
 */
function splitAmount(cell: TextSegment, next: TextSegment | undefined): boolean {
  if (!next) return false;
  const head = cell.text.normalize("NFKC").trim();
  const rest = next.text.normalize("NFKC").trim();
  if (!LONE_DIGITS.test(head) || !DIGIT_GROUPS.test(rest)) return false;
  return next.bbox.x0 - cell.bbox.x1 <= MAX_AMOUNT_GAP * height(cell.bbox);
}

// ---- ルールの種類ごとの処理 ----

/** 同じ行で、start から右へ続くセル(間が広すぎないもの) */
function rowFrom(start: TextSegment, segments: TextSegment[], maxCells: number): TextSegment[] {
  const h = height(start.bbox);
  const row = segments
    .filter((s) => s === start || (s.bbox.x0 >= start.bbox.x1 - h / 2 && verticalOverlap(s.bbox, start.bbox) > h / 2))
    .sort((p, q) => p.bbox.x0 - q.bbox.x0);
  const chain = [start];
  for (const s of row) {
    const last = chain.at(-1);
    if (s === start || !last) continue;
    if (chain.length >= maxCells || s.bbox.x0 - last.bbox.x1 > MAX_CELL_GAP * h) break;
    chain.push(s);
  }
  return chain;
}

/**
 * OCR の読み違いを許して、ラベルと同じとみなせるか。
 * 同じ長さで、違う文字が少ないもの(4文字以上なら1文字、10文字以上なら2文字まで)だけを認める。
 * 文字の増減は認めない(「生命保険料の控除額」と「地震保険料の控除額」のような別のラベルと取り違えないため)
 */
export function nearlySame(text: string, label: string): boolean {
  const a = [...text];
  const b = [...label];
  if (a.length !== b.length || b.length < 4) return false;
  const allowed = b.length >= 10 ? 2 : 1;
  let diff = 0;
  for (let i = 0; i < b.length; i++) if (a[i] !== b[i] && ++diff > allowed) return false;
  return true;
}

/**
 * 下向きに探すときの、ラベルから値までの距離。
 * 縦の距離は文字の高さの半分の刻みで比べ、同じ刻みなら横にずれていない方を近いとする
 * (OCR では同じ行の値でも、セルごとに高さがわずかにずれるため、縦の距離だけでは隣の列の値を選んでしまう)
 */
function belowDistance(anchor: TextSegment, value: TextSegment, h: number): number {
  const step = h / 2;
  const rows = Math.round((anchor.bbox.y0 - value.bbox.y1) / step);
  const offset = Math.abs(centerX(value.bbox) - centerX(anchor.bbox));
  return rows * step + Math.min(offset, 1e3) / 1e4;
}

function labelCandidates(rule: LabelRule, type: FieldType, page: ExtractionPage): Candidate[] {
  const segments = scope(page, rule);
  const labels = rule.labels.map((l) => normalizeText(l).text);
  const directions = Array.isArray(rule.direction) ? rule.direction : [rule.direction];
  const maxCells = rule.maxCells ?? DEFAULT_MAX_CELLS;
  const candidates: Candidate[] = [];

  const inline = rule.inline ?? type !== "text";

  const sideHeadings = rule.sideHeading?.map((h) => normalizeText(h).text);
  const overlay = page.segments.some((s) => s.source === "pdf") && page.segments.some((s) => s.source === "ocr");

  for (const anchor of [...segments, ...verticalLabels(segments)]) {
    const n = norm(anchor);
    const ocr = anchor.source === "ocr";
    const label = labels.find(
      (l) =>
        n.text === l ||
        (inline && n.text.startsWith(l)) ||
        (ocr && (nearlySame(n.text, l) || (inline && nearlySame(n.text.slice(0, l.length), l)))),
    );
    if (label === undefined) continue;
    if (sideHeadings) {
      // 区分の見出しは、範囲を絞る前のページ全体から探す
      const heading = sideHeadingOf(anchor, page.segments);
      if (!heading || !sideHeadings.includes(norm(heading).text)) continue;
    }

    // ラベルと値が1つのセルになっている(「(受給者番号)00123」など)。
    // 続きが値にならなければ(「課税標準額(総所得)」のようにラベルに補足が付いているだけなら)、隣のセルを探す
    if (n.text.length > label.length) {
      const startSource = n.sourceIndex[label.length];
      if (startSource !== undefined) {
        const part = sliceSegment(anchor, startSource, [...anchor.text].length);
        const c = toCandidate(type, rule, page.pageNumber, [{ ...part, segment: anchor }], 0);
        if (c) {
          candidates.push(c);
          continue;
        }
      }
    }

    const h = charHeightOf(anchor);
    const members = joinedParts.get(anchor)?.members ?? [anchor];
    directions.forEach((direction, dirIndex) => {
      const maxDistance = (rule.maxDistance ?? DEFAULT_MAX_DISTANCE[direction]) * h;
      const others = segments.filter((s) => !members.includes(s));
      // 値の始まりの候補を、近い順に並べる
      const starts =
        direction === "right"
          ? others
              .filter((s) => verticalOverlap(s.bbox, anchor.bbox) > Math.min(h, height(s.bbox)) / 2)
              .map((s) => ({ s, gap: s.bbox.x0 - anchor.bbox.x1 }))
              .filter(({ gap }) => gap >= -h / 2 && gap <= maxDistance)
              .sort((p, q) => p.gap - q.gap)
          : others
              .filter((s) => s.bbox.x1 > anchor.bbox.x0 - 2 * h && s.bbox.x0 < anchor.bbox.x1 + 2 * h)
              .map((s) => ({ s, gap: belowDistance(anchor, s, h) }))
              .filter(({ s }) => {
                const gap = anchor.bbox.y0 - s.bbox.y1;
                return gap >= -h / 3 && gap <= maxDistance;
              })
              .sort((p, q) => p.gap - q.gap);

      for (const { s, gap } of starts) {
        const row = rowFrom(s, others, maxCells);
        for (let k = 1; k <= row.length; k++) {
          // 先頭の桁だけのセル(「5」「800 000」の「5」)で金額にしない。続きのセルも含める
          if (type === "money" && splitAmount(row[k - 1] as TextSegment, row[k])) continue;
          // 金額の直後に単位だけのセル(「420」「万円」)があれば、単位も含めて変換する
          const next = row[k];
          const withUnit = type === "money" && next && UNIT_ONLY.test(norm(next).text) ? k + 1 : k;
          // 向きの優先順位を距離に加え、先に指定した向きの値を優先する
          const c =
            toCandidate(type, rule, page.pageNumber, row.slice(0, withUnit).map(whole), gap + dirIndex * 1e6) ??
            (withUnit !== k ? toCandidate(type, rule, page.pageNumber, row.slice(0, k).map(whole), gap + dirIndex * 1e6) : null);
          if (c) {
            // avoid に合う値は、ほかの候補がないときだけ使う
            if (rule.avoid?.test(normalizeText(c.raw).text)) c.distance += AVOIDED;
            if (overlay && c.segments.every((x) => x.source === "ocr")) c.distance += OCR_ON_OVERLAY;
            candidates.push(c);
            break;
          }
        }
      }
    });
  }
  return candidates;
}

/** 読む順(上から下、同じ行なら左から右)に並べる */
function readingOrder(segments: readonly TextSegment[]): TextSegment[] {
  return groupLines(segments).flatMap((line) => line.segments);
}

function patternCandidates(rule: PatternRule, type: FieldType, page: ExtractionPage): Candidate[] {
  const flags = new Set([...rule.pattern.flags, "g", "d"]);
  const pattern = new RegExp(rule.pattern.source, [...flags].join(""));
  const candidates: Candidate[] = [];

  const lines = rule.perCell
    ? readingOrder(scope(page, rule)).map((segment) => ({ segments: [segment] }))
    : groupLines(scope(page, rule));
  lines.forEach((line, lineIndex) => {
    // 行の正規化した文字列と、各文字がどのセルの何文字目から来たか(セルの境目に入れた文字は -1)
    let text = "";
    const refs: { segment: TextSegment; source: number }[] = [];
    line.segments.forEach((segment, i) => {
      if (i > 0 && rule.cellSeparator) {
        for (const _ of rule.cellSeparator) refs.push({ segment, source: -1 });
        text += rule.cellSeparator;
      }
      const n = norm(segment);
      text += n.text;
      for (const source of n.sourceIndex) refs.push({ segment, source });
    });

    for (const match of text.matchAll(pattern)) {
      const range = match.indices?.groups?.value ?? match.indices?.[1] ?? match.indices?.[0];
      if (!range) continue;
      // 正規表現の位置はコードユニット単位なので、コードポイント単位に直す
      const start = [...text.slice(0, range[0])].length;
      const end = start + [...text.slice(range[0], range[1])].length;
      const hit = refs.slice(start, end).filter((r) => r.source >= 0);
      const parts = [...new Set(hit.map((r) => r.segment))].map((segment) => {
        const sources = hit.filter((r) => r.segment === segment).map((r) => r.source);
        return { ...sliceSegment(segment, Math.min(...sources), Math.max(...sources) + 1), segment };
      });
      const c = toCandidate(type, rule, page.pageNumber, parts, lineIndex);
      if (c) candidates.push(c);
    }
  });
  if (rule.occurrence === undefined) return candidates;
  // 読む順で何番目かを選ぶ(同じ行の中では、見つかった順)
  const nth = candidates.map((c, i) => ({ c, i })).sort((p, q) => p.c.distance - q.c.distance || p.i - q.i)[rule.occurrence - 1];
  return nth ? [{ ...nth.c, distance: 0 }] : [];
}

function regionCandidates(rule: RegionRule, type: FieldType, page: ExtractionPage): Candidate[] {
  const segments = scope(page, rule).filter((s) => inRelativeRect(s, rule.rect, page.view));
  const ordered = groupLines(segments).flatMap((line) => line.segments);
  if (ordered.length === 0) return [];
  const c = toCandidate(type, rule, page.pageNumber, ordered.map(whole), 0);
  return c ? [c] : [];
}

const DEFAULT_MAX_ROWS = 10;

function tableCandidates(rule: TableRule, field: FieldDefinition, page: ExtractionPage): Candidate[] {
  const items = field.items ?? [];
  const segments = scope(page, rule);

  // 列の見出しを探す。最初に見つかった見出しと同じ行にあるものだけを使う
  const headers: { item: FieldDefinition; segment: TextSegment }[] = [];
  for (const item of items) {
    const labels = (rule.columns[item.key] ?? []).map((l) => normalizeText(l).text);
    const found = segments
      .filter((s) => labels.some((l) => norm(s).text === l))
      .filter((s) => !headers[0] || verticalOverlap(s.bbox, headers[0].segment.bbox) > height(s.bbox) / 2)
      .sort((p, q) => q.bbox.y1 - p.bbox.y1)[0];
    if (found) headers.push({ item, segment: found });
  }
  if (headers.length < 2) return [];
  headers.sort((p, q) => p.segment.bbox.x0 - q.segment.bbox.x0);
  const top = Math.min(...headers.map((h) => h.segment.bbox.y0));
  const h = Math.max(...headers.map((x) => height(x.segment.bbox)));

  // 列の範囲: 見出しの左端から、次の列の見出しの左端まで
  const columnOf = (s: TextSegment) => {
    let index = -1;
    headers.forEach((header, i) => {
      if (s.bbox.x0 >= header.segment.bbox.x0 - h / 2) index = i;
    });
    return index;
  };

  const rows: Record<string, unknown>[] = [];
  const used: TextSegment[] = [];
  const raws: string[] = [];
  const lines = groupLines(segments.filter((s) => centerY(s.bbox) < top && !headers.some((x) => x.segment === s)));
  for (const line of lines.slice(0, rule.maxRows ?? DEFAULT_MAX_ROWS)) {
    const row: Record<string, unknown> = {};
    const cells: TextSegment[] = [];
    headers.forEach((header, i) => {
      const inColumn = line.segments.filter((s) => columnOf(s) === i);
      if (inColumn.length === 0) return;
      const raw = inColumn.map((s) => s.text).join(" ");
      const converted = convertValue(header.item.type, raw);
      if (!converted) return;
      row[header.item.key] = converted.value;
      cells.push(...inColumn);
    });
    // 必須の列が空の行(何も書かれていない行・単位だけの行など)は飛ばす
    const complete = items.filter((i) => i.required).every((i) => row[i.key] !== undefined);
    if (!complete || Object.keys(row).length === 0) continue;
    rows.push(row);
    used.push(...cells);
    raws.push(cells.map((s) => s.text).join(" "));
  }
  if (rows.length === 0) return [];
  return [
    {
      page: page.pageNumber,
      raw: raws.join(" / "),
      value: rows,
      warnings: [],
      boxes: used.map((s) => s.bbox),
      segments: used,
      distance: 0,
      size: h,
    },
  ];
}

/** 欄の名前と同じとみなせるか(OCR の文字は、読み違いを少し許す) */
function matchesLabel(segment: TextSegment, labels: readonly string[]): boolean {
  const text = norm(segment).text;
  return labels.some((l) => text === l || (segment.source === "ocr" && nearlySame(text, l)));
}

function columnCandidates(rule: ColumnRule, type: FieldType, page: ExtractionPage): Candidate[] {
  const segments = scope(page, rule);
  const headers = rule.headers.map((labels) => labels.map((l) => normalizeText(l).text));
  // 目印にする見出し: 読めた見出しのうち、ページの上にあるもの
  const anchors = segments
    .map((s) => ({ s, column: headers.findIndex((labels) => matchesLabel(s, labels)) }))
    .filter((a) => a.column >= 0)
    .sort((p, q) => q.s.bbox.y1 - p.s.bbox.y1);
  const anchor = anchors[0];
  if (!anchor) return [];
  const h = height(anchor.s.bbox);
  const maxDistance = (rule.maxDistance ?? 5) * h;

  // 見出しの下の行のうち、型に合う値が2つ以上ある最初の行を、値の行とする
  // (見出しと値の間に「内」「千」「円」などの小さな文字の行があることがあるため)
  const below = segments.filter((s) => centerY(s.bbox) < anchor.s.bbox.y0 && anchor.s.bbox.y0 - s.bbox.y1 <= maxDistance);
  for (const line of groupLines(below)) {
    const values = line.segments
      .map((s) => ({ s, converted: convertValue(type, s.text) }))
      .filter((v): v is { s: TextSegment; converted: NonNullable<ReturnType<typeof convertValue>> } => v.converted !== null)
      .sort((p, q) => p.s.bbox.x0 - q.s.bbox.x0);
    if (values.length < 2) continue;
    // 値の数が欄の数と同じなら、そのまま左から割り当てる。違うときは、目印の見出しの真下の値を基準にする
    let target: (typeof values)[number] | undefined;
    if (values.length === headers.length) {
      target = values[rule.index];
    } else {
      const ax = centerX(anchor.s.bbox);
      const under = values.reduce(
        (best, v, i) => (Math.abs(centerX(v.s.bbox) - ax) < Math.abs(centerX(values[best]?.s.bbox ?? v.s.bbox) - ax) ? i : best),
        0,
      );
      target = values[under - anchor.column + rule.index];
    }
    if (!target) return [];
    return [
      {
        page: page.pageNumber,
        raw: target.s.text,
        value: target.converted.value,
        warnings: target.converted.warnings,
        boxes: [target.s.bbox],
        segments: [target.s],
        distance: anchor.s.bbox.y0 - target.s.bbox.y1,
        size: height(target.s.bbox),
      },
    ];
  }
  return [];
}

// ---- 実行 ----

function ruleId(rule: Rule, index: number): string {
  return rule.id ?? `${rule.kind}#${index + 1}`;
}

function notFound(field: FieldDefinition): FieldResult {
  return { key: field.key, label: field.label, type: field.type, required: field.required, found: false, bbox: [], warnings: [] };
}

function candidatesOf(rule: Exclude<Rule, { kind: "derive" }>, field: FieldDefinition, page: ExtractionPage): Candidate[] {
  switch (rule.kind) {
    case "label":
      return labelCandidates(rule, field.type, page);
    case "pattern":
      return patternCandidates(rule, field.type, page);
    case "region":
      return regionCandidates(rule, field.type, page);
    case "table":
      return field.type === "list" ? tableCandidates(rule, field, page) : [];
    case "column":
      return columnCandidates(rule, field.type, page);
  }
}

function firstCandidate(
  rule: Exclude<Rule, { kind: "derive" }>,
  field: FieldDefinition,
  pages: ExtractionPage[],
): Candidate | null {
  // 前のページで見つかった値を優先し、同じページの中では距離が近いものを使う
  for (const page of pages) {
    const candidates = candidatesOf(rule, field, page);
    const prefer = rule.kind === "label" ? (rule.prefer ?? "nearest") : "nearest";
    const best = candidates.sort((p, q) => {
      // 文字の大きさは、わずかな違い(0.5pt 未満)を同じとみなす
      if (prefer === "largest" && Math.abs(p.size - q.size) >= 0.5) return q.size - p.size;
      return prefer === "farthest" ? q.distance - p.distance : p.distance - q.distance;
    })[0];
    if (best) return best;
  }
  return null;
}

/**
 * 書類定義のルールを当てはめて、項目ごとの値を取り出す。
 * 抽出項目の定義(schema/extraction-fields.json)にある項目はすべて結果に含め、取れなかった項目は found: false にする
 */
export function extractDocument(rules: DocumentRules, pages: readonly ExtractionPage[]): ExtractionResult {
  const definition = findDocument(rules.id);
  if (!definition) throw new Error(`抽出項目の定義に ${rules.id} がありません`);
  const ordered = [...pages].sort((p, q) => p.pageNumber - q.pageNumber);
  const results = new Map<string, FieldResult>();

  const derived: [FieldDefinition, number, Extract<Rule, { kind: "derive" }>][] = [];
  for (const field of definition.fields) {
    const fieldRules = rules.fields[field.key] ?? [];
    let result = notFound(field);
    for (const [index, rule] of fieldRules.entries()) {
      if (rule.kind === "derive") {
        derived.push([field, index, rule]);
        break;
      }
      const c = firstCandidate(rule, field, ordered);
      if (!c) continue;
      const readConfidence = Math.min(...c.segments.map((s) => s.confidence));
      result = {
        ...result,
        found: true,
        value: c.value,
        rawText: c.raw,
        bbox: c.boxes,
        page: c.page,
        confidence: Math.max(0.5, readConfidence * (1 - RULE_PENALTY * index)),
        ruleId: ruleId(rule, index),
        source: c.segments.some((s) => s.source === "ocr") ? "ocr" : "pdf",
        warnings: c.warnings,
      };
      break;
    }
    results.set(field.key, result);
  }

  // ほかの項目から計算する項目は、もとの項目が取れた後に計算する
  for (const [field, index, rule] of derived) {
    const from = results.get(rule.from);
    if (!from?.found) continue;
    const value = rule.compute(from.value);
    if (value === undefined || value === null) continue;
    results.set(field.key, {
      ...notFound(field),
      found: true,
      value,
      rawText: from.rawText,
      bbox: from.bbox,
      page: from.page,
      confidence: from.confidence,
      ruleId: ruleId(rule, index),
      source: from.source,
      warnings: [`「${from.label}」から計算した値です`],
      derivedFrom: from.key,
    });
  }

  return { documentId: rules.id, fields: definition.fields.map((f) => results.get(f.key) ?? notFound(f)) };
}

/** 抽出結果を、正解データ(expected.json の values)と同じ形の値にする。未検出の項目は入れない */
export function toValues(result: ExtractionResult): Record<string, unknown> {
  const values: Record<string, unknown> = {};
  for (const field of result.fields) {
    if (!field.found) continue;
    const path = field.key.split(".");
    let target = values;
    for (const part of path.slice(0, -1)) {
      const next = target[part];
      if (typeof next === "object" && next !== null && !Array.isArray(next)) target = next as Record<string, unknown>;
      else {
        const created: Record<string, unknown> = {};
        target[part] = created;
        target = created;
      }
    }
    target[path.at(-1) ?? field.key] = field.value;
  }
  return values;
}
