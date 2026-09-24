const INSTALL_KEY = "installId";
const INSTALL_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export interface InstallIdStorage {
  get: (key: string) => Promise<Record<string, unknown>>;
  set: (items: Record<string, string>) => Promise<void>;
}

export async function loadInstallId(storage: InstallIdStorage): Promise<string> {
  const stored = await storage.get(INSTALL_KEY);
  const existing = stored[INSTALL_KEY];
  if (typeof existing === "string" && INSTALL_ID.test(existing)) return existing;
  const created = crypto.randomUUID();
  await storage.set({ [INSTALL_KEY]: created });
  return created;
}
