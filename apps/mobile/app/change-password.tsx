import { api, friendlyError } from "@accedu/api";
import { useDb } from "@accedu/api/react";
import { passwordProblem } from "@accedu/core";
import { router } from "expo-router";
import { useState } from "react";
import { KeyboardAvoidingView, Platform, Pressable, Text, View } from "react-native";
import { Button, Card, Field } from "../src/ui";
import { colors, s } from "../src/theme";

/** Đổi mật khẩu tạm ở lần đăng nhập đầu (tài khoản do quản trị cấp) */
export default function ChangePassword() {
  const db = useDb();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function save() {
    const problem = passwordProblem(password) ?? (password !== confirm ? "Mật khẩu nhập lại không khớp" : null);
    if (problem) return setError(problem);
    setBusy(true);
    setError(null);
    try {
      await api.changePassword(db, password);
      router.replace("/");
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={[s.screen, { backgroundColor: colors.navy[500] }]}>
      <View style={[s.content, { flex: 1, justifyContent: "center" }]}>
        <Text style={{ color: "#fff", fontSize: 24, fontWeight: "800", textAlign: "center" }}>Đổi mật khẩu</Text>
        <Text style={{ color: colors.gold[300], textAlign: "center", marginBottom: 16 }}>Lần đầu đăng nhập — vui lòng đặt mật khẩu riêng</Text>
        <Card>
          <Field label="Mật khẩu mới (≥ 8 ký tự, có chữ và số)" value={password} onChangeText={setPassword} secureTextEntry autoComplete="new-password" />
          <Field label="Nhập lại mật khẩu mới" value={confirm} onChangeText={setConfirm} secureTextEntry autoComplete="new-password" />
          {error ? <Text style={s.error}>{error}</Text> : null}
          <Button title="Lưu mật khẩu mới" onPress={() => void save()} disabled={busy} />
        </Card>
        <Pressable onPress={() => void db.auth.signOut().then(() => router.replace("/login"))}>
          <Text style={{ color: colors.navy[100], textAlign: "center" }}>Đăng xuất</Text>
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}
