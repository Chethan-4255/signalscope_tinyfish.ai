import test from "node:test";
import assert from "node:assert/strict";
import { computeScore, grade } from "../lib/score.ts";

const full = () => ({
  search: { targetChecked: true, rank: 1, resultCount: 10, discoveryChecked: true, foundInDiscovery: true, snippet: "A long, substantive snippet about the topic that mentions the query terms plainly.", snippetHasQueryTerm: true, altChecked: true, altRank: 2 },
  extraction: { fetched: true, words: 900, headings: 6, proseRatio: 0.8, blocked: false, htmlWords: 1000 },
  metadata: { available: true, titleLength: 45, descriptionLength: 120, canonicalOk: true, noindex: false, ogComplete: true, twitterCard: true, jsonLdTypes: 2, lang: true, h1Count: 1, skippedLevels: 0 },
  answer: { available: true, coverage: 100, position: 5, words: 40, titleCoverage: 100 },
});

test("a perfect page scores 100 with every group at its max", () => {
  const s = computeScore(full());
  assert.equal(s.total, 100);
  assert.equal(s.confidence, 100);
  assert.equal(s.grade, "A");
  for (const g of s.groups) assert.equal(g.score, g.max, g.id);
  assert.deepEqual(s.groups.map((g) => g.max), [30, 30, 20, 20]);
});

test("unknown facts are excluded from the denominator, not zeroed", () => {
  const i = full();
  i.metadata = { ...i.metadata, available: false };
  const s = computeScore(i);
  const meta = s.groups.find((g) => g.id === "metadata");
  assert.equal(meta.score, null);
  assert.ok(meta.items.every((x) => x.points === null));
  assert.equal(s.total, 100, "excluding an unknown group must not lower a perfect score");
  assert.equal(s.confidence, 80);
});

test("a blocked, unindexed page scores near zero", () => {
  const s = computeScore({
    search: { targetChecked: true, rank: null, resultCount: 10, discoveryChecked: true, foundInDiscovery: false, snippet: null, snippetHasQueryTerm: null, altChecked: true, altRank: null },
    extraction: { fetched: true, words: 12, headings: 0, proseRatio: 0, blocked: true, htmlWords: null },
    metadata: { available: true, titleLength: null, descriptionLength: null, canonicalOk: false, noindex: true, ogComplete: false, twitterCard: false, jsonLdTypes: 0, lang: false, h1Count: 0, skippedLevels: 2 },
    answer: { available: true, coverage: null, position: null, words: null, titleCoverage: 0 },
  });
  assert.equal(s.total, 0);
  assert.equal(s.grade, "F");
});

test("every item carries an evidence line and partial credit bands are monotonic", () => {
  const s = computeScore(full());
  for (const g of s.groups) for (const it of g.items) assert.ok(it.evidence.length > 3, it.id);
  const at = (rank) => computeScore({ ...full(), search: { ...full().search, rank } }).groups[0].items[0].points;
  assert.ok(at(1) > at(5) && at(5) > at(15) && at(15) > 0);
  const words = (w) => computeScore({ ...full(), extraction: { ...full().extraction, words: w } }).groups[1].items[0].points;
  assert.ok(words(500) > words(200) && words(200) > words(50) && words(50) > words(10));
});

test("grades map to bands", () => {
  assert.equal(grade(null), "?");
  assert.equal(grade(85), "A");
  assert.equal(grade(70), "B");
  assert.equal(grade(55), "C");
  assert.equal(grade(40), "D");
  assert.equal(grade(39), "F");
});
