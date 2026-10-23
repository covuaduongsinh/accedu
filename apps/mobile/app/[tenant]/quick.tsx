import { friendlyError } from "@accedu/api";
import { useAccounts, usePartners, useSaveVoucher, useTenant } from "@accedu/api/react";
import { amountInWords, parseAmount, todayVN } from "@accedu/core";
import { router, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { Alert, ScrollView, Text } from "react-native";
import { Button, Card, Field } from "../../src/ui";
import { s } from "../../src/theme";

/** Lập nhanh phiếu thu / phiếu chi tiền mặt trên điện thoại — ghi sổ ngay, đồng bộ tức thì lên web & desktop. */
export default function Quick() {
  const { tenant: slug, type = "PT" } = useLocalSearchParams<{ tenant: string; type?: "PT" | "PC" }>();
  const tenant = useTenant(slug);
  const accounts = useAccounts(tenant.data?.id);
  const partners = usePartners(tenant.data?.id);
  const save = useSaveVoucher(tenant.data?.id ?? "", "mobile");
  const isReceipt = type === "PT";
  const [partnerCode, setPartnerCode] = useState("");
  const [account, setAccount] = useState(isReceipt ? "131" : "6422");
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState(isReceipt ? "Thu học phí" : "");
  const n = parseAmount(amount) ?? 0;
  const accountName = accounts.data?.find((a) => a.code === account)?.name;
  const partner = partners.data?.find((p) => p.code === partnerCode.trim().toUpperCase());

  async function submit() {
    try {
      await save.mutateAsync({
        post: true,
        voucher: {
          voucherType: type,
          issueDate: todayVN(),
          postingDate: todayVN(),
          partnerId: partner?.id ?? null,
          ...(partner ? { partnerName: partner.name, contactName: partner.name } : {}),
          description,
          lines: [isReceipt ? { lineNo: 1, creditAccount: account, amount: n } : { lineNo: 1, debitAccount: account, amount: n }],
        },
      });
      Alert.alert("Đã ghi sổ", `${isReceipt ? "Phiếu thu" : "Phiếu chi"} ${n.toLocaleString("vi-VN")} đ`);
      router.back();
    } catch (e) {
      Alert.alert("Không lưu được", friendlyError(e));
    }
  }

  return (
    <ScrollView style={s.screen} contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">
      <Card>
        <Text style={s.title}>{isReceipt ? "Phiếu thu tiền mặt" : "Phiếu chi tiền mặt"}</Text>
        <Field label="Mã khách / học viên" value={partnerCode} onChangeText={setPartnerCode} autoCapitalize="characters" />
        {partner ? <Text style={s.subtitle}>{partner.name}</Text> : null}
        <Field label={isReceipt ? "Tài khoản có" : "Tài khoản nợ"} value={account} onChangeText={setAccount} keyboardType="number-pad" />
        {accountName ? <Text style={s.subtitle}>{accountName}</Text> : null}
        <Field label="Số tiền (VND)" value={amount} onChangeText={setAmount} keyboardType="number-pad" />
        {n > 0 ? <Text style={[s.subtitle, { fontStyle: "italic" }]}>{amountInWords(n)}</Text> : null}
        <Field label={isReceipt ? "Lý do nộp" : "Lý do chi"} value={description} onChangeText={setDescription} />
        <Button title="Lưu & ghi sổ" onPress={() => void submit()} disabled={save.isPending || n <= 0 || !tenant.data} />
      </Card>
    </ScrollView>
  );
}
