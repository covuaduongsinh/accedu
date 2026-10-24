import { colors, radii, spacing } from "@accedu/ui-tokens";
import { StyleSheet } from "react-native";

export { colors, radii, spacing };

export const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.canvas },
  content: { padding: spacing.lg, gap: spacing.md },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.line,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  title: { fontSize: 20, fontWeight: "700", color: colors.navy[700] },
  subtitle: { fontSize: 13, color: colors.muted },
  label: { fontSize: 12, color: colors.muted, fontWeight: "500" },
  input: {
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radii.md,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
    backgroundColor: colors.surface,
    color: colors.ink,
  },
  button: { backgroundColor: colors.navy[500], borderRadius: radii.md, paddingVertical: 12, alignItems: "center" },
  buttonGold: { backgroundColor: colors.gold[500] },
  buttonText: { color: "#fff", fontWeight: "600", fontSize: 15 },
  row: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  amount: { fontVariant: ["tabular-nums"], fontWeight: "600", color: colors.navy[700] },
  error: { color: colors.danger, fontSize: 13 },
});
