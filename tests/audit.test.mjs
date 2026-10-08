import test from "node:test";
import assert from "node:assert/strict";
import {
  publicUrl,
  identity,
  analyze,
  reportMarkdown,
} from "../lib/audit-model.ts";
const base = () => ({
  id: "test",
  url: "https://example.com/page",
  query: "page facts",
  queryMode: "provided",
  checkedAt: "2026-10-03T00:00:00Z",
  durationMs: 100,
  stages: [],
  searches: [{ query: "page facts", kind: "target", results: [] }],
  page: {
    url: "https://example.com/page",
    title: "Page facts",
    text: "# Page\nThe public product includes unlimited useful reports for every customer.",
    description: "Product facts",
  },
  browser: null,
  competitor: null,
});
test("reject private addresses, credentials and non-web schemes", () => {
  for (const value of [
    "http://localhost/",
    "http://127.1",
    "http://2130706433",
    "http://[::1]/",
    "http://10.1.2.3",
    "http://192.168.1.2",
    "http://169.254.169.254/latest/meta-data",
    "http://100.64.1.2",
    "file:///etc/passwd",
    "https://user:pass@example.com",
    "https://example.com:3000",
  ])
    assert.throws(() => publicUrl(value), undefined, value);
  assert.equal(publicUrl("example.com/a#x"), "https://example.com/a");
});
test("URL identity ignores only tracking parameters and preserves meaningful query values", () => {
  assert.equal(
    identity("https://www.example.com/a/?utm_source=test"),
    identity("http://example.com/a"),
  );
  assert.notEqual(
    identity("https://example.com/a?product=1"),
    identity("https://example.com/a?product=2"),
  );
});
test("search failure is unknown and not misreported as missing visibility", () => {
  const b = base();
  b.searches[0].error = "rate limit";
  const a = analyze(b);
  assert.equal(a.metrics.rank, null);
  assert.ok(!a.findings.some((f) => f.title.includes("search sample")));
});
test("redirect destination matches result without matching unrelated same-host pages", () => {
  const b = base();
  b.page.final_url = "https://example.com/new-page";
  b.searches[0].results = [
    { url: "https://example.com/other", position: 1 },
    { url: "https://example.com/new-page", position: 3 },
  ];
  assert.equal(analyze(b).metrics.rank, 3);
});
test("quote normalization tolerates markup and punctuation but flags missing words", () => {
  const b = base();
  b.browser = {
    status: "readable",
    final_url: b.url,
    title: "Page",
    barriers: [],
    interactions: [],
    observations: [
      {
        label: "Included",
        quote:
          "THE public product includes unlimited useful reports for every customer!",
        interaction: "initial view",
        importance: "",
      },
      {
        label: "Missing",
        quote:
          "Annual billing includes priority support and a complimentary migration service.",
        interaction: "Opened billing tab",
        importance: "",
      },
    ],
  };
  const a = analyze(b);
  assert.equal(a.metrics.coverage, 50);
  assert.equal(a.comparisons[0].matched, true);
  assert.ok(
    a.findings.some(
      (f) => f.title.includes("Missing") && f.fix.includes("billing tab"),
    ),
  );
});
test("missing Fetch means quote coverage is unknown, not zero", () => {
  const b = base();
  b.page = null;
  b.fetchError = "timeout";
  assert.equal(analyze(b).metrics.coverage, null);
  assert.ok(analyze(b).findings.some((f) => f.evidence === "timeout"));
});
test("noindex is grounded in returned metadata only", () => {
  const b = base();
  b.page.page_metadata = { robots: "noindex, follow" };
  assert.ok(analyze(b).findings.some((f) => f.title.includes("noindex")));
  delete b.page.page_metadata;
  assert.ok(!analyze(b).findings.some((f) => f.title.includes("noindex")));
});
test("export includes evidence, source, fix, verification and limits", () => {
  const md = reportMarkdown(analyze(base()));
  for (const phrase of [
    "Evidence:",
    "Fix:",
    "Verify:",
    "Source:",
    "not a universal rank",
  ])
    assert.ok(md.includes(phrase));
});
