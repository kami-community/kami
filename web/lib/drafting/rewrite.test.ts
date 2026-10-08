import { describe, expect, it } from "vitest";
import { fakeDb } from "@/lib/testing/fakeDb";
import { inventedDetails, rewritePassage } from "./rewrite";

const SESSION = "6f1c1d0e-2a51-4f6b-9a8e-0d1f0c9b7a11";
const TP = "a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d";

describe("inventedDetails", () => {
  it("flags emails and links the draft never had", () => {
    expect(
      inventedDetails("Write me at a@b.com", "Ping a@b.com or c@d.io, see https://x.dev"),
    ).toEqual(["c@d.io", "https://x.dev"]);
    expect(inventedDetails("See https://kami.dev today", "Take a look: https://kami.dev")).toEqual(
      [],
    );
  });
});

describe("rewritePassage", () => {
  it("refuses drafts that already went out", async () => {
    const { db } = fakeDb({
      sales_touchpoints: [
        {
          id: TP,
          session_id: SESSION,
          draft_body: "Hello there friend",
          status: "sent",
          sent_at: "2026-10-01",
        },
      ],
    });
    await expect(
      rewritePassage(db, {
        sessionId: SESSION,
        subject: { type: "sales_touchpoint", id: TP },
        selection: "Hello",
        instruction: "Shorten",
      }),
    ).rejects.toMatchObject({ code: "forbidden" });
  });

  it("rejects a selection that is not in the stored draft", async () => {
    const { db } = fakeDb({
      sales_touchpoints: [
        { id: TP, session_id: SESSION, draft_body: "Hello there", status: "drafted" },
      ],
    });
    await expect(
      rewritePassage(db, {
        sessionId: SESSION,
        subject: { type: "sales_touchpoint", id: TP },
        selection: "Goodbye",
        instruction: "Shorten",
      }),
    ).rejects.toMatchObject({ code: "bad_request" });
  });
});
