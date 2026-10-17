import { describe, expect, it } from "vitest";
import { findDocument } from "../schema/fields.ts";
import type { TextSegment } from "../text/types.ts";
import { type ExtractionPage, extractDocument, toValues } from "./engine.ts";
import { type DocumentRules, defineDocument } from "./rules.ts";

// エンジンの動きを、架空のセル配置で確かめる。
// 項目の型は schema/extraction-fields.json の定義から決まるので、実在する書類ID・キーを使う。

/** 1文字の幅 10、高さ 10 のセル。(x, y) は左下 */
function cell(text: string, x: number, y: number, confidence = 1): TextSegment {
  const chars = [...text];
  return {
    text,
    bbox: { x0: x, y0: y, x1: x + chars.length * 10, y1: y + 10 },
    charBoxes: chars.map((_, i) => ({ x0: x + i * 10, y0: y, x1: x + (i + 1) * 10, y1: y + 10 })),
    confidence,
    source: confidence < 1 ? "ocr" : "pdf",
  };
}

function page(segments: TextSegment[], pageNumber = 1): ExtractionPage {
  return { pageNumber, view: [0, 0, 600, 800], segments };
}

function run(fields: DocumentRules["fields"], pages: ExtractionPage[], id = "withholding-slip") {
  const result = extractDocument(defineDocument({ id, fields }), pages);
  return { result, field: (key: string) => result.fields.find((f) => f.key === key) };
}

describe("ラベルの近くから値を取る", () => {
  it("右にある値を取る", () => {
    const { field } = run({ name: [{ kind: "label", labels: ["氏名"], direction: "right" }] }, [
      page([cell("氏名", 50, 700), cell("山田 太郎", 120, 700)]),
    ]);
    expect(field("name")).toMatchObject({ found: true, value: "山田 太郎", rawText: "山田 太郎", page: 1, ruleId: "label#1" });
    expect(field("name")?.bbox).toEqual([{ x0: 120, y0: 700, x1: 170, y1: 710 }]);
  });

  it("文字列の値は、康熙部首・全角英数字を通常の文字にし、元の文字列は rawText に残す", () => {
    const { field } = run({ address: [{ kind: "label", labels: ["住所"], direction: "right" }] }, [
      page([cell("住所", 50, 700), cell("⾒本県　１丁⽬", 120, 700)]),
    ]);
    expect(field("address")).toMatchObject({ value: "見本県 1丁目", rawText: "⾒本県　１丁⽬" });
  });

  it("下にある値を取る。型に合わない候補(「内」)は飛ばす", () => {
    const { field } = run({ paymentAmount: [{ kind: "label", labels: ["支払金額"], direction: "below" }] }, [
      page([cell("支払金額", 150, 700), cell("内", 140, 680), cell("5,800,000", 180, 680)]),
    ]);
    expect(field("paymentAmount")).toMatchObject({ found: true, value: 5_800_000, rawText: "5,800,000" });
  });

  it("セルに分かれた値をつなげて取る", () => {
    const { field } = run({ birthDate: [{ kind: "label", labels: ["受給者生年月日"], direction: "below" }] }, [
      page([
        cell("受給者生年月日", 480, 700),
        cell("昭和", 460, 685),
        cell("63年", 485, 685),
        cell("4月", 520, 685),
        cell("15日", 545, 685),
      ]),
    ]);
    expect(field("birthDate")).toMatchObject({ found: true, value: "1988-04-15", rawText: "昭和 63年 4月 15日" });
    expect(field("birthDate")?.bbox).toHaveLength(4);
  });

  it("金額の直後に単位だけのセルがあれば、単位も含めて換算する", () => {
    const { field } = run({ paymentAmount: [{ kind: "label", labels: ["支払金額"], direction: "right" }] }, [
      page([cell("支払金額", 50, 700), cell("420", 150, 700), cell("万円", 185, 700)]),
    ]);
    expect(field("paymentAmount")).toMatchObject({ value: 4_200_000, rawText: "420 万円" });
  });

  it("日付の後ろに年齢などが続いていても、日付の部分を取る", () => {
    const { field } = run({ birthDate: [{ kind: "label", labels: ["生年月日"], direction: "right" }] }, [
      page([
        cell("生年月日", 50, 700),
        cell("昭和40年", 150, 700),
        cell("1", 210, 700),
        cell("月", 222, 700),
        cell("20日(61歳)", 235, 700),
      ]),
    ]);
    expect(field("birthDate")?.value).toBe("1965-01-20");
  });

  it("ラベルと値が1つのセルになっていれば、ラベルの続きを取る", () => {
    const { field } = run({ withholdingTax: [{ kind: "label", labels: ["源泉徴収税額"], direction: "right" }] }, [
      page([cell("源泉徴収税額166,900円", 50, 700)]),
    ]);
    expect(field("withholdingTax")).toMatchObject({ found: true, value: 166_900, rawText: "166,900円" });
    // 長方形は値の部分(ラベル6文字の後ろの8文字)だけ
    expect(field("withholdingTax")?.bbox).toEqual([{ x0: 110, y0: 700, x1: 190, y1: 710 }]);
  });

  it("文字列の項目では、既定ではラベルの続きを値にしない(「氏名」と「氏名又は名称」)", () => {
    const segments = [
      cell("氏名又は名称", 50, 700),
      cell("株式会社サンプル", 150, 700),
      cell("氏名", 50, 650),
      cell("山田太郎", 120, 650),
    ];
    expect(run({ name: [{ kind: "label", labels: ["氏名"], direction: "right" }] }, [page(segments)]).field("name")?.value).toBe(
      "山田太郎",
    );
    // inline: true を指定すれば、文字列の項目でもラベルの続きを値にする
    const inline = run({ name: [{ kind: "label", labels: ["氏名:"], direction: "right", inline: true }] }, [
      page([cell("氏名:山田太郎", 50, 700)]),
    ]);
    expect(inline.field("name")?.value).toBe("山田太郎");
  });

  it("表記ゆれの違うラベルや、全角・康熙部首の違いがあっても見つける", () => {
    const { field } = run(
      { salaryIncomeAfterDeduction: [{ kind: "label", labels: ["給与所得控除後の金額"], direction: "right" }] },
      [page([cell("給与所得控除後の⾦額", 50, 700), cell("４，２００，０００", 200, 700)])],
    );
    expect(field("salaryIncomeAfterDeduction")?.value).toBe(4_200_000);
  });

  it("prefer: largest なら、近さより文字の大きさで選ぶ", () => {
    const small = { ...cell("1,200,000", 140, 690), bbox: { x0: 140, y0: 690, x1: 194, y1: 696 } };
    const segments = [cell("支払金額", 150, 700), small, cell("5,800,000", 180, 675)];
    const nearest = run({ paymentAmount: [{ kind: "label", labels: ["支払金額"], direction: "below" }] }, [page(segments)]);
    expect(nearest.field("paymentAmount")?.value).toBe(1_200_000);
    const largest = run({ paymentAmount: [{ kind: "label", labels: ["支払金額"], direction: "below", prefer: "largest" }] }, [
      page(segments),
    ]);
    expect(largest.field("paymentAmount")?.value).toBe(5_800_000);
  });

  it("最大の距離より遠い値は取らない", () => {
    const { field } = run({ name: [{ kind: "label", labels: ["氏名"], direction: "right", maxDistance: 2 }] }, [
      page([cell("氏名", 50, 700), cell("山田太郎", 300, 700)]),
    ]);
    expect(field("name")?.found).toBe(false);
  });

  it("accept・reject で候補を絞る", () => {
    const segments = [cell("氏名", 50, 700), cell("(フリガナ)ヤマダ", 80, 700), cell("山田太郎", 80, 685)];
    const { field } = run({ name: [{ kind: "label", labels: ["氏名"], direction: ["right", "below"], reject: /フリガナ/ }] }, [
      page(segments),
    ]);
    expect(field("name")?.value).toBe("山田太郎");
  });
});

describe("正規表現で値を取る", () => {
  it("1行のセルをつなげた文字列から、グループの部分を取る", () => {
    const { field } = run({ incomeYear: [{ kind: "pattern", pattern: /(令和\d+年)分/ }] }, [
      page([cell("令和", 160, 780), cell("7", 190, 780), cell("年分", 205, 780), cell("給与所得の源泉徴収票", 260, 780)]),
    ]);
    expect(field("incomeYear")).toMatchObject({ found: true, value: 2025, rawText: "令和 7 年" });
    // 「令和」「7」「年分」の「年」までの3つのセル
    expect(field("incomeYear")?.bbox).toEqual([
      { x0: 160, y0: 780, x1: 180, y1: 790 },
      { x0: 190, y0: 780, x1: 200, y1: 790 },
      { x0: 205, y0: 780, x1: 215, y1: 790 },
    ]);
  });

  it("value という名前のグループも使える", () => {
    const { field } = run({ incomeYear: [{ kind: "pattern", pattern: /(?<value>令和\d+年)分/ }] }, [
      page([cell("令和7年分", 50, 700)]),
    ]);
    expect(field("incomeYear")?.value).toBe(2025);
  });
});

describe("ページ上の範囲から値を取る", () => {
  it("範囲の中のセルを読む順につなげる", () => {
    // ページは高さ 800。上から 10〜15% は y = 680〜720
    const { field } = run({ employerName: [{ kind: "region", rect: { x0: 0, y0: 0.1, x1: 0.5, y1: 0.15 } }] }, [
      page([cell("株式会社", 50, 700), cell("サンプル商事", 100, 700), cell("範囲外", 400, 700)]),
    ]);
    expect(field("employerName")?.value).toBe("株式会社 サンプル商事");
  });
});

describe("見出しで区切った範囲", () => {
  it("同じラベルが複数あっても、見出しの下の範囲にあるものを使う", () => {
    const segments = [
      cell("申込者", 30, 700),
      cell("氏名", 50, 680),
      cell("田中美咲", 120, 680),
      cell("連帯保証人", 30, 600),
      cell("氏名", 50, 580),
      cell("田中健二", 120, 580),
    ];
    const label = { kind: "label", labels: ["氏名"], direction: "right" } as const;
    const { result } = run(
      {
        "applicant.name": [{ ...label, section: { start: ["申込者"], end: ["連帯保証人"] } }],
        "guarantor.name": [{ ...label, section: { start: ["連帯保証人"] } }],
      },
      [page(segments)],
      "rental-application",
    );
    expect(toValues(result)).toEqual({ applicant: { name: "田中美咲" }, guarantor: { name: "田中健二" } });
  });

  it("見出しが見つからなければ、その範囲には値がない", () => {
    const { field } = run(
      { "guarantor.name": [{ kind: "label", labels: ["氏名"], direction: "right", section: { start: ["連帯保証人"] } }] },
      [page([cell("氏名", 50, 680), cell("田中美咲", 120, 680)])],
      "rental-application",
    );
    expect(field("guarantor.name")?.found).toBe(false);
  });
});

describe("複数のルールと確からしさ", () => {
  it("上のルールから順に試し、取れたルールを記録する。下のルールほど確からしさを下げる", () => {
    const { field } = run(
      {
        name: [
          { id: "label-name", kind: "label", labels: ["氏名"], direction: "right" },
          { id: "label-recipient", kind: "label", labels: ["受給者氏名"], direction: "right" },
        ],
      },
      [page([cell("受給者氏名", 50, 700), cell("山田太郎", 120, 700)])],
    );
    expect(field("name")).toMatchObject({ value: "山田太郎", ruleId: "label-recipient", confidence: 0.9 });
  });

  it("OCR で読んだ文字の確からしさを引き継ぐ", () => {
    const { field } = run({ name: [{ kind: "label", labels: ["氏名"], direction: "right" }] }, [
      page([cell("氏名", 50, 700), cell("山田太郎", 120, 700, 0.8)]),
    ]);
    expect(field("name")).toMatchObject({ confidence: 0.8, source: "ocr" });
  });

  it("前のページで見つかった値を優先する", () => {
    const { field } = run({ name: [{ kind: "label", labels: ["氏名"], direction: "right" }] }, [
      page([cell("氏名", 50, 700), cell("佐藤花子", 120, 700)], 2),
      page([cell("氏名", 50, 700), cell("山田太郎", 120, 700)], 1),
    ]);
    expect(field("name")).toMatchObject({ value: "山田太郎", page: 1 });
  });
});

describe("ほかの項目から計算する", () => {
  it("もとの項目の位置を引き継ぎ、計算した値であることを注意として残す", () => {
    const { field } = run(
      {
        fiscalYear: [{ kind: "pattern", pattern: /(令和\d+年)度/ }],
        incomeYear: [{ kind: "derive", from: "fiscalYear", compute: (v) => (typeof v === "number" ? v - 1 : null) }],
      },
      [page([cell("令和8年度", 50, 700)])],
      "resident-tax-notice",
    );
    expect(field("incomeYear")).toMatchObject({ found: true, value: 2025, page: 1, ruleId: "derive#1" });
    expect(field("incomeYear")?.bbox).toEqual(field("fiscalYear")?.bbox);
    expect(field("incomeYear")?.warnings).toHaveLength(1);
  });

  it("もとの項目が取れなければ、計算しない", () => {
    const { field } = run(
      { incomeYear: [{ kind: "derive", from: "fiscalYear", compute: () => 2025 }] },
      [page([])],
      "resident-tax-notice",
    );
    expect(field("incomeYear")?.found).toBe(false);
  });
});

describe("抽出結果の形", () => {
  it("定義にある項目はすべて結果に含め、取れなかった項目は未検出にする", () => {
    const { result } = run({}, [page([])]);
    const definition = findDocument("withholding-slip");
    expect(result.fields.map((f) => f.key)).toEqual(definition?.fields.map((f) => f.key));
    expect(result.fields.every((f) => !f.found && f.bbox.length === 0)).toBe(true);
    expect(toValues(result)).toEqual({});
  });

  it("和暦の日付が元号の期間外なら、注意を付ける", () => {
    const { field } = run({ birthDate: [{ kind: "label", labels: ["生年月日"], direction: "right" }] }, [
      page([cell("生年月日", 50, 700), cell("令和元年4月1日", 150, 700)]),
    ]);
    expect(field("birthDate")?.value).toBe("2019-04-01");
    expect(field("birthDate")?.warnings).toHaveLength(1);
  });

  it("抽出項目の定義にない書類IDはエラーにする", () => {
    expect(() => extractDocument(defineDocument({ id: "unknown", fields: {} }), [])).toThrow();
  });
});
