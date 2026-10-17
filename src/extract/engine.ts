import { type FieldDefinition, type FieldType, findDocument } from "../schema/fields.ts";
import { groupLines } from "../text/lines.ts";
import { type NormalizedText, normalizeText } from "../text/normalize.ts";
import type { Rect, TextSegment } from "../text/types.ts";
import { convertValue } from "./convert.ts";
import type { DocumentRules, LabelRule, PatternRule, RegionRule, RelativeRect, Rule, Section, TableRule } from "./rules.ts";

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

function findHeading(segments: TextSegment[], headings: readonly string[]): TextSegment | undefined {
  const targets = headings.map((h) => normalizeText(h).text);
  return segments.filter((s) => targets.some((t) => norm(s).text.includes(t))).sort((p, q) => q.bbox.y1 - p.bbox.y1)[0];
}

function inSection(segments: TextSegment[], section: Section): TextSegment[] {
  const start = findHeading(segments, section.start);
  if (!start) return [];
  const below = segments.filter((s) => centerY(s.bbox) <= start.bbox.y1);
  const end = section.end
    ? findHeading(
        below.filter((s) => s !== start && s.bbox.y1 < start.bbox.y0),
        section.end,
      )
    : undefined;
  return below.filter((s) => !end || centerY(s.bbox) > end.bbox.y1);
}

function scope(page: ExtractionPage, rule: { section?: Section; region?: RelativeRect }): TextSegment[] {
  let segments = page.segments;
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

function labelCandidates(rule: LabelRule, type: FieldType, page: ExtractionPage): Candidate[] {
  const segments = scope(page, rule);
  const labels = rule.labels.map((l) => normalizeText(l).text);
  const directions = Array.isArray(rule.direction) ? rule.direction : [rule.direction];
  const maxCells = rule.maxCells ?? DEFAULT_MAX_CELLS;
  const candidates: Candidate[] = [];

  const inline = rule.inline ?? type !== "text";

  const sideHeadings = rule.sideHeading?.map((h) => normalizeText(h).text);

  for (const anchor of segments) {
    const n = norm(anchor);
    const label = labels.find((l) => n.text === l || (inline && n.text.startsWith(l)));
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

    const h = height(anchor.bbox);
    directions.forEach((direction, dirIndex) => {
      const maxDistance = (rule.maxDistance ?? DEFAULT_MAX_DISTANCE[direction]) * h;
      const others = segments.filter((s) => s !== anchor);
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
              .map((s) => ({ s, gap: anchor.bbox.y0 - s.bbox.y1 }))
              .filter(({ gap }) => gap >= -h / 3 && gap <= maxDistance)
              .sort(
                (p, q) =>
                  p.gap - q.gap ||
                  Math.abs(centerX(p.s.bbox) - centerX(anchor.bbox)) - Math.abs(centerX(q.s.bbox) - centerX(anchor.bbox)),
              );

      for (const { s, gap } of starts) {
        const row = rowFrom(s, others, maxCells);
        for (let k = 1; k <= row.length; k++) {
          // 金額の直後に単位だけのセル(「420」「万円」)があれば、単位も含めて変換する
          const next = row[k];
          const withUnit = type === "money" && next && UNIT_ONLY.test(norm(next).text) ? k + 1 : k;
          // 向きの優先順位を距離に加え、先に指定した向きの値を優先する
          const c =
            toCandidate(type, rule, page.pageNumber, row.slice(0, withUnit).map(whole), gap + dirIndex * 1e6) ??
            (withUnit !== k ? toCandidate(type, rule, page.pageNumber, row.slice(0, k).map(whole), gap + dirIndex * 1e6) : null);
          if (c) {
            candidates.push(c);
            break;
          }
        }
      }
    });
  }
  return candidates;
}

function patternCandidates(rule: PatternRule, type: FieldType, page: ExtractionPage): Candidate[] {
  const flags = new Set([...rule.pattern.flags, "g", "d"]);
  const pattern = new RegExp(rule.pattern.source, [...flags].join(""));
  const candidates: Candidate[] = [];

  groupLines(scope(page, rule)).forEach((line, lineIndex) => {
    // 行の正規化した文字列と、各文字がどのセルの何文字目から来たか
    let text = "";
    const refs: { segment: TextSegment; source: number }[] = [];
    for (const segment of line.segments) {
      const n = norm(segment);
      text += n.text;
      for (const source of n.sourceIndex) refs.push({ segment, source });
    }

    for (const match of text.matchAll(pattern)) {
      const range = match.indices?.groups?.value ?? match.indices?.[1] ?? match.indices?.[0];
      if (!range) continue;
      // 正規表現の位置はコードユニット単位なので、コードポイント単位に直す
      const start = [...text.slice(0, range[0])].length;
      const end = start + [...text.slice(range[0], range[1])].length;
      const hit = refs.slice(start, end);
      const parts = [...new Set(hit.map((r) => r.segment))].map((segment) => {
        const sources = hit.filter((r) => r.segment === segment).map((r) => r.source);
        return { ...sliceSegment(segment, Math.min(...sources), Math.max(...sources) + 1), segment };
      });
      const c = toCandidate(type, rule, page.pageNumber, parts, lineIndex);
      if (c) candidates.push(c);
    }
  });
  return candidates;
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
