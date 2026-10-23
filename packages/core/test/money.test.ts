import { fc, test } from "@fast-check/vitest";
import { describe, expect, it } from "vitest";
import { convertToBase, formatAmount, parseAmount, roundAmount, sumAmounts } from "../src";

describe("roundAmount", () => {
  it.each([
    [1.005, 2, 1.01],
    [2.5, 0, 3],
    [-2.5, 0, -3],
    [1234.4999, 0, 1234],
    [0.1 + 0.2, 2, 0.3],
    [-0.0001, 2, 0],
  ])("roundAmount(%d, %d) = %d", (v, d, r) => {
    expect(roundAmount(v, d)).toBe(r);
  });

  test.prop([fc.integer({ min: -1e12, max: 1e12 })])("số nguyên giữ nguyên", (n) => {
    expect(roundAmount(n)).toBe(n);
  });

  test.prop([fc.double({ min: -1e9, max: 1e9, noNaN: true })])("đối xứng qua 0", (v) => {
    expect(roundAmount(-v, 2)).toBe(-roundAmount(v, 2) || 0);
  });
});

describe("format/parse", () => {
  it("định dạng kiểu Việt Nam", () => {
    expect(formatAmount(1234567)).toBe("1.234.567");
    expect(formatAmount(-1234.5, { decimals: 2, parentheses: true })).toBe("(1.234,50)");
    expect(formatAmount(0, { blankZero: true })).toBe("");
  });

  test.prop([fc.integer({ min: -1e12, max: 1e12 })])("parse(format(n)) = n", (n) => {
    expect(parseAmount(formatAmount(n))).toBe(n);
  });

  it("quy đổi tỷ giá", () => {
    expect(convertToBase(100.25, 25_450)).toBe(2_551_363);
    expect(sumAmounts([0.1, 0.2, 0.3], 2)).toBe(0.6);
  });
});
