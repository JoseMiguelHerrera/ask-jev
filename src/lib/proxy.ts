import {
  buildJevRequest,
  JevRequestError,
  parseChoiceResult,
  type AskInput,
  type JevChoiceResult,
  type JevSettings,
  type QuotaDetails,
} from "./jev";

export const DEFAULT_PROXY_URL = "https://ask-jev-backend.vercel.app";

export function proxyUrl(): string {
  const configured = import.meta.env.VITE_ASK_JEV_PROXY_URL?.trim();
  return (configured || DEFAULT_PROXY_URL).replace(/\/$/, "");
}

export function proxyClientSecret(): string {
  return import.meta.env.VITE_PROXY_CLIENT_SECRET?.trim() ?? "";
}

export async function signProxyBody(secret: string, timestamp: string, rawBody: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(`${timestamp}.${rawBody}`),
  );
  return [...new Uint8Array(signature)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function unavailable(): JevRequestError {
  return new JevRequestError(
    "quota",
    "Free questions are temporarily unavailable.",
    "plugin",
    { limit: "unavailable" },
  );
}

function quotaError(data: Record<string, unknown>): JevRequestError | undefined {
  const limit = data.limit;
  if (limit !== "burst" && limit !== "daily" && limit !== "network" && limit !== "global") return undefined;
  const remaining = typeof data.remaining === "number" ? data.remaining : undefined;
  const retryAfterSeconds = typeof data.retryAfterSeconds === "number" ? data.retryAfterSeconds : undefined;
  const allowance = typeof data.allowance === "number" ? data.allowance : undefined;
  const burstLimit = typeof data.burstLimit === "number" ? data.burstLimit : undefined;
  const burstWindowSeconds = typeof data.burstWindowSeconds === "number" ? data.burstWindowSeconds : undefined;
  return new JevRequestError("quota", "Free questions are limited.", "plugin", {
    limit,
    remaining,
    retryAfterSeconds,
    allowance,
    burstLimit,
    burstWindowSeconds,
  });
}

export interface FreeQuotaSnapshot {
  install?: { remaining?: number; limit?: number };
  burst?: { remaining?: number; limit?: number; windowSeconds?: number; retryAfterSeconds?: number };
  network?: { remaining?: number; limit?: number };
  global?: { remaining?: number; limit?: number };
  resetsAt?: string;
}

export async function requestQuota(options: {
  installId: string;
  secret?: string;
  proxyUrl?: string;
  fetcher?: typeof fetch;
  now?: () => number;
}): Promise<FreeQuotaSnapshot> {
  const secret = (options.secret ?? proxyClientSecret()).trim();
  if (!secret) throw unavailable();
  const rawBody = "{}";
  const timestamp = String(options.now?.() ?? Date.now());
  const signature = await signProxyBody(secret, timestamp, rawBody);
  const fetcher = options.fetcher ?? fetch;
  let response: Response;
  try {
    response = await fetcher(`${options.proxyUrl ?? proxyUrl()}/api/quota`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-ask-jev-timestamp": timestamp,
        "x-ask-jev-signature": signature,
        "x-ask-jev-install": options.installId,
      },
      body: rawBody,
    });
  } catch {
    throw unavailable();
  }
  let data: unknown = null;
  try {
    data = await response.json();
  } catch {
    data = null;
  }
  if (!response.ok || !isRecord(data)) throw unavailable();
  return data as FreeQuotaSnapshot;
}

export async function requestFreeJev(
  input: AskInput,
  settings: JevSettings,
  options: {
    installId: string;
    secret?: string;
    proxyUrl?: string;
    fetcher?: typeof fetch;
    now?: () => number;
  },
): Promise<{ result: JevChoiceResult; remaining?: number }> {
  const secret = (options.secret ?? proxyClientSecret()).trim();
  if (!secret) throw unavailable();
  const rawBody = JSON.stringify(buildJevRequest(input.context, input.question, input.choices, settings.model));
  const timestamp = String(options.now?.() ?? Date.now());
  const signature = await signProxyBody(secret, timestamp, rawBody);
  const fetcher = options.fetcher ?? fetch;
  let response: Response;
  try {
    response = await fetcher(`${options.proxyUrl ?? proxyUrl()}/api/ask`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-ask-jev-timestamp": timestamp,
        "x-ask-jev-signature": signature,
        "x-ask-jev-install": options.installId,
      },
      body: rawBody,
    });
  } catch {
    throw new JevRequestError("network", "Could not reach free questions. Check your connection.", "plugin");
  }

  let data: unknown = null;
  try {
    data = await response.json();
  } catch {
    data = null;
  }

  if (response.status === 429 && isRecord(data) && data.code === "quota") {
    throw quotaError(data) ?? unavailable();
  }
  if (response.status === 429 && isRecord(data) && data.code === "rate_limit") {
    throw new JevRequestError("rate_limit", "Jev is busy or rate-limited. Try again shortly.", "jev");
  }
  if (response.status === 503 || response.status === 403 || (isRecord(data) && (data.code === "unavailable" || data.code === "forbidden"))) {
    throw unavailable();
  }
  if (response.status === 529) {
    throw new JevRequestError("overloaded", "Jev is temporarily overloaded. Try again shortly.", "jev");
  }
  if (response.status === 400 || response.status === 413 || response.status === 415 || response.status === 422) {
    throw new JevRequestError("bad_request", "Jev could not evaluate this question.", "plugin");
  }
  if (!response.ok) {
    throw new JevRequestError("network", "Could not reach free questions. Check your connection.", "plugin");
  }
  const result = parseChoiceResult(data, input.choices);
  const remaining = isRecord(data) && typeof data.remaining === "number" ? data.remaining : undefined;
  return { result, remaining };
}

export type { QuotaDetails };
