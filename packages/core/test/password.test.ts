import { describe, expect, it } from "vitest";
import { passwordProblem, temporaryPassword } from "../src/auth/password";

describe("chính sách mật khẩu", () => {
  it("bắt buộc ≥ 8 ký tự, có chữ và số", () => {
    expect(passwordProblem("abc123")).toMatch(/8 ký tự/);
    expect(passwordProblem("abcdefgh")).toMatch(/chữ và số/);
    expect(passwordProblem("12345678")).toMatch(/chữ và số/);
    expect(passwordProblem("DuongSinh2026")).toBeNull();
  });

  it("mật khẩu tạm luôn đạt chính sách và không có ký tự dễ nhầm", () => {
    for (let i = 0; i < 200; i++) {
      const p = temporaryPassword();
      expect(passwordProblem(p)).toBeNull();
      expect(p).not.toMatch(/[0O1lI]/);
    }
  });
});
