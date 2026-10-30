import { api, friendlyError, qk, type AiAnswer } from "@accedu/api";
import { useAiQuota, useDb, useTenant, useTenants } from "@accedu/api/react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocalSearchParams } from "expo-router";
import { useRef, useState } from "react";
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, TextInput, View, type ScrollViewInstance } from "react-native";
import { Button } from "../../src/ui";
import { colors, s } from "../../src/theme";

const STAFF_SUGGESTIONS = [
  "Tháng này còn bao nhiêu học viên chưa đóng học phí?",
  "Doanh thu học phí tháng này theo từng lớp?",
  "Lớp nào có học viên sắp hết khóa (còn 2 buổi trở xuống)?",
];
const COACH_SUGGESTIONS = ["Tháng này tôi đã dạy bao nhiêu buổi?", "Điểm danh tháng này các lớp của tôi thế nào?"];

interface Turn {
  question: string;
  answer?: AiAnswer;
  error?: string;
}

/** Câu trả lời: bỏ dấu ** (chữ đậm), gạch đầu dòng thành "•" */
const plain = (text: string) => text.replace(/\*\*([^*]+)\*\*/g, "$1").replace(/^\s*[-*]\s+/gm, "• ");

/** Hỏi AccEdu trên điện thoại: cùng API với web (Edge Function ai-ask, quyền của người hỏi) */
export default function Ask() {
  const { tenant: slug } = useLocalSearchParams<{ tenant: string }>();
  const tenant = useTenant(slug);
  const tenants = useTenants();
  const role = tenants.data?.find((t) => t.slug === slug?.toLowerCase())?.role;
  const tenantId = tenant.data?.id;
  const db = useDb();
  const qc = useQueryClient();
  const quota = useAiQuota(tenantId);
  const [question, setQuestion] = useState("");
  const [turns, setTurns] = useState<Turn[]>([]);
  const scroll = useRef<ScrollViewInstance>(null);

  const ask = useMutation({
    mutationFn: (q: string) => api.askAi(db, tenantId as string, q),
    onMutate: (q) => setTurns((t) => [...t, { question: q }]),
    onSuccess: (answer) => setTurns((t) => t.map((x, i) => (i === t.length - 1 ? { ...x, answer } : x))),
    onError: (e) => setTurns((t) => t.map((x, i) => (i === t.length - 1 ? { ...x, error: friendlyError(e) } : x))),
    onSettled: () => void qc.invalidateQueries({ queryKey: qk.ai(tenantId ?? "") }),
  });

  function submit(q = question) {
    const text = q.trim();
    if (!text || !tenantId || ask.isPending) return;
    setQuestion("");
    ask.mutate(text);
  }

  const q = quota.data;
  return (
    <KeyboardAvoidingView style={s.screen} behavior={Platform.OS === "ios" ? "padding" : undefined} keyboardVerticalOffset={90}>
      <ScrollView ref={scroll} contentContainerStyle={s.content} onContentSizeChange={() => scroll.current?.scrollToEnd({ animated: true })}>
        <Text style={s.subtitle}>
          {q ? (q.limit === 0 ? "Đơn vị đã tắt AI hỏi đáp" : `Còn ${q.remaining}/${q.limit} câu hỏi hôm nay`) : "Hỏi số liệu bằng tiếng Việt"}
        </Text>
        {turns.length === 0
          ? (role === "coach" ? COACH_SUGGESTIONS : STAFF_SUGGESTIONS).map((sug) => (
              <Pressable key={sug} onPress={() => submit(sug)} style={[s.card, { backgroundColor: colors.navy[50] }]}>
                <Text style={{ color: colors.navy[700] }}>{sug}</Text>
              </Pressable>
            ))
          : turns.map((t, i) => (
              <View key={i} style={{ gap: 6 }}>
                <View style={{ alignSelf: "flex-end", maxWidth: "85%", backgroundColor: colors.navy[500], borderRadius: 10, padding: 10 }}>
                  <Text style={{ color: "#fff" }}>{t.question}</Text>
                </View>
                <View style={s.card}>
                  {t.answer ? (
                    <>
                      <Text style={t.answer.status === "error" ? s.error : { color: colors.ink, lineHeight: 20 }}>
                        {t.answer.status === "error" ? (t.answer.error ?? "AI gặp lỗi, thử lại sau.") : plain(t.answer.answer)}
                      </Text>
                      {t.answer.tools.length ? <Text style={s.label}>Đã tra: {t.answer.tools.join(", ")}</Text> : null}
                    </>
                  ) : t.error ? (
                    <Text style={s.error}>{t.error}</Text>
                  ) : (
                    <Text style={s.subtitle}>AI đang tra cứu số liệu…</Text>
                  )}
                </View>
              </View>
            ))}
      </ScrollView>
      <View style={{ padding: 12, gap: 8, borderTopWidth: 1, borderTopColor: colors.line, backgroundColor: colors.surface }}>
        <TextInput
          style={[s.input, { minHeight: 44 }]}
          value={question}
          onChangeText={setQuestion}
          placeholder="Ví dụ: Học viên nào còn nợ học phí tháng 10?"
          placeholderTextColor={colors.muted}
          maxLength={1000}
          multiline
        />
        <Button title="Hỏi AccEdu" gold disabled={ask.isPending} onPress={() => submit()} />
      </View>
    </KeyboardAvoidingView>
  );
}
