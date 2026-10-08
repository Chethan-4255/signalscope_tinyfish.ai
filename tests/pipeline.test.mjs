import test from "node:test";
import assert from "node:assert/strict";
import { runAudit } from "../lib/tinyfish-audit.ts";
import { markdownHeadings, analyze } from "../lib/audit-model.ts";

test("live pipeline publishes partial evidence, enforces schema, unwraps provider results and preserves competitor failure", async () => {
  const original = globalThis.fetch,
    events = [],
    requests = [];
  const browser = {
    status: "readable",
    title: "Example",
    final_url: "https://example.com/",
    observations: [
      {
        label: "Fact",
        source_url: "https://example.com/",
        quote: "The product exports complete reports in CSV and JSON.",
        interaction: "Initial view",
        importance: "Useful formats",
      },
      { label: "Different page", source_url: "https://example.com/faq", quote: "An unrelated FAQ says infrastructure success is not goal success.", interaction: "Visited FAQ", importance: "High" },
      { label: "Missing attribution", quote: "The browser did not identify which document contained this fact.", interaction: "Read", importance: "High" },
    ],
    interactions: ["Read page"],
    barriers: [],
    strategy: "Readable product details.",
    recommendations: [],
  };
  globalThis.fetch = async (input, init) => {
    const url = String(input);
    requests.push({ url, body: init?.body });
    if (url.includes("api.search"))
      return Response.json({
        results: [
          {
            url: "https://example.com/",
            title: "Example",
            position: 1,
            snippet: "Example product",
          },
          {
            url: "https://competitor.com/",
            title: "Other",
            position: 2,
            snippet: "Other product",
          },
        ],
      });
    if (url.includes("api.fetch")) {
      const body = JSON.parse(init.body);
      assert.equal(body.ttl, 0);
      return body.urls[0].includes("competitor")
        ? Response.json({ results: [], errors: [{ error: "bot_blocked" }] })
        : Response.json({
            results: [
              {
                url: "https://example.com/",
                title: "Example",
                description: "Example product",
                text: "# Product\nThe product exports complete reports in CSV and JSON.",
              },
            ],
          });
    }
    if (url.includes("run-sse")) {
      const body = JSON.parse(init.body);
      assert.ok(body.output_schema.required.includes("recommendations"));
      assert.ok(events.some((e) => e.type === "partial"));
      return new Response(
        "data: " +
          JSON.stringify({ type: "STARTED", run_id: "test" }) +
          "\n\ndata: " +
          JSON.stringify({
            type: "COMPLETE",
            status: "COMPLETED",
            result: { result: JSON.stringify(browser) },
          }) +
          "\n\n",
      );
    }
    throw new Error("Unexpected endpoint");
  };
  try {
    const r = await runAudit(
      { url: "https://example.com", query: "product reports" },
      "fake-test-key",
      (e) => events.push(e),
      new AbortController().signal,
    );
    assert.equal(r.status, "complete");
    assert.equal(r.metrics.rank, 1);
    assert.equal(r.browser.status, "readable");
    assert.equal(r.competitor, null);
    assert.match(r.competitorError, /bot_blocked/);
    assert.equal(r.fetchError, undefined);
    assert.ok(
      r.stages.some((s) => s.endpoint === "Agent" && s.status === "complete"),
    );
    assert.equal(r.metrics.coverage, 100);
    assert.equal(r.metrics.sampled, 1);
    assert.equal(r.browser.rejectedObservations, 2);
    assert.ok(!r.findings.some(f => /Different page|Missing attribution/.test(f.title)));
    assert.ok(!JSON.stringify(r).includes("fake-test-key"));
    assert.equal(requests.filter((r) => r.url.includes("run-sse")).length, 1);
  } finally {
    globalThis.fetch = original;
  }
});
test("code examples are not miscounted as page headings", () =>
  assert.deepEqual(
    markdownHeadings("# Real\n```md\n# Example code\n```\n## Also real"),
    ["Real", "Also real"],
  ));
test("browser quotes present in Fetch metadata are not extraction gaps", () => {
  const a = analyze({
    id: "x",
    url: "https://example.com",
    query: "example",
    queryMode: "provided",
    checkedAt: "2026-10-03",
    durationMs: 1,
    stages: [],
    searches: [],
    page: {
      url: "https://example.com",
      description: "Launch your first project in five minutes",
      text: "Some body content",
    },
    browser: {
      status: "readable",
      final_url: "https://example.com",
      title: "Example",
      observations: [
        {
          label: "Time",
          quote: "Launch your first project in five minutes",
          interaction: "Initial view",
          importance: "high",
        },
      ],
      barriers: [],
      interactions: [],
    },
    competitor: null,
  });
  assert.equal(a.metrics.coverage, 100);
  assert.ok(!a.findings.some((f) => f.title.includes("Time")));
});
