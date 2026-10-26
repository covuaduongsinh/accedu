import { useTenant, useTrialBalance, useVouchers } from "@accedu/api/react";
import { formatAmount, formatDateVN, todayVN, voucherType } from "@accedu/core";
import { router, useLocalSearchParams } from "expo-router";
import { Pressable, RefreshControl, ScrollView, Text, View } from "react-native";
import { Button } from "../../src/ui";
import { colors, s } from "../../src/theme";

export default function Dashboard() {
  const { tenant: slug } = useLocalSearchParams<{ tenant: string }>();
  const tenant = useTenant(slug);
  const today = todayVN();
  const tb = useTrialBalance(tenant.data?.id, `${today.slice(0, 4)}-01-01`, today, 1);
  const vouchers = useVouchers(tenant.data?.id, ["PT", "PC", "BC", "BN", "PK"]);
  const row = (c: string) => tb.data?.find((r) => r.account_code === c);
  const bal = (c: string) => Number(row(c)?.closing_debit ?? 0) - Number(row(c)?.closing_credit ?? 0);

  const kpis: Array<[string, number]> = [
    ["Tiền mặt", bal("111")],
    ["Tiền gửi", bal("112")],
    ["Phải thu", bal("131")],
    ["Doanh thu", Number(row("511")?.credit ?? 0)],
  ];

  return (
    <ScrollView
      style={s.screen}
      contentContainerStyle={s.content}
      refreshControl={<RefreshControl refreshing={tb.isFetching} onRefresh={() => { void tb.refetch(); void vouchers.refetch(); }} />}
    >
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
        {kpis.map(([label, value]) => (
          <View key={label} style={[s.card, { width: "48%" }]}>
            <Text style={s.label}>{label}</Text>
            <Text style={[s.amount, { fontSize: 18 }]}>{formatAmount(value)}</Text>
          </View>
        ))}
      </View>
      <View style={{ flexDirection: "row", gap: 8 }}>
        <View style={{ flex: 1 }}>
          <Button title="+ Phiếu thu" onPress={() => router.push({ pathname: "/[tenant]/quick", params: { tenant: slug, type: "PT" } })} />
        </View>
        <View style={{ flex: 1 }}>
          <Button gold title="− Phiếu chi" onPress={() => router.push({ pathname: "/[tenant]/quick", params: { tenant: slug, type: "PC" } })} />
        </View>
      </View>
      <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
        <Pressable onPress={() => router.push({ pathname: "/[tenant]/trial-balance", params: { tenant: slug } })}>
          <Text style={{ color: colors.navy[500], fontWeight: "600" }}>Bảng cân đối phát sinh ›</Text>
        </Pressable>
        <Pressable onPress={() => router.push({ pathname: "/[tenant]/receivables", params: { tenant: slug } })}>
          <Text style={{ color: colors.navy[500], fontWeight: "600" }}>Công nợ phải thu ›</Text>
        </Pressable>
      </View>
      <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
        <Pressable onPress={() => router.push({ pathname: "/[tenant]/tuition", params: { tenant: slug } })}>
          <Text style={{ color: colors.navy[500], fontWeight: "600" }}>Học phí ›</Text>
        </Pressable>
        <Pressable onPress={() => router.push({ pathname: "/[tenant]/stock", params: { tenant: slug } })}>
          <Text style={{ color: colors.navy[500], fontWeight: "600" }}>Tồn kho ›</Text>
        </Pressable>
      </View>
      <Text style={[s.title, { fontSize: 16 }]}>Chứng từ gần đây</Text>
      {(vouchers.data ?? []).slice(0, 15).map((v) => (
        <View key={v.id} style={[s.card, s.row]}>
          <View style={{ flex: 1 }}>
            <Text style={{ fontWeight: "600", color: colors.navy[600] }}>
              {v.number} · {voucherType(v.voucher_type)?.name}
            </Text>
            <Text style={s.subtitle} numberOfLines={1}>
              {formatDateVN(v.posting_date)} · {v.description}
            </Text>
          </View>
          <Text style={s.amount}>{formatAmount(Number(v.total_amount))}</Text>
        </View>
      ))}
    </ScrollView>
  );
}
