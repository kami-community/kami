import { FOLLOW_UPS_MARKER } from "@/lib/domain/guideEvents";

/**
 * Splits the guide's streamed answer from its trailing `FOLLOW_UPS: a | b`
 * line. Text is released as soon as it cannot be the start of that marker,
 * so streaming stays live; the marker line itself is never shown.
 */
export function createFollowUpSplitter() {
  let line = "";
  let followUps: string[] = [];

  const couldBeMarker = (s: string) => {
    const t = s.trimStart();
    return FOLLOW_UPS_MARKER.startsWith(t) || t.startsWith(FOLLOW_UPS_MARKER);
  };

  return {
    /** Returns the text that is safe to show now. */
    push(text: string): string {
      let out = "";
      line += text;
      let nl = line.indexOf("\n");
      while (nl !== -1) {
        const complete = line.slice(0, nl + 1);
        line = line.slice(nl + 1);
        if (complete.trimStart().startsWith(FOLLOW_UPS_MARKER)) {
          followUps = parse(complete);
        } else {
          out += complete;
        }
        nl = line.indexOf("\n");
      }
      if (line && !couldBeMarker(line)) {
        out += line;
        line = "";
      }
      return out;
    },
    /** Flush at end of stream: any held text, plus the parsed follow-ups. */
    end(): { text: string; followUps: string[] } {
      let text = "";
      if (line.trimStart().startsWith(FOLLOW_UPS_MARKER)) followUps = parse(line);
      else text = line;
      line = "";
      return { text, followUps };
    },
  };
}

function parse(markerLine: string): string[] {
  return markerLine
    .trim()
    .slice(FOLLOW_UPS_MARKER.length)
    .split("|")
    .map((s) => s.trim().replace(/^["“]|["”]$/g, ""))
    .filter((s) => s.length > 3)
    .slice(0, 3);
}
