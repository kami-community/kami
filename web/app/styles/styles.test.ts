import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import postcss from "postcss";
import { describe, expect, it } from "vitest";

/** Every stylesheet must parse: Turbopack tolerates broken blocks that webpack (npm run dev) rejects. */
const files = [
  join(__dirname, "..", "globals.css"),
  ...readdirSync(__dirname)
    .filter((f) => f.endsWith(".css"))
    .map((f) => join(__dirname, f)),
];

describe("stylesheets", () => {
  it.each(files)("%s parses", (file) => {
    expect(() => postcss.parse(readFileSync(file, "utf8"), { from: file })).not.toThrow();
  });
});
