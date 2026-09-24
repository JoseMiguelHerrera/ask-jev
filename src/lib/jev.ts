import type { JevState } from "./context-state";

export type AskErrorSource = "jev" | "plugin";

export interface JevSettings {
  apiKey: string;
  endpoint: string;
  model: string;
}

export interface AskInput {
  context: JevState;
  question: string;
  choices: string[];
}

export interface ChoiceProbability {
  label: string;
  probability: number;
}

export interface JevChoiceResult {
  model: string;
  selected: string;
  probabilities: ChoiceProbability[];
}

export type JevErrorCode =
  | "authentication"
  | "bad_request"
  | "rate_limit"
  | "quota"
  | "overloaded"
  | "network"
  | "invalid_response"
  | "settings";

export type QuotaLimitName = "burst" | "daily" | "network" | "global" | "unavailable";

export interface QuotaDetails {
  limit: QuotaLimitName;
  remaining?: number;
  retryAfterSeconds?: number;
  allowance?: number;
  burstLimit?: number;
  burstWindowSeconds?: number;
}

export class JevRequestError extends Error {
  readonly source: AskErrorSource;
  readonly quota?: QuotaDetails;

  constructor(
    public readonly code: JevErrorCode,
    message: string,
    source: AskErrorSource = code === "settings" || code === "quota" ? "plugin" : "jev",
    quota?: QuotaDetails,
  ) {
    super(message);
    this.name = "JevRequestError";
    this.source = source;
    this.quota = quota;
  }
}

export function buildJevRequest(
  context: JevState,
  question: string,
  choices: string[],
  model: string,
) {
  return {
    state: context,
    model,
    questions: {
      judgment: {
        type: "choice" as const,
        instructions: question,
        criteria: Object.fromEntries(choices.map((choice) => [choice, null])),
      },
    },
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function parseChoiceResult(data: unknown, choices: string[]): JevChoiceResult {
  if (!isRecord(data) || !isRecord(data.answers) || !isRecord(data.answers.judgment)) {
    throw new JevRequestError("invalid_response", "Jev returned an unexpected response.");
  }

  const answer = data.answers.judgment;
  if (
    answer.type !== "choice" ||
    typeof answer.choice !== "string" ||
    !choices.includes(answer.choice) ||
    !isRecord(answer.probabilities)
  ) {
    throw new JevRequestError("invalid_response", "Jev returned an unexpected response.");
  }

  const probabilityMap = answer.probabilities;
  const probabilities = choices.map((label) => {
    const probability = probabilityMap[label];
    if (
      typeof probability !== "number" ||
      !Number.isFinite(probability) ||
      probability < 0 ||
      probability > 1
    ) {
      throw new JevRequestError(
        "invalid_response",
        `Jev returned an invalid probability for “${label}”.`,
      );
    }
    return { label, probability };
  });

  const total = probabilities.reduce((sum, item) => sum + item.probability, 0);
  if (Math.abs(total - 1) > 0.02) {
    throw new JevRequestError("invalid_response", "Jev probabilities did not add up to 100%.");
  }

  return {
    model: typeof data.model === "string" ? data.model : "Jev",
    selected: answer.choice,
    probabilities,
  };
}

function validateEndpoint(endpoint: string): void {
  try {
    const url = new URL(endpoint);
    if (
      url.protocol !== "https:" ||
      url.hostname !== "api.typesafe.ai" ||
      url.pathname !== "/v1/systemone"
    ) {
      throw new Error();
    }
  } catch {
    throw new JevRequestError(
      "settings",
      "Use the TypeSafe System One HTTPS endpoint in Settings.",
    );
  }
}

function readErrorDetail(data: unknown): string {
  if (!isRecord(data)) return "";
  const detail = data.detail;
  if (typeof detail === "string") return detail.trim().slice(0, 180);
  if (Array.isArray(detail) && detail.length) {
    const first = detail[0];
    if (typeof first === "string") return first.trim().slice(0, 180);
    if (isRecord(first) && typeof first.msg === "string") return first.msg.trim().slice(0, 180);
  }
  if (typeof data.message === "string") return data.message.trim().slice(0, 180);
  return "";
}

function errorForStatus(status: number, detail: string): JevRequestError {
  if (status === 401 || status === 403) {
    return new JevRequestError("authentication", "Jev rejected this API key.");
  }
  if (status === 429) {
    return new JevRequestError(
      "rate_limit",
      "Jev is busy or rate-limited. Try again shortly.",
    );
  }
  if (status === 529) {
    return new JevRequestError("overloaded", "Jev is temporarily overloaded. Try again shortly.");
  }
  if (status === 400 || status === 422) {
    return new JevRequestError(
      "bad_request",
      detail ? `Jev rejected this question: ${detail}` : "Jev could not evaluate this question.",
    );
  }
  return new JevRequestError(
    "network",
    detail ? `Jev request failed (${status}): ${detail}` : `Jev request failed (${status}).`,
  );
}

export async function requestJev(
  input: AskInput,
  settings: JevSettings,
  fetcher: typeof fetch = fetch,
): Promise<JevChoiceResult> {
  if (!settings.apiKey.trim()) {
    throw new JevRequestError("settings", "Add your Jev API key in extension Settings.");
  }
  validateEndpoint(settings.endpoint);

  let response: Response;
  try {
    response = await fetcher(settings.endpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${settings.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(
        buildJevRequest(input.context, input.question, input.choices, settings.model),
      ),
    });
  } catch {
    throw new JevRequestError("network", "Could not reach Jev. Check your connection.");
  }

  if (!response.ok) {
    let detail = "";
    try {
      detail = readErrorDetail(await response.json());
    } catch {
      detail = "";
    }
    throw errorForStatus(response.status, detail);
  }

  let data: unknown;
  try {
    data = await response.json();
  } catch {
    throw new JevRequestError("invalid_response", "Jev returned an unreadable response.");
  }
  return parseChoiceResult(data, input.choices);
}
