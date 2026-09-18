import type { JevSettings } from "./jev";

export const DEFAULT_SETTINGS: JevSettings = {
  apiKey: "",
  endpoint: "https://api.typesafe.ai/v1/systemone",
  model: "jev-latest",
};

export function normalizeSettings(value: Partial<JevSettings>): JevSettings {
  return {
    apiKey: value.apiKey?.trim() ?? "",
    endpoint: value.endpoint?.trim() || DEFAULT_SETTINGS.endpoint,
    model: value.model?.trim() || DEFAULT_SETTINGS.model,
  };
}
