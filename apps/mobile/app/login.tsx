import { friendlyError } from "@accedu/api";
import { useDb } from "@accedu/api/react";
import { brand } from "@accedu/ui-tokens";
import { router } from "expo-router";
import { useState } from "react";
import { KeyboardAvoidingView, Platform, Text, View } from "react-native";
import { Button, Card, Field } from "../src/ui";
import { colors, s } from "../src/theme";

export default function Login() {
  const db = useDb();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function signIn() {
    setBusy(true);
    setError(null);
    const { error: e } = await db.auth.signInWithPassword({ email: email.trim(), password });
    setBusy(false);
    if (e) setError(/Invalid login/i.test(e.message) ? "Email hoặc mật khẩu không đúng" : friendlyError(e));
    else router.replace("/");
  }

  return (
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={[s.screen, { backgroundColor: colors.navy[500] }]}>
      <View style={[s.content, { flex: 1, justifyContent: "center" }]}>
        <Text style={{ color: "#fff", fontSize: 32, fontWeight: "800", textAlign: "center" }}>{brand.name}</Text>
        <Text style={{ color: colors.gold[300], textAlign: "center", marginBottom: 16 }}>Kế toán đám mây — {brand.slogan}</Text>
        <Card>
          <Field label="Email" value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" autoComplete="email" />
          <Field label="Mật khẩu" value={password} onChangeText={setPassword} secureTextEntry autoComplete="password" />
          {error ? <Text style={s.error}>{error}</Text> : null}
          <Button title="Đăng nhập" onPress={() => void signIn()} disabled={busy} />
        </Card>
        <Text style={{ color: colors.navy[100], textAlign: "center", fontSize: 12 }}>{brand.owner}</Text>
      </View>
    </KeyboardAvoidingView>
  );
}
