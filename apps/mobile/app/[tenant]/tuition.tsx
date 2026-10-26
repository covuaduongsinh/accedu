import type { TuitionStatusRow } from "@accedu/api";
import { useTenant, useTuitionStatus } from "@accedu/api/react";
import { VIETQR_BANKS, formatAmount, todayVN, tuitionTransferNote, vietQrPayload } from "@accedu/core";
import { useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { FlatList, Modal, Pressable, RefreshControl, Text, View } from "react-native";
import { QrCode } from "../../src/QrCode";
import { colors, s } from "../../src/theme";
import { Button } from "../../src/ui";

const shiftMonth = (ym: string, delta: number) => {
  const [y, m] = ym.split("-").map(Number) as [number, number];
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return d.toISOString().slice(0, 7);
};

/** Học phí theo tháng: ai chưa đóng, mở mã VietQR đúng số tiền để phụ huynh quét ngay tại lớp */
export default function Tuition() {
  const { tenant: slug } = useLocalSearchParams<{ tenant: string }>();
  const tenant = useTenant(slug);
  const [month, setMonth] = useState(todayVN().slice(0, 7));
  const status = useTuitionStatus(tenant.data?.id, { month: `${month}-01` });
  const [qr, setQr] = useState<TuitionStatusRow | null>(null);
  const rows = (status.data ?? []).toSorted((a, b) => Number(b.remaining) - Number(a.remaining) || a.class_code.localeCompare(b.class_code));
  const unpaid = rows.filter((r) => Number(r.remaining) > 0);
  const total = unpaid.reduce((sum, r) => sum + Number(r.remaining), 0);
  const t = tenant.data;
  const bank = t?.bank_bin && t.bank_account_no ? { bin: t.bank_bin, accountNo: t.bank_account_no } : null;

  return (
    <>
      <FlatList
        style={s.screen}
        contentContainerStyle={s.content}
        data={rows}
        keyExtractor={(r) => r.bill_id}
        refreshControl={<RefreshControl refreshing={status.isFetching} onRefresh={() => void status.refetch()} />}
        ListHeaderComponent={
          <View style={{ gap: 8 }}>
            <View style={[s.row, { gap: 8 }]}>
              <Pressable accessibilityRole="button" onPress={() => setMonth(shiftMonth(month, -1))}>
                <Text style={{ color: colors.navy[500], fontWeight: "600", fontSize: 18 }}>‹</Text>
              </Pressable>
              <Text style={s.title}>
                Tháng {month.slice(5)}/{month.slice(0, 4)}
              </Text>
              <Pressable accessibilityRole="button" onPress={() => setMonth(shiftMonth(month, 1))}>
                <Text style={{ color: colors.navy[500], fontWeight: "600", fontSize: 18 }}>›</Text>
              </Pressable>
            </View>
            <View style={s.card}>
              <Text style={s.label}>Còn phải thu</Text>
              <Text style={[s.amount, { fontSize: 20, color: total > 0 ? colors.danger : colors.navy[700] }]}>{formatAmount(total)}</Text>
              <Text style={s.subtitle}>
                {unpaid.length} / {rows.length} khoản chưa đóng
              </Text>
            </View>
          </View>
        }
        ListEmptyComponent={<Text style={s.subtitle}>{status.isLoading ? "Đang tải..." : "Chưa lập học phí tháng này"}</Text>}
        renderItem={({ item }) => {
          const owe = Number(item.remaining);
          return (
            <Pressable onPress={() => owe > 0 && setQr(item)} style={[s.card, s.row]}>
              <View style={{ flex: 1 }}>
                <Text style={{ fontWeight: "600", color: colors.navy[700] }} numberOfLines={1}>
                  {item.student_name}
                </Text>
                <Text style={s.subtitle}>
                  {item.class_code}
                  {item.guardian_phone ? ` · ${item.guardian_phone}` : ""}
                </Text>
              </View>
              <View style={{ alignItems: "flex-end" }}>
                <Text style={[s.amount, { color: owe > 0 ? colors.danger : colors.navy[400] }]}>{owe > 0 ? formatAmount(owe) : "Đã đóng"}</Text>
                {owe > 0 ? <Text style={{ fontSize: 12, color: colors.navy[500] }}>Mã QR ›</Text> : null}
              </View>
            </Pressable>
          );
        }}
      />
      <Modal visible={qr !== null} animationType="slide" onRequestClose={() => setQr(null)}>
        {qr ? (
          <View style={[s.screen, s.content, { justifyContent: "center" }]}>
            <Text style={[s.title, { textAlign: "center" }]}>{qr.student_name}</Text>
            <Text style={[s.subtitle, { textAlign: "center" }]}>
              {qr.class_name} · {formatAmount(Number(qr.remaining))} đ
            </Text>
            {bank ? (
              <>
                <QrCode value={vietQrPayload({ ...bank, amount: Number(qr.remaining), note: tuitionTransferNote(qr.student_code, qr.invoice_number) })} />
                <Text style={[s.subtitle, { textAlign: "center" }]}>
                  {VIETQR_BANKS.find((b) => b.bin === bank.bin)?.name ?? bank.bin} · {bank.accountNo}
                </Text>
                <Text style={[s.subtitle, { textAlign: "center" }]}>Nội dung: {tuitionTransferNote(qr.student_code, qr.invoice_number)}</Text>
              </>
            ) : (
              <Text style={s.error}>Chưa khai báo tài khoản nhận học phí (web: Hệ thống › Thông tin đơn vị).</Text>
            )}
            <Button title="Đóng" onPress={() => setQr(null)} />
          </View>
        ) : null}
      </Modal>
    </>
  );
}
