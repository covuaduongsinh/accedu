import { createHash, randomBytes } from "node:crypto";
import { jwtVerify, SignJWT, type JWTPayload } from "jose";

export interface AccessClaims extends JWTPayload {
  sub: string;
  role: "authenticated";
  email: string;
  session_id: string;
  user_metadata: Record<string, unknown>;
  app_metadata: Record<string, unknown>;
}

export class TokenService {
  private readonly key: Uint8Array;
  readonly expiresIn: number;

  constructor(secret: string, expiresIn: number) {
    this.key = new TextEncoder().encode(secret);
    this.expiresIn = expiresIn;
  }

  /** JWT HS256 — PostgREST kiểm bằng cùng secret rồi SET ROLE theo claim `role` */
  async signAccess(claims: Omit<AccessClaims, "role" | "iat" | "exp" | "aud">): Promise<{ token: string; expiresAt: number }> {
    const now = Math.floor(Date.now() / 1000);
    const expiresAt = now + this.expiresIn;
    const token = await new SignJWT({ ...claims, role: "authenticated" })
      .setProtectedHeader({ alg: "HS256", typ: "JWT" })
      .setIssuedAt(now)
      .setExpirationTime(expiresAt)
      .setAudience("authenticated")
      .setIssuer("accedu")
      .sign(this.key);
    return { token, expiresAt };
  }

  async verifyAccess(token: string): Promise<AccessClaims> {
    const { payload } = await jwtVerify(token, this.key, { audience: "authenticated", issuer: "accedu", algorithms: ["HS256"] });
    if (payload.role !== "authenticated" || typeof payload.sub !== "string") throw new Error("invalid role");
    return payload as AccessClaims;
  }
}

export function newRefreshToken(): string {
  return randomBytes(32).toString("base64url");
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}
