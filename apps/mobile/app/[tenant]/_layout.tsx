import { useRealtimeSync, useTenant } from "@accedu/api/react";
import { Stack, useLocalSearchParams } from "expo-router";
import { Text } from "react-native";
import { colors } from "../../src/theme";

export default function TenantLayout() {
  const { tenant } = useLocalSearchParams<{ tenant: string }>();
  const t = useTenant(tenant);
  const sync = useRealtimeSync(t.data?.id);
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: colors.navy[500] },
        headerTintColor: "#fff",
        headerRight: () => <Text style={{ color: sync === "live" ? colors.gold[300] : colors.navy[200], fontSize: 12 }}>{sync === "live" ? "● Đồng bộ" : "○ Ngoại tuyến"}</Text>,
      }}
    >
      <Stack.Screen name="index" options={{ title: t.data?.name ?? "Tổng quan" }} />
      <Stack.Screen name="quick" options={{ title: "Thu / chi nhanh" }} />
      <Stack.Screen name="trial-balance" options={{ title: "Cân đối phát sinh" }} />
      <Stack.Screen name="receivables" options={{ title: "Công nợ phải thu" }} />
      <Stack.Screen name="stock" options={{ title: "Tồn kho" }} />
    </Stack>
  );
}
