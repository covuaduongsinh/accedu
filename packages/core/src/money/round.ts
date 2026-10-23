/**
 * Làm tròn kiểu kế toán: nửa xa số 0 (half away from zero), tránh lỗi số thực
 * (ví dụ 1.005 → 1.01, -2.5 → -3).
 */
export function roundAmount(value: number, decimals = 0): number {
  if (!Number.isFinite(value)) throw new RangeError(`Số tiền không hợp lệ: ${value}`);
  if (!Number.isInteger(decimals) || decimals < 0 || decimals > 6) {
    throw new RangeError(`Số chữ số thập phân không hợp lệ: ${decimals}`);
  }
  const factor = 10 ** decimals;
  const scaled = Math.abs(value) * factor;
  // Bù sai số biểu diễn nhị phân trước khi làm tròn.
  const rounded = Math.round(Number((scaled + Number.EPSILON * scaled).toPrecision(15)));
  const result = (Math.sign(value) * rounded) / factor;
  return Object.is(result, -0) ? 0 : result;
}

/** Cộng dồn rồi làm tròn một lần, đúng với cách cộng tổng trên chứng từ. */
export function sumAmounts(values: readonly number[], decimals = 0): number {
  let total = 0;
  for (const v of values) total += v;
  return roundAmount(total, decimals);
}

/** Quy đổi nguyên tệ sang tiền hạch toán (VND, làm tròn đồng). */
export function convertToBase(amountFc: number, rate: number, baseDecimals = 0): number {
  if (!(rate > 0)) throw new RangeError(`Tỷ giá phải dương: ${rate}`);
  return roundAmount(amountFc * rate, baseDecimals);
}
