import { useItems, useStockBalances, useTenant, useWarehouses } from "@accedu/api/react";
import { formatAmount, formatDateVN, todayVN } from "@accedu/core";
import { useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { FlatList, Pressable, RefreshControl, Text, TextInput, View } from "react-native";
import { colors, s } from "../../src/theme";

const qty = (n: number) => formatAmount(n, { decimals: Number.isInteger(n) ? 0 : 2 });

/** Tồn kho hiện tại theo mặt hàng (chỉ xem): số lượng, giá trị, giá bình quân; lọc theo kho, tìm theo mã/tên */
export default function Stock() {
  const { tenant: slug } = useLocalSearchParams<{ tenant: string }>();
  const tenant = useTenant(slug);
  const today = todayVN();
  const balances = useStockBalances(tenant.data?.id, today);
  const items = useItems(tenant.data?.id);
  const warehouses = useWarehouses(tenant.data?.id);
  const [warehouse, setWarehouse] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  const itemById = new Map((items.data ?? []).map((i) => [i.id, i]));
  const byItem = new Map<string, { quantity: number; amount: number }>();
  for (const b of balances.data ?? []) {
    if (warehouse && b.warehouse_id !== warehouse) continue;
    const cur = byItem.get(b.item_id) ?? { quantity: 0, amount: 0 };
    byItem.set(b.item_id, { quantity: cur.quantity + Number(b.quantity), amount: cur.amount + Number(b.amount) });
  }
  const q = search.trim().toLowerCase();
  const rows = [...byItem.entries()]
    .map(([id, v]) => ({ id, item: itemById.get(id), ...v }))
    .filter((r) => !q || r.item?.code.toLowerCase().includes(q) || r.item?.name.toLowerCase().includes(q))
    .toSorted((a, b) => (a.item?.code ?? "").localeCompare(b.item?.code ?? ""));
  const total = rows.reduce((sum, r) => sum + r.amount, 0);
  const active = (warehouses.data ?? []).filter((w) => w.is_active);

  return (
    <FlatList
      style={s.screen}
      contentContainerStyle={s.content}
      data={rows}
      keyExtractor={(r) => r.id}
      refreshControl={<RefreshControl refreshing={balances.isFetching} onRefresh={() => void balances.refetch()} />}
      ListHeaderComponent={
        <View style={{ gap: 8 }}>
          <View style={s.card}>
            <Text style={s.label}>Giá trị tồn kho đến {formatDateVN(today)}</Text>
            <Text style={[s.amount, { fontSize: 20 }]}>{formatAmount(total)}</Text>
            <Text style={s.subtitle}>{rows.length} mặt hàng còn tồn</Text>
          </View>
          {active.length > 1 ? (
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
              {[{ id: null as string | null, code: "Tất cả kho" }, ...active].map((w) => {
                const on = warehouse === w.id;
                return (
                  <Pressable
                    key={w.id ?? "all"}
                    accessibilityRole="button"
                    onPress={() => setWarehouse(w.id)}
                    style={{ paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999, borderWidth: 1, borderColor: colors.navy[300], backgroundColor: on ? colors.navy[500] : colors.surface }}
                  >
                    <Text style={{ color: on ? "#fff" : colors.navy[700], fontSize: 13 }}>{w.code}</Text>
                  </Pressable>
                );
              })}
            </View>
          ) : null}
          <TextInput style={s.input} placeholder="Tìm mã hoặc tên hàng" placeholderTextColor={colors.muted} value={search} onChangeText={setSearch} />
        </View>
      }
      ListEmptyComponent={<Text style={s.subtitle}>{balances.isLoading ? "Đang tải..." : "Chưa có hàng tồn kho"}</Text>}
      renderItem={({ item: r }) => (
        <View style={[s.card, s.row]}>
          <View style={{ flex: 1 }}>
            <Text style={{ fontWeight: "600", color: colors.navy[700] }} numberOfLines={1}>
              {r.item?.name ?? "—"}
            </Text>
            <Text style={s.subtitle}>
              {r.item?.code}
              {r.quantity > 0 ? ` · bình quân ${formatAmount(Math.round(r.amount / r.quantity))}` : ""}
            </Text>
          </View>
          <View style={{ alignItems: "flex-end" }}>
            <Text style={[s.amount, r.quantity <= 0 ? { color: colors.danger } : null]}>
              {qty(r.quantity)} {r.item?.uom ?? ""}
            </Text>
            <Text style={s.subtitle}>{formatAmount(r.amount)}</Text>
          </View>
        </View>
      )}
    />
  );
}
