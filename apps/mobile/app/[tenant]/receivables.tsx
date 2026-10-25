import { useAging, useTenant } from "@accedu/api/react";
import { formatAmount, formatDateVN, todayVN } from "@accedu/core";
import { useLocalSearchParams } from "expo-router";
import { FlatList, RefreshControl, Text, View } from "react-native";
import { colors, s } from "../../src/theme";

/** Công nợ phải thu theo khách hàng / học viên (chỉ xem): tổng còn nợ, phần quá hạn tô đỏ */
export default function Receivables() {
  const { tenant: slug } = useLocalSearchParams<{ tenant: string }>();
  const tenant = useTenant(slug);
  const today = todayVN();
  const aging = useAging(tenant.data?.id, "receivable", today);
  const rows = (aging.data ?? []).filter((r) => Number(r.total) !== 0).toSorted((a, b) => Number(b.total) - Number(a.total));
  const overdueOf = (r: (typeof rows)[number]) => Number(r.d1_30) + Number(r.d31_60) + Number(r.d61_90) + Number(r.over_90);
  const total = rows.reduce((sum, r) => sum + Number(r.total), 0);
  const overdue = rows.reduce((sum, r) => sum + overdueOf(r), 0);
  return (
    <FlatList
      style={s.screen}
      contentContainerStyle={s.content}
      data={rows}
      keyExtractor={(r) => r.partner_id}
      refreshControl={<RefreshControl refreshing={aging.isFetching} onRefresh={() => void aging.refetch()} />}
      ListHeaderComponent={
        <View style={s.card}>
          <Text style={s.label}>Tổng phải thu đến {formatDateVN(today)}</Text>
          <Text style={[s.amount, { fontSize: 20 }]}>{formatAmount(total)}</Text>
          <Text style={{ color: overdue > 0 ? colors.danger : colors.navy[400], marginTop: 4 }}>Quá hạn: {formatAmount(overdue)}</Text>
        </View>
      }
      ListEmptyComponent={<Text style={s.subtitle}>{aging.isLoading ? "Đang tải..." : "Không còn công nợ phải thu"}</Text>}
      renderItem={({ item }) => {
        const late = overdueOf(item);
        return (
          <View style={[s.card, s.row]}>
            <View style={{ flex: 1 }}>
              <Text style={{ fontWeight: "600", color: colors.navy[700] }} numberOfLines={1}>
                {item.partner_name}
              </Text>
              <Text style={s.subtitle}>
                {item.partner_code}
                {late > 0 ? "" : " · chưa đến hạn"}
              </Text>
              {late > 0 ? <Text style={{ color: colors.danger, fontSize: 12 }}>Quá hạn {formatAmount(late)}</Text> : null}
            </View>
            <Text style={s.amount}>{formatAmount(Number(item.total))}</Text>
          </View>
        );
      }}
    />
  );
}
