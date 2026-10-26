import { qrMatrix } from "@accedu/core";
import { useMemo } from "react";
import { View } from "react-native";

/** Mã QR vẽ bằng View (không cần thư viện SVG) — viền trắng 4 ô */
export function QrCode({ value, size = 220 }: { value: string; size?: number }) {
  const m = useMemo(() => qrMatrix(value), [value]);
  const cell = Math.floor(size / (m.length + 8));
  return (
    <View accessibilityLabel="Mã VietQR" style={{ backgroundColor: "#fff", padding: cell * 4, alignSelf: "center" }}>
      {m.map((row, r) => (
        <View key={r} style={{ flexDirection: "row" }}>
          {row.map((dark, c) => (
            <View key={c} style={{ width: cell, height: cell, backgroundColor: dark ? "#000" : "#fff" }} />
          ))}
        </View>
      ))}
    </View>
  );
}
