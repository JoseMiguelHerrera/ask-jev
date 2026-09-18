import type { AskErrorSource, JevErrorCode } from "./jev";

export type { AskErrorSource };

export interface AskFailure {
  ok?: false;
  code?: JevErrorCode;
  source?: AskErrorSource;
  error: string;
}

export interface PresentedAskError {
  source: AskErrorSource;
  label: string;
  message: string;
  attribution: string;
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
