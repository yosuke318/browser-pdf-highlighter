// 書類定義(抽出ルール)の形。書類ごとの定義は src/extract/definitions/<書類ID>.ts に書く。
// 項目の型(日付・金額など)は schema/extraction-fields.json の定義から決まるので、ここには書かない。

/**
 * ページ上の範囲を、ページの幅・高さに対する割合(0〜1)で表す。
 * 原点はページの左上(人が見たときの向き)で、y は下向き。PDFの座標系(左下が原点)とは違うので注意
 */
export interface RelativeRect {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/**
 * 見出しで区切った範囲(「申込者」欄、「連帯保証人」欄など)。
 * start の見出しの上端から、end の見出しの上端まで(end がなければページの下端まで)を対象にする。
 * 見出しは、正規化した文字列にその文字列を含むセルを探す
 */
export interface Section {
  start: readonly string[];
  end?: readonly string[];
}

interface RuleBase {
  /** ルールの名前。抽出結果に残し、どのルールで取れたかを後から確かめられるようにする */
  id?: string;
  /** 探す範囲を、見出しで区切った範囲に限る */
  section?: Section;
  /** 探す範囲を、ページ上の範囲に限る */
  region?: RelativeRect;
  /** 値の候補(正規化した文字列)がこの正規表現に合うときだけ採用する */
  accept?: RegExp;
  /** 値の候補(正規化した文字列)がこの正規表現に合うときは採用しない */
  reject?: RegExp;
  /** 値から取り除く部分(「山田太郎様」の「様」など)。取り出したままの文字列(rawText)には残す */
  remove?: RegExp;
}

export type Direction = "right" | "below";

/** ラベル(欄の名前)を探し、その右または下にある値を取る */
export interface LabelRule extends RuleBase {
  kind: "label";
  /**
   * 欄の名前の候補(表記ゆれ)。正規化して比べる。
   * セルの文字列がラベルと同じなら隣のセルから、ラベルで始まるならその続きから値を取る
   */
  labels: readonly string[];
  /** 値を探す向き。複数指定すると、その順に探す */
  direction: Direction | Direction[];
  /** ラベルから値までの最大の距離(ラベルの文字の高さの何倍か)。既定は右 25、下 5 */
  maxDistance?: number;
  /** 値が何個のセルに分かれていてもよいか(「昭和」「63年」「4月」「15日」なら 4)。既定は 6 */
  maxCells?: number;
  /**
   * セルがラベルで始まるとき、その続きを値として取るか(「(受給者番号)00123」など)。
   * 既定は、文字列の項目では取らない(「氏名」と「氏名又は名称」のように、ラベルが別の欄の名前の先頭と
   * 一致することがあるため)、それ以外の型(金額・日付など)では取る(続きが型に合うかで判断できるため)
   */
  inline?: boolean;
  /**
   * 候補が複数あるときの選び方。既定("nearest")はラベルに近いものを選ぶ。
   * "largest" は文字が大きいものを選ぶ(源泉徴収票の支払金額の欄には、左上に小さな文字で未払いの金額が
   * 書かれていることがあり、近さだけでは本来の金額と区別できないため)。
   * "farthest" はラベルから最も遠いものを選ぶ(住民税決定通知書の「特別徴収税額(年税額)」の行のように、
   * 市民税・県民税・森林環境税・合計と並び、合計が行の右端にある表のため)
   */
  prefer?: "nearest" | "largest" | "farthest";
}

/** 正規表現で値を取る。1行(同じ高さのセルをつなげた、正規化した文字列)ごとに探す */
export interface PatternRule extends RuleBase {
  kind: "pattern";
  /** 値の部分を1番目のグループ、または value という名前のグループにする */
  pattern: RegExp;
}

/** ページ上の範囲にある文字を、値として取る */
export interface RegionRule extends RuleBase {
  kind: "region";
  rect: RelativeRect;
}

/** ほかの項目の値から計算する(住民税決定通知書の対象年 = 年度 - 1 など) */
export interface DeriveRule {
  kind: "derive";
  id?: string;
  /** もとにする項目のキー */
  from: string;
  compute: (value: unknown) => unknown;
}

export type Rule = LabelRule | PatternRule | RegionRule | DeriveRule;

/** 1つの書類タイプの定義 */
export interface DocumentRules {
  /** 書類ID。schema/extraction-fields.json の documents[].id と同じにする */
  id: string;
  /**
   * 項目のキーごとのルール。上から順に試し、最初に値が取れたルールを使う。
   * 定義にない項目は抽出しない(抽出結果では「未検出」になる)
   */
  fields: Record<string, readonly Rule[]>;
}

/** 書類定義を書くための関数(型の補完を効かせるため) */
export function defineDocument(rules: DocumentRules): DocumentRules {
  return rules;
}
