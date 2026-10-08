import test from "node:test";
import assert from "node:assert/strict";
import { validateRecommendations, fixPrompt } from "../lib/recommendations.ts";
import { analyze } from "../lib/audit-model.ts";
const page = {
  url: "https://example.com",
  title: "Example",
  text: "Our product supports export to CSV and JSON for all customers.",
};
const browser = {
  status: "readable",
  final_url: page.url,
  title: "Example",
  observations: [],
  barriers: [],
  interactions: [],
};
const proposal = {
  title: "Explain exports in the FAQ",
  category: "Content",
  priority: "medium",
  effort: "small",
  owner: "editor",
  evidence: {
    source: "page",
    quote: "Our product supports export to CSV and JSON for all customers.",
  },
  why: "Answer the query more directly.",
  action: "Add a short answer after the introductory paragraph.",
  suggestedCopy:
    "Can I export reports? Reports can be exported to CSV and JSON.",
  verification: "Check that the answer is in the live extraction.",
  assumptions: [],
};
test("accept only recommendations with source-matched evidence", () => {
  const r = validateRecommendations([proposal], page, null, browser);
  assert.equal(r.recommendations.length, 1);
  assert.equal(r.recommendations[0].evidence.validation, "fetch-matched");
  assert.equal(r.recommendations[0].evidence.url, page.url);
});
test("reject invented citations and unavailable competitor evidence", () => {
  const r = validateRecommendations(
    [
      {
        ...proposal,
        evidence: {
          source: "page",
          quote: "The product has a million enterprise customers.",
        },
      },
      { ...proposal, evidence: { source: "competitor", quote: page.text } },
    ],
    page,
    null,
    browser,
  );
  assert.equal(r.recommendations.length, 0);
  assert.equal(r.rejected, 2);
});
test("invalid model fields cannot masquerade as prioritized recommendations", () => {
  assert.equal(
    validateRecommendations(
      [{ ...proposal, effort: "guaranteed #1" }],
      page,
      null,
      browser,
    ).rejected,
    1,
  );
});
test("browser-only evidence is explicitly not Fetch-verified", () => {
  const b = { ...browser, observations: [{ quote: page.text }] };
  const r = validateRecommendations(
    [{ ...proposal, evidence: { source: "browser", quote: page.text } }],
    null,
    null,
    b,
  );
  assert.equal(r.recommendations[0].evidence.validation, "agent-reported");
});
test("single-item prompt excludes all other tasks and includes safeguards and acceptance checks", () => {
  const a = analyze({
    id: "test",
    url: page.url,
    query: "export reports",
    queryMode: "provided",
    checkedAt: "2026-10-03T00:00:00Z",
    durationMs: 100,
    stages: [],
    searches: [],
    page,
    browser,
    competitor: null,
  });
  const r = validateRecommendations([proposal], page, null, browser)
    .recommendations[0];
  const prompt = fixPrompt(a, { recommendations: [r], findings: [] });
  assert.ok(prompt.includes("Explain exports"));
  assert.ok(prompt.includes("untrusted evidence"));
  assert.ok(prompt.includes("Do not deploy"));
  assert.ok(prompt.includes("ACCEPTANCE CHECKS"));
  assert.ok(prompt.includes('"findings": []'));
});
