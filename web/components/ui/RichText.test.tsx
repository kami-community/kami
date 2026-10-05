import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import RichText from "./RichText";

const html = (text: string) => renderToStaticMarkup(<RichText text={text} />);

describe("RichText", () => {
  it("renders bold, italic and lists", () => {
    expect(html("Start with **Sales**.\n- one\n- *two*")).toBe(
      '<div class="rich-text"><p>Start with <strong>Sales</strong>.</p><ul><li>one</li><li><em>two</em></li></ul></div>',
    );
  });

  it("never renders HTML from the text", () => {
    expect(html("<img src=x onerror=alert(1)>")).toContain("&lt;img");
  });
});
