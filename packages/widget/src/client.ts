import type { Ladder } from "@dw/contracts";

/** Mirrors WIDGET_FETCH_TIMEOUT_MS in @dw/contracts (root import is type-only here; a test pins equality). */
export const FETCH_TIMEOUT_MS = 800;

/** Cheap structural check. No zod in the widget; anything odd fails closed. */
export function isLadder(x: unknown): x is Ladder {
  const l = x as Partial<Ladder> | null;
  return (
    !!l &&
    typeof l === "object" &&
    l.v === 1 &&
    typeof l.merchantId === "string" &&
    typeof l.disabled === "boolean" &&
    Array.isArray(l.offers) &&
    Array.isArray(l.mins) &&
    l.mins.length === l.offers.length &&
    Array.isArray(l.fillers)
  );
}

export function trimBase(base: string): string {
  return base.replace(/\/+$/, "");
}

/**
 * GET /v1/ladder/:merchantId. Resolves null on timeout, abort, HTTP error, bad JSON or bad shape.
 * `outer` lets the element abort on disconnect. Never rejects.
 */
export async function fetchLadder(
  apiBase: string,
  merchantId: string,
  outer?: AbortSignal,
  timeoutMs: number = FETCH_TIMEOUT_MS,
): Promise<Ladder | null> {
  const ctl = new AbortController();
  const onOuter = () => ctl.abort();
  if (outer?.aborted) return null;
  outer?.addEventListener("abort", onOuter, { once: true });
  let timer: ReturnType<typeof setTimeout> | undefined;
  // The timer also races the fetch, so a fetch that ignores its signal still cannot hang us.
  const timeout = new Promise<null>((resolve) => {
    timer = setTimeout(() => {
      ctl.abort();
      resolve(null);
    }, timeoutMs);
  });
  const run = (async (): Promise<Ladder | null> => {
    try {
      const res = await fetch(`${trimBase(apiBase)}/v1/ladder/${encodeURIComponent(merchantId)}`, {
        signal: ctl.signal,
        headers: { accept: "application/json" },
      });
      if (!res.ok) return null;
      const json: unknown = await res.json();
      return isLadder(json) ? json : null;
    } catch {
      return null;
    }
  })();
  try {
    return await Promise.race([run, timeout]);
  } finally {
    clearTimeout(timer);
    outer?.removeEventListener("abort", onOuter);
  }
}
