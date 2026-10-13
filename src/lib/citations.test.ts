import { describe, expect, it } from "vitest";
import { formatAnswer } from "./assistant";
import { citation, citedNumbers, describeSource, groupSources, readPassage, stripCitations } from "./citations";
import sample from "./fixtures/rag-answer.json";

describe("citations", () => {
  it("names known and unknown sources like the AEDS_RAG web UI", () => {
    expect(describeSource("MPO_AEDS_2026_EN")).toEqual({ title: "Examination regulations (2026)", kind: "Regulations" });
    expect(describeSource("AEDS_website_new_page")).toEqual({ title: "New page", kind: "Programme website" });
    expect(describeSource("MPO_Other_2030")).toMatchObject({ title: "Examination regulations" });
    expect(describeSource("some_module_handbook")).toMatchObject({ kind: "Module handbook" });
    expect(describeSource("random_file")).toEqual({ title: "Random file", kind: "Document" });
  });

  it("reads the section label and plain text of a passage", () => {
    const p = readPassage("[Examination regulations 2026 (AEDS) | Section 8 Resitting]\n## Rules\n- **Twice** at most\n");
    expect(p.section).toBe("Section 8 Resitting");
    expect(p.text).toBe("Rules\n• Twice at most");
    expect(readPassage("No header here").section).toBeNull();
  });

  it("rejoins lines broken by PDF extraction but keeps paragraphs and lists", () => {
    const p = readPassage("[Doc | Section 8]\n(1) Failed exams can be\nretaken twice. The free\n-attempt rules\ndo not apply.\n\n(2) Next paragraph\n- point one\n- point two");
    expect(p.text).toBe("(1) Failed exams can be retaken twice. The free-attempt rules do not apply.\n\n(2) Next paragraph\n• point one\n• point two");
  });

  it("groups sources per document with every cited page and only web links", () => {
    const g = groupSources([
      { source_id: "MPO_AEDS_2026_EN", page: 8, url: "https://x/a.pdf" },
      { source_id: "MPO_AEDS_2026_EN", page: 5, url: "https://x/a.pdf" },
      { source_id: "AEDS_website_exams_faq", url: "javascript:alert(1)", expired_since: "2026-03-31" },
    ]);
    expect(g).toEqual([
      { id: "MPO_AEDS_2026_EN", title: "Examination regulations (2026)", kind: "Regulations", url: "https://x/a.pdf", pages: [5, 8], expiredSince: null },
      { id: "AEDS_website_exams_faq", title: "Examinations FAQ", kind: "Programme website", url: null, pages: [], expiredSince: "2026-03-31" },
    ]);
    expect(groupSources(undefined)).toEqual([]);
  });

  it("maps [n] to the n-th retrieved passage of a real answer", () => {
    expect(citedNumbers(sample.answer)).toEqual([1]);
    const c = citation(1, sample.retrieval, sample.sources)!;
    expect(c.title).toBe("Examination regulations (2026)");
    expect(c.section).toMatch(/^Section 8 Resitting/);
    expect(c.url).toMatch(/^https:\/\/elearning\.uni-oldenburg\.de\//);
    expect(citation(99, sample.retrieval, sample.sources)).toBeNull();
    expect(citation(1, undefined, sample.sources)).toBeNull();
  });

  it("strips markers for copying but keeps Markdown links", () => {
    expect(stripCitations("Up to twice [1][2]. See [FAQ](https://x).")).toBe("Up to twice. See [FAQ](https://x).");
  });

  it("renders markers as chips, links as links, and nothing executable", () => {
    const html = formatAnswer("Twice [1]. See [2](https://a.b/c). <script>x</script> [1](javascript:alert(1))");
    expect(html).toContain('<button type="button" class="cite" data-cite="1" aria-label="Show source 1">1</button>');
    expect(html).toContain('<a href="https://a.b/c"');
    expect(html).not.toContain("<script>");
    expect(html).not.toContain('href="javascript');
  });
});
