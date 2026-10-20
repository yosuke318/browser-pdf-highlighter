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
  /**
   * PDF に入っている文字だけを対象にする(OCR で読んだ文字は使わない)。
   * 画像の様式に値の文字を重ねたPDFでは、値はすべて PDF の文字なので、OCR が読み違えた欄の名前が
   * 値の前後にくっつくのを避けられる
   */
  pdfTextOnly?: boolean;
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
  /**
   * ラベルの左にある縦書きの見出し(区分)で、ラベルを絞る。
   * 確定申告書の「事業 営業等」のように、同じラベルが「収入金額等」と「所得金額等」の両方の区分にある様式のため。
   * 縦書きの見出しは区分の縦の真ん中に書かれることが多く、section(見出しの下の範囲)では区切れない。
   * ラベルの左にある縦書きの見出しのうち、最も近い列の、縦の位置が最も近いものを、そのラベルの区分とみなす
   */
  sideHeading?: readonly string[];
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
  /**
   * 値の候補がこの正規表現に合うときは、ほかに候補がないときだけ使う。
   * 源泉徴収票の「氏名」は縦書きの欄の名前が、フリガナの行と氏名の行の両方にまたがっていることがあり、
   * 右にあるフリガナ(カタカナだけの文字列)より、漢字の氏名を選ぶために使う
   */
  avoid?: RegExp;
}

/** 正規表現で値を取る。1行(同じ高さのセルをつなげた、正規化した文字列)ごとに探す */
export interface PatternRule extends RuleBase {
  kind: "pattern";
  /** 値の部分を1番目のグループ、または value という名前のグループにする */
  pattern: RegExp;
  /**
   * 行ではなく、セルごとに探す。同じ行の別のセルの文字が値の続きにくっつかないようにする
   * (正規化した行の文字列は空白を除いてつなげるので、セルの境目が分からなくなるため)
   */
  perCell?: boolean;
  /**
   * 行の文字列で、セルとセルの境目にこの文字を入れる(正規表現でセルの境目を表せるようにする)。
   * 「昭和」「63」「4」「15」のように、別々のセルに分かれた数字を区別するために使う
   */
  cellSeparator?: string;
  /**
   * 読む順(上から下、同じ行なら左から右)で何番目に見つかった値を使うか(1 始まり)。既定は 1。
   * 源泉徴収票の住所のように、同じ形の値が決まった順に並ぶ様式で、欄の名前が読めないときに使う
   */
  occurrence?: number;
}

/** ページ上の範囲にある文字を、値として取る */
export interface RegionRule extends RuleBase {
  kind: "region";
  rect: RelativeRect;
}

/**
 * 表から、一覧(list 型)の項目を取る(住宅ローン申込書の既存借入など)。
 * 列の見出しを探して列の位置を決め、見出しの下の行を1行ずつ読む。
 * 抽出項目の定義で必須の列が空の行(何も書かれていない行など)は飛ばす
 */
export interface TableRule extends RuleBase {
  kind: "table";
  /** 一覧の1行分の項目のキーごとの、列の見出し(表記ゆれ) */
  columns: Record<string, readonly string[]>;
  /** 読む行の最大の数。既定は 10 */
  maxRows?: number;
}

/**
 * 見出しの行に欄の名前が左から決まった順に並び、そのすぐ下の行に値が並ぶ表から、並び順で値を取る。
 * 源泉徴収票の金額の行(支払金額・給与所得控除後の金額・所得控除の額の合計額・源泉徴収税額)のように
 * 欄の並びが様式で決まっている表で、欄の名前の一部しか読めない(OCR で読めない小さな欄の名前がある)ときに使う。
 * 見出しのうちどれか1つが読めれば、それを目印にして、下の行の値を左から順に欄に割り当てる
 */
export interface ColumnRule extends RuleBase {
  kind: "column";
  /** 見出しの行の欄の名前(表記ゆれ)を、左から順に並べたもの */
  headers: readonly (readonly string[])[];
  /** この項目の値がある欄の位置(headers の何番目か。0 始まり) */
  index: number;
  /** 見出しから値の行までの最大の距離(見出しの文字の高さの何倍か)。既定は 5 */
  maxDistance?: number;
}

/** ほかの項目の値から計算する(住民税決定通知書の対象年 = 年度 - 1 など) */
export interface DeriveRule {
  kind: "derive";
  id?: string;
  /** もとにする項目のキー */
  from: string;
  compute: (value: unknown) => unknown;
}

export type Rule = LabelRule | PatternRule | RegionRule | TableRule | ColumnRule | DeriveRule;

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
