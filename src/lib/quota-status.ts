export interface QuotaCount {
  remaining?: number;
  limit?: number;
}

export interface QuotaSnapshot {
  install?: QuotaCount;
  burst?: QuotaCount & { windowSeconds?: number; retryAfterSeconds?: number };
  network?: QuotaCount;
  global?: QuotaCount;
  resetsAt?: string;
}

export interface QuotaRow {
  id: "install" | "burst" | "network" | "global";
  label: string;
  text: string;
}

function isCount<T extends QuotaCount>(value: T | undefined): value is T & { remaining: number; limit: number } {
  return typeof value?.remaining === "number" && typeof value.limit === "number";
}

export function quotaRows(snapshot: QuotaSnapshot): QuotaRow[] {
  const rows: QuotaRow[] = [];
  if (isCount(snapshot.install)) {
    rows.push({
      id: "install",
      label: "This install",
      text: `${snapshot.install.remaining} of ${snapshot.install.limit} left today`,
    });
  }
  if (isCount(snapshot.burst)) {
    const window = typeof snapshot.burst.windowSeconds === "number"
      ? `${snapshot.burst.windowSeconds === 1 ? "1-second" : `${snapshot.burst.windowSeconds}-second`} window`
      : "Short window";
    rows.push({
      id: "burst",
      label: window,
      text: `${snapshot.burst.remaining} of ${snapshot.burst.limit} left`,
    });
  }
  if (isCount(snapshot.network)) {
    rows.push({
      id: "network",
      label: "This network",
      text: `${snapshot.network.remaining} of ${snapshot.network.limit} left today`,
    });
  }
  if (isCount(snapshot.global)) {
    rows.push({
      id: "global",
      label: "Shared pool",
      text: `${snapshot.global.remaining} of ${snapshot.global.limit} left today`,
    });
  }
  return rows;
}

export function formatReset(resetsAt: string | undefined): string | undefined {
  if (!resetsAt || Number.isNaN(Date.parse(resetsAt))) return undefined;
  return `Resets ${resetsAt.replace(".000Z", "Z").replace("T", " ").replace("Z", " UTC")}`;
}
