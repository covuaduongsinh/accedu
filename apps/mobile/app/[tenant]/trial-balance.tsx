import { useTenant, useTrialBalance } from "@accedu/api/react";
import { formatAmount, todayVN } from "@accedu/core";
import { useLocalSearchParams } from "expo-router";
import { FlatList, Text, View } from "react-native";
import { colors, s } from "../../src/theme";

export default function TrialBalance() {
  const { tenant: slug } = useLocalSearchParams<{ tenant: string }>();
  const tenant = useTenant(slug);
  const today = todayVN();
  const from = `${today.slice(0, 7)}-01`;
  const tb = useTrialBalance(tenant.data?.id, from, today, 2);
  return (
    <FlatList
      style={s.screen}
      contentContainerStyle={s.content}
      data={tb.data ?? []}
      keyExtractor={(r) => r.account_code}
      ListEmptyComponent={<Text style={s.subtitle}>{tb.isLoading ? "Đang tải..." : "Chưa có phát sinh trong tháng"}</Text>}
      renderItem={({ item }) => (
        <View style={[s.card, { marginLeft: (item.level - 1) * 12 }]}>
          <Text style={{ fontWeight: item.level === 1 ? "700" : "500", color: colors.navy[700] }}>
            {item.account_code} — {item.account_name}
          </Text>
          <View style={s.row}>
            <Text style={s.subtitle}>PS Nợ {formatAmount(Number(item.debit))}</Text>
            <Text style={s.subtitle}>PS Có {formatAmount(Number(item.credit))}</Text>
          </View>
          <Text style={s.amount}>
            Dư cuối: {formatAmount(Number(item.closing_debit) - Number(item.closing_credit))}
          </Text>
        </View>
      )}
    />
  );
}
