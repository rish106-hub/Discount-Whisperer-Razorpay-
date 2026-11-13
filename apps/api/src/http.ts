/** Owner: T2. Small shared HTTP helpers for T2 routes (error bodies, JSON parsing, CORS, waitUntil). */
import type { Context } from "hono";
import type { ErrorBody, ErrorCode } from "@dw/contracts";
import type { ZodType } from "zod";
import type { AppEnv } from "./env";

export const fail = (c: Context<AppEnv>, status: 400 | 401 | 404 | 409 | 413 | 500, error: ErrorCode, detail?: string) =>
  c.json<ErrorBody>(detail ? { error, detail } : { error }, status);

/** Parse body as JSON whatever the Content-Type (sendBeacon sends text/plain). */
export async function parseBody<T>(
  c: Context<AppEnv>,
  schema: ZodType<T>,
  text?: string,
): Promise<{ ok: true; data: T } | { ok: false; res: Response }> {
  let json: unknown;
  try {
    json = JSON.parse(text ?? (await c.req.text()));
  } catch {
    return { ok: false, res: fail(c, 400, "bad_request", "body is not valid JSON") };
  }
  const r = schema.safeParse(json);
  if (!r.success) {
    const detail = r.error.issues.slice(0, 5).map((i) => `${i.path.join(".") || "body"}: ${i.message}`).join("; ");
    return { ok: false, res: fail(c, 400, "validation_failed", detail) };
  }
  return { ok: true, data: r.data };
}

export const CORS = { "access-control-allow-origin": "*" } as const;

/** Run background work after the response; falls back to fire-and-forget when no ExecutionContext (tests). */
export function background(c: Context<AppEnv>, work: Promise<unknown>): void {
  const safe = work.catch((e: unknown) =>
    console.log(JSON.stringify({ route: "background", error: e instanceof Error ? e.message : "unknown" })),
  );
  try {
    c.executionCtx.waitUntil(safe);
  } catch {
    /* no execution context */
  }
}
