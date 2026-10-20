import { afterEach, describe, expect, it, vi } from "vitest";
import { loadTheme, parseTheme, saveTheme, wordingFor } from "./theme.ts";

/** localStorage の代わり(テストでは Node の保存領域を使わない) */
function memoryStorage() {
  const items = new Map<string, string>();
  return {
    items,
    getItem: (key: string) => items.get(key) ?? null,
    setItem: (key: string, value: string) => void items.set(key, value),
    removeItem: (key: string) => void items.delete(key),
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("parseTheme", () => {
  it("知らない値や、保存されていないときは標準", () => {
    expect(parseTheme("library")).toBe("library");
    expect(parseTheme("dark")).toBe("standard");
    expect(parseTheme(null)).toBe("standard");
  });
});

describe("loadTheme / saveTheme", () => {
  it("選んだテーマを覚え、標準に戻したら保存した値を消す", () => {
    const storage = memoryStorage();
    vi.stubGlobal("localStorage", storage);
    saveTheme("library");
    expect(loadTheme()).toBe("library");
    saveTheme("standard");
    expect(loadTheme()).toBe("standard");
    expect(storage.items.size).toBe(0);
  });

  it("保存領域が使えないときは標準で、保存の失敗で止まらない", () => {
    vi.stubGlobal("localStorage", {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("blocked");
      },
      removeItem: () => {
        throw new Error("blocked");
      },
    });
    expect(loadTheme()).toBe("standard");
    expect(() => saveTheme("library")).not.toThrow();
  });
});

describe("wordingFor", () => {
  it("項目名や判定ではなく、見出しとボタンの一部の言い回しだけを変える", () => {
    expect(wordingFor("standard").edit).toBe("修正する");
    expect(wordingFor("library").edit).toBe("書き直す");
    expect(wordingFor("library").dropTitle).not.toBe(wordingFor("standard").dropTitle);
  });
});
