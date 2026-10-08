/**
 * "Skip to workspace" is for this browser tab only. Closing the tab and
 * opening Kami again returns a founder who still hasn't started a job to
 * the Choose step.
 */

const key = (sessionId: string) => `kami.skip-choose.${sessionId}`;

export function markChooseSkipped(sessionId: string): void {
  try {
    sessionStorage.setItem(key(sessionId), "1");
  } catch {
    /* storage blocked: the next Home visit returns to Choose */
  }
}

export function chooseWasSkipped(sessionId: string): boolean {
  try {
    return sessionStorage.getItem(key(sessionId)) === "1";
  } catch {
    return false;
  }
}
