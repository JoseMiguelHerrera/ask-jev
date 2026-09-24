import type { AskErrorSource, JevErrorCode, QuotaDetails, QuotaLimitName } from "./jev";

export type { AskErrorSource };

export interface AskFailure {
  ok?: false;
  code?: JevErrorCode;
  source?: AskErrorSource;
  error: string;
  quota?: QuotaDetails;
}

export interface QuotaPresentation {
  limit: QuotaLimitName;
  heading: string;
  body: string;
  remaining?: number;
  retryAfterSeconds?: number;
  burstLimit?: number;
  burstWindowSeconds?: number;
  receivedAt?: number;
}

export function burstSecondsLeft(retryAfterSeconds: number, receivedAt: number, now: number): number {
  return Math.max(0, Math.ceil((receivedAt + retryAfterSeconds * 1000 - now) / 1000));
}

function countPhrase(value: number, singular: string, plural: string): string {
  return `${value} ${value === 1 ? singular : plural}`;
}

export function burstQuotaBody(
  remaining: number | undefined,
  secondsLeft: number | undefined,
  burstLimit?: number,
  burstWindowSeconds?: number,
): string {
  const rule = typeof burstLimit === "number" && typeof burstWindowSeconds === "number"
    ? `Free questions are limited to ${burstLimit} every ${countPhrase(burstWindowSeconds, "second", "seconds")}. `
    : "Free questions are coming in too quickly. ";
  const left = typeof remaining === "number" ? `${remaining} left today. ` : "";
  const wait = typeof secondsLeft !== "number"
    ? "Add your own key if you want to keep going."
    : secondsLeft <= 0
      ? "You can ask again, or add your own key."
      : `Wait ${countPhrase(secondsLeft, "second", "seconds")}, or add your own key.`;
  return `${rule}${left}${wait}`;
}

export interface PresentedAskError {
  source: AskErrorSource;
  label: string;
  message: string;
  attribution: string;
  quota?: QuotaPresentation;
}

function dailyQuotaBody(allowance: number | undefined): string {
  const used = allowance === 1
    ? "today's 1 free question"
    : typeof allowance === "number"
      ? `today's ${allowance} free questions`
      : "today's free questions";
  return `This install has used ${used}. They reset at 00:00 UTC. A personal TypeSafe key removes the cap.`;
}

export function presentQuota(quota: QuotaDetails): QuotaPresentation {
  if (quota.limit === "daily") {
    return {
      limit: "daily",
      heading: "Free questions used up",
      body: dailyQuotaBody(quota.allowance),
    };
  }
  if (quota.limit === "network") {
    return {
      limit: "network",
      heading: "Free questions are paused on this network",
      body: "This network has hit the shared-address cap. It resets at 00:00 UTC. A personal key keeps working.",
    };
  }
  if (quota.limit === "global") {
    return {
      limit: "global",
      heading: "Free questions are paused",
      body: "The shared pool is used up for today and resets at 00:00 UTC. A personal key keeps working.",
    };
  }
  if (quota.limit === "burst") {
    return {
      limit: "burst",
      heading: "Slow down a moment",
      body: burstQuotaBody(quota.remaining, quota.retryAfterSeconds, quota.burstLimit, quota.burstWindowSeconds),
      remaining: quota.remaining,
      retryAfterSeconds: quota.retryAfterSeconds,
      burstLimit: quota.burstLimit,
      burstWindowSeconds: quota.burstWindowSeconds,
      receivedAt: Date.now(),
    };
  }
  return {
    limit: "unavailable",
    heading: "Free questions are temporarily unavailable",
    body: "Add your own key to keep asking.",
  };
}

const JEV_CODES = new Set<JevErrorCode>([
  "authentication",
  "rate_limit",
  "overloaded",
  "invalid_response",
]);

export function presentAskError(input: string | AskFailure): PresentedAskError {
  const failure: AskFailure = typeof input === "string" ? { error: input } : input;
  const source =
    failure.source ??
    (failure.code && JEV_CODES.has(failure.code) ? "jev" : "plugin");

  if (failure.code === "quota" || failure.quota) {
    const quota = presentQuota(failure.quota ?? { limit: "unavailable" });
    return {
      source: "plugin",
      label: "Ask Jev",
      message: quota.heading,
      attribution: "",
      quota,
    };
  }

  if (source === "jev") {
    return {
      source,
      label: "Jev error",
      message: failure.error,
      attribution: "This came from TypeSafe Jev, not the Ask Jev extension.",
    };
  }

  return {
    source,
    label: "Ask Jev",
    message: failure.error,
    attribution: "",
  };
}
