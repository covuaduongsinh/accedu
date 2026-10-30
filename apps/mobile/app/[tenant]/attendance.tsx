import { friendlyError, type AttendanceStatus, type RosterRow } from "@accedu/api";
import { useMyClasses, useRecordAttendance, useRoster, useTenant } from "@accedu/api/react";
import { ATTENDANCE_STATUS, COURSE_ENDING_SESSIONS, formatDateVN, remainingLabel, todayVN } from "@accedu/core";
import { Stack, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { Alert, FlatList, Pressable, RefreshControl, Text, View } from "react-native";
import { colors, s } from "../../src/theme";
import { Button, Field } from "../../src/ui";

const STATUSES = Object.keys(ATTENDANCE_STATUS) as AttendanceStatus[];
const TONE: Record<AttendanceStatus, string> = { present: colors.success, absent: colors.danger, excused: colors.gold[600] };

const shiftDay = (d: string, delta: number) => {
  const x = new Date(`${d}T00:00:00Z`);
  x.setUTCDate(x.getUTCDate() + delta);
  return x.toISOString().slice(0, 10);
};

/** Điểm danh một buổi: mỗi học viên Có mặt / Vắng / Có phép, lưu khi xong (tự thử lại khi mạng chập chờn) */
export default function Attendance() {
  const { tenant: slug, class: classId } = useLocalSearchParams<{ tenant: string; class: string }>();
  const tenant = useTenant(slug);
  const classes = useMyClasses(tenant.data?.id);
  const cls = classes.data?.find((c) => c.class_id === classId);
  const [date, setDate] = useState(todayVN());
  const roster = useRoster(tenant.data?.id, classId, date);
  const save = useRecordAttendance(tenant.data?.id);
  const [edits, setEdits] = useState<Record<string, AttendanceStatus | null>>({});
  const [topic, setTopic] = useState("");
  const rows = roster.data ?? [];
  const statusOf = (r: RosterRow) => (r.student_id in edits ? edits[r.student_id] : r.status) ?? null;
  const marked = rows.filter((r) => statusOf(r)).length;
  const today = todayVN();

  const changeDate = (d: string) => {
    setDate(d);
    setEdits({});
  };

  async function submit() {
    try {
      const r = await save.mutateAsync({ classId, date, topic, rows: rows.map((x) => ({ studentId: x.student_id, status: statusOf(x) })) });
      setEdits({});
      Alert.alert("Đã lưu điểm danh", `${formatDateVN(date)}: ${r.saved} học viên`);
    } catch (e) {
      Alert.alert("Chưa lưu được", friendlyError(e));
    }
  }

  return (
    <>
      <Stack.Screen options={{ title: cls ? `Điểm danh ${cls.code}` : "Điểm danh" }} />
      <FlatList
        style={s.screen}
        contentContainerStyle={s.content}
        data={rows}
        keyExtractor={(r) => r.student_id}
        refreshControl={<RefreshControl refreshing={roster.isFetching} onRefresh={() => void roster.refetch()} />}
        ListHeaderComponent={
          <View style={{ gap: 8 }}>
            <View style={[s.row, { gap: 8 }]}>
              <Pressable accessibilityRole="button" onPress={() => changeDate(shiftDay(date, -1))}>
                <Text style={{ color: colors.navy[500], fontWeight: "600", fontSize: 18 }}>‹</Text>
              </Pressable>
              <Text style={s.title}>{date === today ? `Hôm nay ${formatDateVN(date)}` : formatDateVN(date)}</Text>
              <Pressable accessibilityRole="button" disabled={date >= today} onPress={() => changeDate(shiftDay(date, 1))}>
                <Text style={{ color: date >= today ? colors.line : colors.navy[500], fontWeight: "600", fontSize: 18 }}>›</Text>
              </Pressable>
            </View>
            {cls ? <Text style={s.subtitle}>{[cls.name, cls.schedule, cls.location].filter(Boolean).join(" · ")}</Text> : null}
            <Field label="Nội dung buổi học" value={topic} onChangeText={setTopic} placeholder="Ví dụ: Khai cuộc Ý" />
            <Pressable accessibilityRole="button" onPress={() => setEdits(Object.fromEntries(rows.map((r) => [r.student_id, "present" as const])))}>
              <Text style={{ color: colors.navy[500], fontWeight: "600" }}>✓ Có mặt tất cả</Text>
            </Pressable>
          </View>
        }
        ListEmptyComponent={<Text style={s.subtitle}>{roster.isLoading ? "Đang tải..." : "Lớp chưa có học viên đang học vào ngày này"}</Text>}
        renderItem={({ item }) => {
          const st = statusOf(item);
          const low = item.remaining !== null && item.remaining <= COURSE_ENDING_SESSIONS;
          return (
            <View style={s.card}>
              <View style={s.row}>
                <Text style={{ fontWeight: "600", color: colors.ink, flex: 1 }}>
                  {item.student_name} <Text style={s.subtitle}>({item.student_code})</Text>
                </Text>
                {item.remaining !== null ? (
                  <Text style={{ fontSize: 12, fontWeight: "600", color: low ? colors.danger : colors.muted }}>{remainingLabel(item.remaining)}</Text>
                ) : null}
              </View>
              <View style={{ flexDirection: "row", gap: 6 }}>
                {STATUSES.map((k) => (
                  <Pressable
                    key={k}
                    accessibilityRole="button"
                    accessibilityState={{ selected: st === k }}
                    onPress={() => setEdits({ ...edits, [item.student_id]: st === k ? null : k })}
                    style={{
                      flex: 1,
                      paddingVertical: 10,
                      borderRadius: 8,
                      borderWidth: 1,
                      alignItems: "center",
                      borderColor: st === k ? TONE[k] : colors.line,
                      backgroundColor: st === k ? TONE[k] : colors.surface,
                    }}
                  >
                    <Text style={{ fontWeight: "600", color: st === k ? "#fff" : colors.muted }}>{ATTENDANCE_STATUS[k]}</Text>
                  </Pressable>
                ))}
              </View>
            </View>
          );
        }}
        ListFooterComponent={
          rows.length ? (
            <View style={{ gap: 6 }}>
              <Text style={s.subtitle}>
                Đã đánh dấu {marked}/{rows.length} học viên · có phép không trừ buổi
              </Text>
              <Button title={save.isPending ? "Đang lưu..." : "Lưu điểm danh"} disabled={save.isPending} onPress={() => void submit()} />
            </View>
          ) : undefined
        }
      />
    </>
  );
}
