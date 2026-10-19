// OCR の前に画像を整える処理。ブラウザにもNode.jsにも依存しない(画素の配列だけを扱う)。
// 1. グレースケール化
// 2. 傾きの推定と補正(スキャンしたときの紙の傾き)
// 3. 白黒の2値化(しきい値は大津の方法で決める。課税証明書の薄い地紋もここで消える)
// 4. 表の罫線の除去(罫線が文字の並びの検出を邪魔するため)

/** グレースケール画像。data は 0(黒)〜255(白)、左上から行ごとに並ぶ */
export interface GrayImage {
  width: number;
  height: number;
  data: Uint8Array;
}

export const PREPROCESS_SETTINGS = {
  /** 推定する傾きの範囲(度)。これより大きく傾いたスキャンは補正しない */
  maxSkewDegrees: 3,
  /** 傾きの推定で試す角度の刻み(度)。粗く探してから、最も良い角度の近くを細かく探す */
  coarseSkewStep: 0.25,
  fineSkewStep: 0.02,
  /** これより小さい傾きは補正しない(補正による画質の劣化のほうが大きいため) */
  minSkewToCorrect: 0.05,
  /** 罫線とみなす線の長さ(インチ)。横線は長い表の線、縦線は確定申告書のマス目の高さ(約5mm)を拾う長さにする */
  minHorizontalLineInches: 0.4,
  minVerticalLineInches: 0.17,
  /**
   * 消した縦線のうち、表のセルの区切りとして使う線の長さ(インチ)。
   * 確定申告書のマス目の枠(約5mm = 0.2インチ)は区切りにしない(1桁ずつ別のセルになってしまうため)
   */
  minSeparatorInches: 0.25,
  /** 罫線のまわりの、にじんだ画素も消す幅(画素) */
  lineMargin: 1,
} as const;

/** RGBA の画素(canvas の getImageData の data)をグレースケールにする */
export function toGray(rgba: ArrayLike<number>, width: number, height: number): GrayImage {
  const data = new Uint8Array(width * height);
  for (let i = 0; i < data.length; i++) {
    const r = rgba[i * 4] ?? 255;
    const g = rgba[i * 4 + 1] ?? 255;
    const b = rgba[i * 4 + 2] ?? 255;
    const a = (rgba[i * 4 + 3] ?? 255) / 255;
    // 透明な部分は白い紙とみなす
    data[i] = Math.round((0.299 * r + 0.587 * g + 0.114 * b) * a + 255 * (1 - a));
  }
  return { width, height, data };
}

/** 大津の方法で2値化のしきい値を求める。これより暗い画素を文字(インク)とみなす */
export function otsuThreshold(image: GrayImage): number {
  const histogram = new Array<number>(256).fill(0);
  for (const v of image.data) histogram[v] = (histogram[v] ?? 0) + 1;
  const total = image.data.length;
  let sum = 0;
  for (let t = 0; t < 256; t++) sum += t * (histogram[t] ?? 0);
  let sumBackground = 0;
  let weightBackground = 0;
  let best = 0;
  let threshold = 128;
  for (let t = 0; t < 256; t++) {
    weightBackground += histogram[t] ?? 0;
    if (weightBackground === 0) continue;
    const weightForeground = total - weightBackground;
    if (weightForeground === 0) break;
    sumBackground += t * (histogram[t] ?? 0);
    const meanBackground = sumBackground / weightBackground;
    const meanForeground = (sum - sumBackground) / weightForeground;
    const between = weightBackground * weightForeground * (meanBackground - meanForeground) ** 2;
    if (between > best) {
      best = between;
      // t 以下を暗い側として分けたので、t+1 未満をインクとする
      threshold = t + 1;
    }
  }
  return threshold;
}

/** インク(しきい値より暗い画素)の座標を、間引いて集める */
function inkPoints(image: GrayImage, threshold: number, stride: number): { xs: Float64Array; ys: Float64Array } {
  const xs: number[] = [];
  const ys: number[] = [];
  for (let y = 0; y < image.height; y += stride) {
    for (let x = 0; x < image.width; x += stride) {
      if ((image.data[y * image.width + x] ?? 255) < threshold) {
        xs.push(x);
        ys.push(y);
      }
    }
  }
  return { xs: Float64Array.from(xs), ys: Float64Array.from(ys) };
}

/**
 * 角度 a(度)だけ戻したときの、行ごとのインクの量のばらつき。
 * 文字の行や罫線が水平にそろうほど、インクのある行とない行の差がはっきりして大きくなる
 */
function alignmentScore(
  xs: Float64Array,
  ys: Float64Array,
  cx: number,
  cy: number,
  degrees: number,
  height: number,
  binSize: number,
): number {
  const rad = (degrees * Math.PI) / 180;
  const sin = Math.sin(rad);
  const cos = Math.cos(rad);
  // 間引いた間隔と同じ幅で数える(幅が狭いと、間引いた行だけに点が入り、角度 0 の点数が不当に高くなる)
  const rows = Math.ceil(height / binSize);
  const margin = Math.ceil(rows * 0.1);
  const bins = new Float64Array(rows + 2 * margin);
  for (let i = 0; i < xs.length; i++) {
    const dx = (xs[i] ?? 0) - cx;
    const dy = (ys[i] ?? 0) - cy;
    // 角度 -a の回転をかけたあとの y
    const y = Math.round((cy - dx * sin + dy * cos) / binSize) + margin;
    if (y >= 0 && y < bins.length) bins[y] = (bins[y] ?? 0) + 1;
  }
  let score = 0;
  for (let i = 1; i < bins.length; i++) score += ((bins[i] ?? 0) - (bins[i - 1] ?? 0)) ** 2;
  return score;
}

/**
 * スキャン画像の傾き(度)を推定する。
 * 戻り値は、画像の中身が時計回りに傾いている角度(y 軸が下向きの座標で正)。
 * rotate(image, -傾き) で水平に戻せる。
 */
export function estimateSkew(image: GrayImage, threshold: number, settings = PREPROCESS_SETTINGS): number {
  // 長辺 1000 画素程度になるように間引く(角度の推定にはそれで十分)
  const stride = Math.max(1, Math.floor(Math.max(image.width, image.height) / 1000));
  const { xs, ys } = inkPoints(image, threshold, stride);
  if (xs.length < 50) return 0;
  const cx = image.width / 2;
  const cy = image.height / 2;
  const search = (from: number, to: number, step: number): number => {
    let bestAngle = 0;
    let bestScore = -1;
    for (let a = from; a <= to + 1e-9; a += step) {
      const score = alignmentScore(xs, ys, cx, cy, a, image.height, stride);
      // 同じ点数なら、0 度に近いほうを選ぶ(水平な画像を、わずかに傾いていると判定しないため)
      if (score > bestScore || (score === bestScore && Math.abs(a) < Math.abs(bestAngle))) {
        bestScore = score;
        bestAngle = a;
      }
    }
    return bestAngle;
  };
  const max = settings.maxSkewDegrees;
  const coarse = search(-max, max, settings.coarseSkewStep);
  const fine = search(coarse - settings.coarseSkewStep, coarse + settings.coarseSkewStep, settings.fineSkewStep);
  return Math.round(fine * 100) / 100;
}

/**
 * 画像の中心を軸に、時計回りに degrees 度回転する(y 軸が下向きの座標)。
 * 画像の大きさは変えず、はみ出した部分は捨て、空いた部分は白にする
 */
export function rotate(image: GrayImage, degrees: number): GrayImage {
  const { width, height } = image;
  const rad = (degrees * Math.PI) / 180;
  const sin = Math.sin(rad);
  const cos = Math.cos(rad);
  const cx = width / 2;
  const cy = height / 2;
  const data = new Uint8Array(width * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      // 出力の画素に対応する元の位置(逆向きの回転)
      const dx = x - cx;
      const dy = y - cy;
      const sx = cx + dx * cos + dy * sin;
      const sy = cy - dx * sin + dy * cos;
      const x0 = Math.floor(sx);
      const y0 = Math.floor(sy);
      const fx = sx - x0;
      const fy = sy - y0;
      const at = (px: number, py: number) =>
        px >= 0 && py >= 0 && px < width && py < height ? (image.data[py * width + px] ?? 255) : 255;
      const top = at(x0, y0) * (1 - fx) + at(x0 + 1, y0) * fx;
      const bottom = at(x0, y0 + 1) * (1 - fx) + at(x0 + 1, y0 + 1) * fx;
      data[y * width + x] = Math.round(top * (1 - fy) + bottom * fy);
    }
  }
  return { width, height, data };
}

/** 回転 rotate(image, degrees) の後の画素の位置を、回転する前の画像の位置に戻す */
export function unrotatePoint(x: number, y: number, degrees: number, width: number, height: number): [number, number] {
  const rad = (degrees * Math.PI) / 180;
  const sin = Math.sin(rad);
  const cos = Math.cos(rad);
  const dx = x - width / 2;
  const dy = y - height / 2;
  return [width / 2 + dx * cos + dy * sin, height / 2 - dx * sin + dy * cos];
}

/** 画像の画素の長方形。原点は左上で y は下向き */
export interface PixelRect {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export interface LineRemoval {
  /** 0(文字)と 255(背景)だけの画像 */
  image: GrayImage;
  /** 消した縦の罫線。表のセルの区切りとして使う */
  verticalLines: PixelRect[];
}

/** 縦の線の一部(1列分)を、隣の列の線とまとめて長方形にする */
function mergeVerticalRuns(runs: PixelRect[]): PixelRect[] {
  const merged: PixelRect[] = [];
  for (const run of [...runs].sort((p, q) => p.x0 - q.x0 || p.y0 - q.y0)) {
    const target = merged.find((m) => run.x0 <= m.x1 + 1 && run.y0 < m.y1 && run.y1 > m.y0);
    if (target) {
      target.x1 = Math.max(target.x1, run.x1);
      target.y0 = Math.min(target.y0, run.y0);
      target.y1 = Math.max(target.y1, run.y1);
    } else {
      merged.push({ ...run });
    }
  }
  return merged;
}

/** 2値化して、長い横線・縦線(表の罫線)を消す */
export function binarizeWithoutLines(
  image: GrayImage,
  threshold: number,
  minHorizontal: number,
  minVertical: number,
  margin: number,
): LineRemoval {
  const { width, height } = image;
  const ink = new Uint8Array(width * height);
  for (let i = 0; i < ink.length; i++) ink[i] = (image.data[i] ?? 255) < threshold ? 1 : 0;

  const line = new Uint8Array(width * height);
  const markRun = (indexOf: (k: number) => number, from: number, to: number) => {
    for (let k = from; k < to; k++) line[indexOf(k)] = 1;
  };
  for (let y = 0; y < height; y++) {
    let start = -1;
    for (let x = 0; x <= width; x++) {
      const on = x < width && ink[y * width + x] === 1;
      if (on && start < 0) start = x;
      if (!on && start >= 0) {
        if (x - start >= minHorizontal) markRun((k) => y * width + k, start, x);
        start = -1;
      }
    }
  }
  const verticalRuns: PixelRect[] = [];
  for (let x = 0; x < width; x++) {
    let start = -1;
    for (let y = 0; y <= height; y++) {
      const on = y < height && ink[y * width + x] === 1;
      if (on && start < 0) start = y;
      if (!on && start >= 0) {
        if (y - start >= minVertical) {
          markRun((k) => k * width + x, start, y);
          verticalRuns.push({ x0: x, y0: start, x1: x + 1, y1: y });
        }
        start = -1;
      }
    }
  }

  // 罫線のすぐ隣にある、にじんだインクも罫線の一部とみなす
  const removed = new Uint8Array(line);
  if (margin > 0) {
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        if (line[y * width + x] !== 1) continue;
        for (let dy = -margin; dy <= margin; dy++) {
          for (let dx = -margin; dx <= margin; dx++) {
            const px = x + dx;
            const py = y + dy;
            if (px >= 0 && py >= 0 && px < width && py < height && ink[py * width + px] === 1) removed[py * width + px] = 1;
          }
        }
      }
    }
  }

  const data = new Uint8Array(width * height);
  for (let i = 0; i < data.length; i++) data[i] = ink[i] === 1 && removed[i] !== 1 ? 0 : 255;
  return { image: { width, height, data }, verticalLines: mergeVerticalRuns(verticalRuns) };
}

export interface PreprocessResult {
  image: GrayImage;
  /** 消した縦の罫線のうち、表のセルの区切りとして使うもの(補正後の画像の位置) */
  verticalLines: PixelRect[];
  /** 補正した傾き(度)。rotate(元の画像, -skewDegrees) で補正している。補正しなかったときは 0 */
  skewDegrees: number;
  threshold: number;
}

/** OCR の前処理をまとめて行う。dpi は画像の解像度(罫線の長さの判定に使う) */
export function preprocess(gray: GrayImage, dpi: number, settings = PREPROCESS_SETTINGS): PreprocessResult {
  const threshold = otsuThreshold(gray);
  const skew = estimateSkew(gray, threshold, settings);
  const corrected = Math.abs(skew) >= settings.minSkewToCorrect ? skew : 0;
  const straight = corrected === 0 ? gray : rotate(gray, -corrected);
  const { image, verticalLines } = binarizeWithoutLines(
    straight,
    threshold,
    Math.round(settings.minHorizontalLineInches * dpi),
    Math.round(settings.minVerticalLineInches * dpi),
    settings.lineMargin,
  );
  const minSeparator = settings.minSeparatorInches * dpi;
  return {
    image,
    verticalLines: verticalLines.filter((l) => l.y1 - l.y0 >= minSeparator),
    skewDegrees: corrected,
    threshold,
  };
}
