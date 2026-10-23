/**
 * Nhận diện thương hiệu Cờ vua Dương Sinh — dùng chung cho web (Tailwind), desktop (Tauri) và mobile (React Native).
 * Màu chủ đạo navy #2B3990 + gold; font Roboto; họa tiết ô cờ.
 */
export const colors = {
  navy: {
    50: "#eef0fa",
    100: "#d5daf2",
    200: "#aab4e5",
    300: "#7f8fd8",
    400: "#5466c4",
    500: "#2b3990",
    600: "#243079",
    700: "#1d2662",
    800: "#161d4b",
    900: "#0f1434",
  },
  gold: {
    50: "#fdf8e7",
    100: "#f9edc2",
    200: "#f3dc86",
    300: "#ecc94b",
    400: "#e0b42a",
    500: "#c9a227",
    600: "#a6831c",
    700: "#7f6415",
    800: "#59460f",
    900: "#332808",
  },
  ink: "#1a1d29",
  muted: "#5f6474",
  line: "#d9dce5",
  surface: "#ffffff",
  canvas: "#f5f6fa",
  success: "#1f8a4c",
  warning: "#b7791f",
  danger: "#c0392b",
  /** Màu số âm/ghi có trên báo cáo kế toán */
  credit: "#c0392b",
  /** Màu số dương/ghi nợ */
  debit: "#1d2662",
} as const;

export const fonts = {
  sans: "Roboto, 'Segoe UI', system-ui, -apple-system, sans-serif",
  mono: "'Roboto Mono', ui-monospace, SFMono-Regular, Menlo, monospace",
} as const;

export const radii = { sm: 4, md: 8, lg: 12, full: 9999 } as const;

export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 } as const;

export const brand = {
  name: "AccEdu",
  owner: "Công ty CP Cờ vua Dương Sinh",
  slogan: "Vui trí tuệ",
  primary: colors.navy[500],
  accent: colors.gold[500],
} as const;

export type BrandColors = typeof colors;
