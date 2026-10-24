import { describe, expect, it } from "vitest";
import { amountInWords, readInteger } from "../src/text/number-to-words";

describe("readInteger", () => {
  it.each([
    [0, "không"],
    [5, "năm"],
    [10, "mười"],
    [11, "mười một"],
    [14, "mười bốn"],
    [15, "mười lăm"],
    [21, "hai mươi mốt"],
    [25, "hai mươi lăm"],
    [55, "năm mươi lăm"],
    [100, "một trăm"],
    [105, "một trăm lẻ năm"],
    [110, "một trăm mười"],
    [1_005, "một nghìn không trăm lẻ năm"],
    [1_010, "một nghìn không trăm mười"],
    [1_000_001, "một triệu không trăm lẻ một"],
    [2_500_000, "hai triệu năm trăm nghìn"],
    [1_000_000_000, "một tỷ"],
    [1_000_000_005, "một tỷ không trăm lẻ năm"],
    [1_234_567_890, "một tỷ hai trăm ba mươi bốn triệu năm trăm sáu mươi bảy nghìn tám trăm chín mươi"],
    [1_000_000_000_000, "một nghìn tỷ"],
  ])("%d → %s", (n, words) => {
    expect(readInteger(n)).toBe(words);
  });

  it("hỗ trợ bigint và 'linh'", () => {
    expect(readInteger(10n ** 18n)).toBe("một tỷ tỷ");
    expect(readInteger(105, { odd: "linh" })).toBe("một trăm linh năm");
  });
});

describe("amountInWords", () => {
  it("VND có 'chẵn'", () => {
    expect(amountInWords(120_000)).toBe("Một trăm hai mươi nghìn đồng chẵn");
  });
  it("ngoại tệ có phần lẻ", () => {
    expect(amountInWords(100.5, { unit: "đô la Mỹ", subunit: "xu", decimals: 2 })).toBe(
      "Một trăm đô la Mỹ năm mươi xu",
    );
  });
  it("số âm", () => {
    expect(amountInWords(-5)).toBe("Âm năm đồng chẵn");
  });
});
