import { describe, expect, it } from "vitest";
import { escapeHtml } from "./escape";

describe("escapeHtml", () => {
  it("escapa & < > comillas dobles y simples", () => {
    expect(escapeHtml(`<script>alert("x") & 'y'</script>`)).toBe(
      "&lt;script&gt;alert(&quot;x&quot;) &amp; &#39;y&#39;&lt;/script&gt;",
    );
  });

  it("deja intacto el texto normal", () => {
    expect(escapeHtml("Barbería Ñandú")).toBe("Barbería Ñandú");
  });
});
