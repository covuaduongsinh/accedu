import { hash, verify } from "@node-rs/argon2";

// Tham số argon2id theo khuyến nghị OWASP (19 MiB, 2 vòng)
const OPTIONS = { memoryCost: 19_456, timeCost: 2, parallelism: 1 } as const;

export function hashPassword(password: string): Promise<string> {
  return hash(password, OPTIONS);
}

export async function verifyPassword(hashed: string | null, password: string): Promise<boolean> {
  if (!hashed) return false;
  try {
    return await verify(hashed, password);
  } catch {
    return false;
  }
}

/** Chính sách mật khẩu tối thiểu: ≥ 8 ký tự, có chữ và số. */
export function passwordProblem(password: string): string | null {
  if (password.length < 8) return "Mật khẩu phải có ít nhất 8 ký tự";
  if (!/[A-Za-z]/.test(password) || !/\d/.test(password)) return "Mật khẩu phải có cả chữ và số";
  return null;
}
