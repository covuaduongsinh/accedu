import { qrMatrix } from "@accedu/core";
import { useMemo } from "react";

/** Mã QR vẽ bằng SVG (sắc nét khi in), viền trắng 4 ô theo chuẩn */
export function QrCode({ value, size = 200, label }: { value: string; size?: number; label: string }) {
  const { n, d } = useMemo(() => {
    const m = qrMatrix(value);
    const parts: string[] = [];
    m.forEach((row, r) =>
      row.forEach((dark, c) => {
        if (dark) parts.push(`M${c + 4} ${r + 4}h1v1h-1z`);
      }),
    );
    return { n: m.length + 8, d: parts.join("") };
  }, [value]);
  return (
    <svg viewBox={`0 0 ${n} ${n}`} width={size} height={size} role="img" aria-label={label} shapeRendering="crispEdges">
      <rect width={n} height={n} fill="#fff" />
      <path d={d} fill="#000" />
    </svg>
  );
}
