import type { Browser, Page } from "playwright-core";
import type { ScanProfile } from "./document.ts";

// HTMLをブラウザ(Chrome)で描画し、テキストPDFとスキャン風の画像を作る。

const A4_MM = { width: 210, height: 297 };
const CSS_PX_PER_MM = 96 / 25.4;
export const A4_CSS_PX = {
  width: A4_MM.width * CSS_PX_PER_MM,
  height: A4_MM.height * CSS_PX_PER_MM,
};

/** 描画された文字列と、その位置(CSSピクセル、ページ左上が原点) */
export interface TextBox {
  text: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ScannedPage {
  jpeg: Uint8Array;
  /** 傾き補正前の文字の位置。透明テキスト付きPDFを作るときに使う */
  textBoxes: TextBox[];
}

/**
 * フォントの読み込みが終わるまで待つ。待たないと、読み込み前の代わりのフォントで
 * 描画されることがあり、生成するたびに画像が変わってしまう。
 */
async function waitForFonts(page: Page): Promise<void> {
  await page.evaluate(async () => {
    await document.fonts.ready;
  });
}

/**
 * 2回続けて同じ画像になるまで撮り直す。OSが文字の足りないフォントを遅れて読み込むと、
 * document.fonts.ready の後でも描画が変わることがあるため。
 */
async function stableScreenshot(page: Page): Promise<Buffer> {
  let previous = await page.screenshot({ type: "png" });
  for (let i = 0; i < 10; i++) {
    await page.waitForTimeout(300);
    const current = await page.screenshot({ type: "png" });
    if (current.equals(previous)) return current;
    previous = current;
  }
  throw new Error("描画が安定しません(フォントの読み込みが終わらない可能性があります)");
}

export async function renderTextPdf(browser: Browser, html: string): Promise<Uint8Array> {
  const page = await browser.newPage();
  try {
    await page.setContent(html, { waitUntil: "load" });
    await waitForFonts(page);
    return await page.pdf({ preferCSSPageSize: true, printBackground: true });
  } finally {
    await page.close();
  }
}

export async function renderScan(
  browser: Browser,
  html: string,
  profile: ScanProfile,
  seed: number,
): Promise<ScannedPage> {
  const context = await browser.newContext({
    viewport: { width: Math.round(A4_CSS_PX.width), height: Math.round(A4_CSS_PX.height) },
    deviceScaleFactor: profile.dpi / 96,
  });
  try {
    // tsx(esbuild)は関数に名前を残すため __name という補助関数の呼び出しを埋め込む。
    // page.evaluate に渡した関数はブラウザ側で実行されるので、そこにも定義しておく。
    await context.addInitScript({ content: "globalThis.__name = (fn) => fn;" });
    const page = await context.newPage();
    await page.setContent(html, { waitUntil: "load" });
    await waitForFonts(page);
    const png = await stableScreenshot(page);
    const textBoxes = await page.evaluate(collectTextBoxes);

    const output = {
      width: Math.round((A4_MM.width / 25.4) * profile.dpi),
      height: Math.round((A4_MM.height / 25.4) * (profile.verticalDpi ?? profile.dpi)),
    };
    const dataUrl = await page.evaluate(degradeImage, {
      pngBase64: png.toString("base64"),
      output,
      profile,
      seed,
    });
    const jpeg = Buffer.from(dataUrl.slice(dataUrl.indexOf(",") + 1), "base64");
    return { jpeg: new Uint8Array(jpeg), textBoxes };
  } finally {
    await context.close();
  }
}

// 以下の2つの関数はブラウザ内で実行される(外側の変数は参照できない)。

function collectTextBoxes(): TextBox[] {
  const boxes: TextBox[] = [];
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const text = (node.textContent ?? "").trim();
    if (!text) continue;
    const range = document.createRange();
    range.selectNodeContents(node);
    const rect = range.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) continue;
    boxes.push({ text, x: rect.left, y: rect.top, width: rect.width, height: rect.height });
  }
  return boxes;
}

async function degradeImage(args: {
  pngBase64: string;
  output: { width: number; height: number };
  profile: ScanProfile;
  seed: number;
}): Promise<string> {
  const { pngBase64, output, profile, seed } = args;

  // mulberry32(random.ts と同じもの)
  let state = seed >>> 0;
  const random = (): number => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  // ボックス=ミュラー法で正規分布の乱数を作る
  const gaussian = (): number =>
    Math.sqrt(-2 * Math.log(random() || 1e-9)) * Math.cos(2 * Math.PI * random());

  const image = new Image();
  image.src = `data:image/png;base64,${pngBase64}`;
  await image.decode();

  const canvas = document.createElement("canvas");
  canvas.width = output.width;
  canvas.height = output.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas 2d context を取得できません");

  // 用紙の傾きと、光学系による軽いぼけ
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, output.width, output.height);
  ctx.translate(output.width / 2, output.height / 2);
  ctx.rotate((profile.skewDegrees * Math.PI) / 180);
  ctx.filter = "blur(0.5px)";
  ctx.drawImage(image, -output.width / 2, -output.height / 2, output.width, output.height);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.filter = "none";

  // グレースケール化、紙の地色、ノイズ、2値化
  const data = ctx.getImageData(0, 0, output.width, output.height);
  const px = data.data;
  for (let i = 0; i < px.length; i += 4) {
    const r = px[i] ?? 255;
    const g = px[i + 1] ?? 255;
    const b = px[i + 2] ?? 255;
    let v = 0.299 * r + 0.587 * g + 0.114 * b;
    v = 12 + v * 0.93 + gaussian() * profile.noise;
    if (profile.threshold !== undefined) {
      v = v < profile.threshold ? 0 : 255;
      // FAX特有の点状のノイズ
      if (random() < 0.0015) v = 255 - v;
    }
    v = Math.max(0, Math.min(255, v));
    px[i] = v;
    px[i + 1] = v;
    px[i + 2] = v;
  }
  ctx.putImageData(data, 0, 0);
  return canvas.toDataURL("image/jpeg", profile.jpegQuality);
}
