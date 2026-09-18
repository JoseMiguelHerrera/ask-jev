import type { AskJevResponse, AskSubmissionPayload } from "./messages";

const EMPTY_RESPONSE_ERROR = "Ask Jev did not respond. Close the palette and try again.";

function isAskJevResponse(value: unknown): value is AskJevResponse {
  if (typeof value !== "object" || value === null || !("ok" in value)) return false;
  const response = value as Record<string, unknown>;
  return response.ok === true || typeof response.error === "string";
}

export async function sendAskJevRequest(
  payload: AskSubmissionPayload,
  send: (message: unknown) => Promise<unknown> = (message) => chrome.runtime.sendMessage(message),
): Promise<AskJevResponse> {
  await send({ type: "ASK_JEV_PING" }).catch(() => undefined);

  const message = { type: "ASK_JEV_REQUEST", payload };
  let lastError: unknown;

  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const response = await send(message);
      if (isAskJevResponse(response)) return response;
      lastError = new Error(EMPTY_RESPONSE_ERROR);
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError instanceof Error ? lastError : new Error(EMPTY_RESPONSE_ERROR);
}
