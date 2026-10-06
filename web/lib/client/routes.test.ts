import { describe, expect, it } from "vitest";
import { parseViewPath, viewHref, type View } from "./routes";

const ID = "6f1c1d1e-0000-4000-8000-000000000001";

describe("workspace routes", () => {
  it("lands on Home for an empty or unknown path", () => {
    expect(parseViewPath(undefined)).toEqual({ area: "home" });
    expect(parseViewPath([])).toEqual({ area: "home" });
    expect(parseViewPath(["nope"])).toEqual({ area: "home" });
  });

  it("defaults an area to its first tab", () => {
    expect(parseViewPath(["sales"])).toEqual({ area: "sales", tab: "plan" });
    expect(parseViewPath(["distribution", "bogus"])).toEqual({
      area: "distribution",
      tab: "opportunities",
    });
  });

  it("round-trips every view through its URL", () => {
    const views: View[] = [
      { area: "home" },
      { area: "inbox" },
      { area: "sales", tab: "emails" },
      { area: "distribution", tab: "creators" },
      { area: "team", tab: "runs" },
      { area: "activity", tab: "suppressions" },
      { area: "settings", tab: "connections" },
    ];
    for (const view of views) {
      const href = viewHref(ID, view);
      const segments = href.split("/").slice(3);
      expect(parseViewPath(segments)).toEqual(view);
    }
  });
});
