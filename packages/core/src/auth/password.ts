/**
 * Chính sách mật khẩu tối thiểu (trùng với apps/server — máy chủ là nơi quyết định cuối cùng):
 * ≥ 8 ký tự, có cả chữ và số.
 */
export function passwordProblem(password: string): string | null {
  if (password.length < 8) return "Mật khẩu phải có ít nhất 8 ký tự";
  if (!/[A-Za-z]/.test(password) || !/\d/.test(password)) return "Mật khẩu phải có cả chữ và số";
  return null;
}

/** Sinh mật khẩu tạm dễ đọc (bỏ ký tự dễ nhầm 0/O, 1/l/I) cho quản trị cấp tài khoản */
export function temporaryPassword(random: (n: number) => number = secureRandom): string {
  const letters = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ";
  const digits = "23456789";
  const pick = (s: string) => s[random(s.length)] as string;
  let out = "";
  for (let i = 0; i < 6; i++) out += pick(letters);
  for (let i = 0; i < 4; i++) out += pick(digits);
  return out;
}

function secureRandom(n: number): number {
  const c = (globalThis as { crypto?: { getRandomValues?: (a: Uint32Array) => Uint32Array } }).crypto;
  if (c?.getRandomValues) return (c.getRandomValues(new Uint32Array(1))[0] as number) % n;
  return Math.floor(Math.random() * n);
}
