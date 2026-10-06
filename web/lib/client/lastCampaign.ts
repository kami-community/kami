/**
 * Which campaign this browser last opened — a per-browser convenience so `/`
 * can reopen it. The campaign itself lives in the database; losing this only
 * means landing on the campaign list.
 */

const KEY = "kami_session";

export function rememberedCampaign(): string | null {
  try {
    const saved = localStorage.getItem(KEY);
    return saved ? ((JSON.parse(saved) as { dbId?: string }).dbId ?? null) : null;
  } catch {
    return null;
  }
}

export function rememberCampaign(id: string): void {
  try {
    localStorage.setItem(KEY, JSON.stringify({ dbId: id }));
  } catch {
    /* storage blocked: `/` will show the campaign list instead */
  }
}

export function forgetCampaign(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* storage blocked: nothing to forget */
  }
}
