import type { ReactNode } from "react";
import { ActivityIndicator, Pressable, Text, TextInput, View, type TextInputProps } from "react-native";
import { colors, s } from "./theme";

export function Button({ title, onPress, disabled, gold }: { title: string; onPress: () => void; disabled?: boolean; gold?: boolean }) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [s.button, gold ? s.buttonGold : null, { opacity: disabled ? 0.5 : pressed ? 0.85 : 1 }]}
    >
      {disabled ? <ActivityIndicator color="#fff" /> : <Text style={[s.buttonText, gold ? { color: colors.navy[900] } : null]}>{title}</Text>}
    </Pressable>
  );
}

export function Field({ label, ...props }: TextInputProps & { label: string }) {
  return (
    <View style={{ gap: 4 }}>
      <Text style={s.label}>{label}</Text>
      <TextInput style={s.input} placeholderTextColor={colors.muted} {...props} />
    </View>
  );
}

export function Card({ children }: { children: ReactNode }) {
  return <View style={s.card}>{children}</View>;
}
