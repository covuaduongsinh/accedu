import { todayVN } from "@accedu/core";

export function monthRange(iso = todayVN()): { from: string; to: string } {
  const [y, m] = iso.split("-").map(Number) as [number, number];
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const mm = String(m).padStart(2, "0");
  return { from: `${y}-${mm}-01`, to: `${y}-${mm}-${String(last).padStart(2, "0")}` };
}

export function yearRange(iso = todayVN()): { from: string; to: string } {
  const y = iso.slice(0, 4);
  return { from: `${y}-01-01`, to: `${y}-12-31` };
}
