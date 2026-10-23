import { AccEduProvider } from "@accedu/api/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useState } from "react";
import { Text, View } from "react-native";
import { db } from "../src/supabase";
import { colors, s } from "../src/theme";

export default function RootLayout() {
  const [queryClient] = useState(() => new QueryClient({ defaultOptions: { queries: { staleTime: 30_000, retry: 1 } } }));
  if (!db) {
    return (
      <View style={[s.screen, s.content, { justifyContent: "center" }]}>
        <Text style={s.title}>Chưa cấu hình AccEdu Platform</Text>
        <Text style={s.subtitle}>Tạo apps/mobile/.env.local với EXPO_PUBLIC_API_URL=https://api.&lt;tên miền&gt;.</Text>
      </View>
    );
  }
  return (
    <AccEduProvider client={db}>
      <QueryClientProvider client={queryClient}>
        <StatusBar style="light" />
        <Stack
          screenOptions={{
            headerStyle: { backgroundColor: colors.navy[500] },
            headerTintColor: "#fff",
            headerTitleStyle: { fontWeight: "700" },
            contentStyle: { backgroundColor: colors.canvas },
          }}
        >
          <Stack.Screen name="index" options={{ title: "AccEdu" }} />
          <Stack.Screen name="login" options={{ title: "Đăng nhập", headerShown: false }} />
          <Stack.Screen name="change-password" options={{ title: "Đổi mật khẩu", headerShown: false }} />
          <Stack.Screen name="[tenant]" options={{ headerShown: false }} />
        </Stack>
      </QueryClientProvider>
    </AccEduProvider>
  );
}
