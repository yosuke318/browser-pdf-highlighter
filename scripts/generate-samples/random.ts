// 再生成しても同じ結果になるよう、シード付きの疑似乱数を使う(mulberry32)。

export type Random = () => number;

export function createRandom(seed: number): Random {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** min 以上 max 未満の一様乱数 */
export function between(random: Random, min: number, max: number): number {
  return min + (max - min) * random();
}
