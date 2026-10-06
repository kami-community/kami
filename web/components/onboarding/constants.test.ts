import { describe, expect, it } from "vitest";
import { cleanDomain, jobHref, recommendedJob } from "./constants";

describe("cleanDomain", () => {
  it("strips scheme, www, paths and case", () => {
    expect(cleanDomain("  HTTPS://www.Acme.com/pricing?x=1 ")).toBe("acme.com");
    expect(cleanDomain("app.acme.co.uk")).toBe("app.acme.co.uk");
  });

  it("rejects things that are not domains", () => {
    expect(cleanDomain("acme")).toBeNull();
    expect(cleanDomain("")).toBeNull();
    expect(cleanDomain("acme .com")).toBeNull();
  });
});

describe("recommendedJob", () => {
  it("recommends distribution for signup or awareness goals", () => {
    expect(recommendedJob(["Get signups"])).toBe("distribution");
    expect(recommendedJob(["Book meetings", "Build awareness"])).toBe("distribution");
  });

  it("recommends finding customers otherwise", () => {
    expect(recommendedJob([])).toBe("sales");
    expect(recommendedJob(["Book meetings"])).toBe("sales");
  });
});

describe("jobHref", () => {
  it("opens the plan tab of the chosen area", () => {
    expect(jobHref("abc", "sales")).toBe("/c/abc/sales/plan");
    expect(jobHref("abc", "distribution")).toBe("/c/abc/distribution/plan");
  });
});
