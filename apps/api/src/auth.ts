/** Owner: T2. Constant-time secret checks (Workers have no timingSafeEqual in all runtimes; hash then XOR). */
import type { Context, MiddlewareHandler } from "hono";
import type { ErrorBody } from "@dw/contracts";
import type { AppEnv } from "./env";

async function sha256(s: string): Promise<Uint8Array> {
  return new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s)));
}

/** Compares SHA-256 digests so length never leaks and the loop never exits early. */
export async function safeEqual(a: string, b: string): Promise<boolean> {
  const [x, y] = await Promise.all([sha256(a), sha256(b)]);
  let diff = 0;
  for (let i = 0; i < x.length; i++) diff |= x[i]! ^ y[i]!;
  return diff === 0;
}

export const unauthorized = (c: Context<AppEnv>) => c.json<ErrorBody>({ error: "unauthorized" }, 401);

export function requireAdmin(): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    const m = /^Bearer (.+)$/.exec(c.req.header("authorization") ?? "");
    const expected = c.env.ADMIN_TOKEN;
    // Empty configured token must never authorize anyone.
    if (!m || !expected || !(await safeEqual(m[1]!, expected))) return unauthorized(c);
    await next();
  };
}
