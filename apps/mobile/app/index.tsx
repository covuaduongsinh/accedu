import { useDb, useSession, useTenants } from "@accedu/api/react";
import { Redirect, router } from "expo-router";
import { FlatList, Pressable, Text, View } from "react-native";
import { colors, s } from "../src/theme";

const ROLE: Record<string, string> = {
  owner: "Chủ sở hữu",
  admin: "Quản trị",
  chief_accountant: "Kế toán trưởng",
  accountant: "Kế toán",
  cashier: "Thủ quỹ",
  viewer: "Chỉ xem",
};

export default function Tenants() {
  const session = useSession();
  const tenants = useTenants();
  const db = useDb();
  if (session === null) return <Redirect href="/login" />;
  if (session?.user.app_metadata?.must_change_password === true) return <Redirect href="/change-password" />;
  return (
    <View style={s.screen}>
      <FlatList
        contentContainerStyle={s.content}
        data={tenants.data ?? []}
        keyExtractor={(t) => t.id}
        ListHeaderComponent={
          <View style={{ gap: 4 }}>
            <Text style={s.title}>Chọn đơn vị làm việc</Text>
            <Text style={s.subtitle}>{session?.user.email}</Text>
          </View>
        }
        ListEmptyComponent={<Text style={s.subtitle}>{tenants.isLoading ? "Đang tải..." : "Chưa được gán vào đơn vị nào."}</Text>}
        renderItem={({ item }) => (
          <Pressable style={s.card} onPress={() => router.push({ pathname: "/[tenant]", params: { tenant: item.slug } })}>
            <Text style={{ fontSize: 16, fontWeight: "600", color: colors.ink }}>{item.name}</Text>
            <Text style={s.subtitle}>
              /{item.slug.toUpperCase()} · {item.regime} · {ROLE[item.role]}
            </Text>
          </Pressable>
        )}
        ListFooterComponent={
          <Pressable onPress={() => void db.auth.signOut()}>
            <Text style={{ color: colors.navy[500], textAlign: "center", marginTop: 16 }}>Đăng xuất</Text>
          </Pressable>
        }
      />
    </View>
  );
}
