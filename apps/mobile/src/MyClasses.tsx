import { useMyClasses, useMyCoachSessions } from "@accedu/api/react";
import { formatDateVN, todayVN } from "@accedu/core";
import { router } from "expo-router";
import { FlatList, Pressable, RefreshControl, Text, View } from "react-native";
import { colors, s } from "./theme";

/** Lớp của tôi: HLV chạm vào lớp để điểm danh buổi hôm nay */
export function MyClasses({ slug, tenantId }: { slug: string; tenantId: string | undefined }) {
  const classes = useMyClasses(tenantId);
  const month = todayVN().slice(0, 7);
  const mine = useMyCoachSessions(tenantId, `${month}-01`);
  const taught = (mine.data ?? []).reduce((sum, r) => sum + r.sessions, 0);
  return (
    <FlatList
      style={s.screen}
      contentContainerStyle={s.content}
      data={classes.data ?? []}
      keyExtractor={(c) => c.class_id}
      refreshControl={<RefreshControl refreshing={classes.isFetching} onRefresh={() => void classes.refetch()} />}
      ListHeaderComponent={
        <View style={{ gap: 4 }}>
          <Text style={s.title}>Lớp của tôi</Text>
          <Text style={s.subtitle}>Chạm vào lớp để điểm danh buổi hôm nay</Text>
          {mine.data?.length ? (
            <Text style={{ color: colors.navy[600], fontWeight: "600" }}>
              Tháng {month.slice(5)}/{month.slice(0, 4)}: {taught} buổi dạy ({mine.data.map((r) => `${r.class_code} ${r.sessions}`).join(", ")})
            </Text>
          ) : null}
        </View>
      }
      ListEmptyComponent={
        <Text style={s.subtitle}>{classes.isLoading ? "Đang tải..." : "Chưa được giao lớp nào — nhờ quản trị chọn bạn ở ô “HLV điểm danh” của lớp."}</Text>
      }
      renderItem={({ item }) => (
        <Pressable
          style={s.card}
          accessibilityRole="button"
          onPress={() => router.push({ pathname: "/[tenant]/attendance", params: { tenant: slug, class: item.class_id } })}
        >
          <View style={s.row}>
            <Text style={{ fontSize: 16, fontWeight: "600", color: colors.navy[700], flex: 1 }}>
              {item.code} — {item.name}
            </Text>
            {item.is_mine ? <Text style={{ color: colors.gold[600], fontSize: 12, fontWeight: "600" }}>Lớp của tôi</Text> : null}
          </View>
          <Text style={s.subtitle}>
            {[item.schedule, item.location, `${item.students} học viên`].filter(Boolean).join(" · ")}
          </Text>
          <Text style={s.subtitle}>
            {item.billing === "course" ? `Khóa ${item.sessions_per_course} buổi` : "Học phí theo tháng"}
            {item.last_held_on ? ` · buổi gần nhất ${formatDateVN(item.last_held_on)}` : ""}
          </Text>
        </Pressable>
      )}
    />
  );
}
