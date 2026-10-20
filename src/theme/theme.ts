// 画面のテーマ。標準と、古書の雰囲気の「魔法の書庫」を切り替える。
// - 変えるのは見た目と、見出し・ボタンの一部の言い回しだけ。項目名・判定の種類・注意書きは変えない
// - 選んだテーマだけをブラウザ(localStorage)に覚えさせる。抽出した値は保存しない
// - 印刷は、どちらのテーマでも標準の見た目にする(styles/library-theme.css)

export type Theme = "standard" | "library";

export const THEMES: readonly { id: Theme; label: string }[] = [
  { id: "standard", label: "標準" },
  { id: "library", label: "魔法の書庫" },
];

const STORAGE_KEY = "theme";

/** 保存されていた値をテーマにする。知らない値は標準にする */
export function parseTheme(raw: string | null | undefined): Theme {
  return raw === "library" ? "library" : "standard";
}

/** 保存したテーマを読む。保存領域が使えないとき(プライベートモードなど)は標準 */
export function loadTheme(): Theme {
  try {
    return parseTheme(localStorage.getItem(STORAGE_KEY));
  } catch {
    return "standard";
  }
}

/** テーマを保存する。標準に戻したときは、保存した値を消す(保存領域に何も残さない) */
export function saveTheme(theme: Theme): void {
  try {
    if (theme === "standard") localStorage.removeItem(STORAGE_KEY);
    else localStorage.setItem(STORAGE_KEY, theme);
  } catch {
    // 保存できなくても、開いている間はそのテーマで表示する
  }
}

/** ページ全体にテーマを当てる(CSS は html の data-theme で切り替える) */
export function applyTheme(theme: Theme): void {
  if (theme === "standard") delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = theme;
}

/** テーマで変える言い回し */
export interface Wording {
  /** 読み込み前の画面の見出し */
  dropTitle: string;
  /** 値を手で直すボタン */
  edit: string;
  /** 手で直した項目の状態 */
  edited: string;
  /** OCR で読んだ値の「要確認」の前に付ける言葉 */
  ocrPrefix: string;
  /** OCR の進み具合の先頭 */
  ocrRunning: string;
}

const WORDINGS: Record<Theme, Wording> = {
  standard: {
    dropTitle: "PDFをここにドロップ",
    edit: "修正する",
    edited: "手動修正済み",
    ocrPrefix: "OCR ",
    ocrRunning: "OCRで読み取っています…",
  },
  library: {
    dropTitle: "書類をここに置いてください",
    edit: "書き直す",
    edited: "手で書き直し済み",
    ocrPrefix: "解読 ",
    ocrRunning: "解読しています…",
  },
};

export function wordingFor(theme: Theme): Wording {
  return WORDINGS[theme];
}
