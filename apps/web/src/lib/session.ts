import type { Session } from "@accedu/api";
import { useEffect, useState } from "react";
import { db } from "./supabase";

/** Phiên đăng nhập hiện tại; undefined = đang kiểm tra */
export function useSession(): Session | null | undefined {
  const [session, setSession] = useState<Session | null | undefined>(db ? undefined : null);
  useEffect(() => {
    if (!db) return;
    void db.auth.getSession().then(({ data }) => setSession(data.session));
    const { data } = db.auth.onAuthStateChange((_event, s) => setSession(s));
    return () => data.subscription.unsubscribe();
  }, []);
  return session;
}
