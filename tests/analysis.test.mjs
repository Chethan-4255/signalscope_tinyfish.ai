import test from "node:test";
import assert from "node:assert/strict";
import { parseHead, headFindings } from "../lib/head-audit.ts";
import { parseRobots, evaluateRobots, buildCrawlPolicy, crawlFindings } from "../lib/crawl-policy.ts";
import { findAnswerPassage, coverageOf } from "../lib/answerability.ts";
import { classifyHit, pickCompetitors, alternatePhrasing, intentMix } from "../lib/serp.ts";
import { encodeAudit, decodeAudit } from "../lib/share.ts";
import { compareAudits } from "../lib/compare.ts";
import { analyze } from "../lib/audit-model.ts";

const html = `<!doctype html><html lang="en"><head>
<title>Linear Pricing – Plans for every team</title>
<meta name="description" content="Use Linear for free with your whole team. Upgrade to enable unlimited issues, enhanced security controls, and additional features.">
<meta name="robots" content="index, follow, max-snippet:-1">
<link rel="canonical" href="https://example.com/pricing"/>
<link rel="alternate" hreflang="de" href="https://example.com/de/pricing">
<meta property="og:title" content="Pricing – Linear"><meta property="og:description" content="OG desc"><meta property="og:image" content="https://example.com/og.png">
<meta name="twitter:card" content="summary_large_image">
<script type="application/ld+json">{"@context":"https://schema.org","@graph":[{"@type":"Organization","name":"X"},{"@type":"FAQPage","mainEntity":[{"@type":"Question"}]}]}</script>
<script type="application/ld+json">{ not json </script>
<meta name="viewport" content="width=device-width">
</head><body><nav><h2>Menu</h2></nav><main><h1>Pricing</h1><p>Plans text</p><h3>Skipped level</h3><h2>Free</h2></main></body></html>`;

test("parseHead extracts title, metas, canonical, hreflang, OG, twitter, JSON-LD types and heading outline", () => {
  const h = parseHead(html);
  assert.equal(h.title, "Linear Pricing – Plans for every team");
  assert.ok(h.description.startsWith("Use Linear"));
  assert.equal(h.noindex, false);
  assert.equal(h.canonical, "https://example.com/pricing");
  assert.deepEqual(h.hreflang, [{ lang: "de", href: "https://example.com/de/pricing" }]);
  assert.equal(h.og.image, "https://example.com/og.png");
  assert.equal(h.twitter.card, "summary_large_image");
  assert.equal(h.jsonLd.blocks, 2);
  assert.equal(h.jsonLd.invalid, 1);
  assert.deepEqual(h.jsonLd.types.sort(), ["FAQPage", "Organization", "Question"]);
  assert.equal(h.lang, "en");
  assert.deepEqual(h.h1, ["Pricing"]);
  assert.equal(h.skippedLevels.length, 1);
  assert.equal(h.skippedLevels[0].to, 3);
});

test("headFindings produce concrete fixes with suggested copy and flag invalid JSON-LD", () => {
  const h = parseHead(html);
  const f = headFindings(h, { url: "https://example.com/pricing", finalUrl: "https://example.com/pricing", suggested: "Linear is free for your whole team; paid plans add unlimited issues.", pageTitle: h.title });
  const titles = f.map((x) => x.title);
  assert.ok(titles.some((t) => t.includes("JSON-LD block") && t.includes("failed to parse")));
  assert.ok(titles.some((t) => t.includes("Heading levels skipped")));
  assert.ok(!titles.some((t) => t.includes("Missing <title>")));
  const bare = headFindings(parseHead("<html><head></head><body><p>x</p></body></html>"), { url: "https://a.com/x", finalUrl: "https://a.com/x", suggested: "The answer is forty-two.", pageTitle: null });
  const desc = bare.find((x) => x.title === "Missing meta description");
  assert.ok(desc && desc.fix.includes('<meta name="description" content="The answer is forty-two."'));
  assert.ok(bare.some((x) => x.title === "Missing <title>"));
  assert.ok(bare.some((x) => x.title === "No JSON-LD structured data" && x.fix.includes("application/ld+json")));
  for (const x of bare) assert.ok(x.evidence && x.impact && x.fix && x.verify, x.title);
});

const robots = `# comment
User-agent: *
Disallow: /private/
Allow: /private/public-doc

User-agent: GPTBot
User-agent: ClaudeBot
Disallow: /

User-agent: PerplexityBot
Disallow: /pricing$

Sitemap: https://example.com/sitemap.xml
`;

test("robots.txt evaluation follows group matching, longest match, allow-wins and $ anchors", () => {
  const p = parseRobots(robots);
  assert.deepEqual(p.sitemaps, ["https://example.com/sitemap.xml"]);
  assert.equal(evaluateRobots(p, "Googlebot", "/pricing").allowed, true);
  assert.equal(evaluateRobots(p, "Googlebot", "/private/x").allowed, false);
  assert.equal(evaluateRobots(p, "Googlebot", "/private/public-doc").allowed, true);
  assert.equal(evaluateRobots(p, "GPTBot", "/pricing").allowed, false);
  assert.equal(evaluateRobots(p, "ClaudeBot", "/").allowed, false);
  assert.equal(evaluateRobots(p, "PerplexityBot", "/pricing").allowed, false);
  assert.equal(evaluateRobots(p, "PerplexityBot", "/pricing/team").allowed, true);
});

test("crawl policy findings name the blocked agents and the path, and detect sitemap membership", () => {
  const policy = buildCrawlPolicy(
    "https://example.com/pricing",
    {
      robots: { url: "https://example.com/robots.txt", text: robots },
      llms: { url: "https://example.com/llms.txt", title: "404 Not Found", text: "404 page not found" },
      sitemap: { url: "https://example.com/sitemap.xml", text: `<urlset><url><loc>https://example.com/</loc></url><url><loc>https://example.com/docs</loc></url></urlset>` },
    },
    { robots: undefined, llms: undefined, sitemap: undefined },
  );
  assert.equal(policy.robots.status, "present");
  assert.equal(policy.llms.status, "missing");
  assert.equal(policy.sitemap.urlCount, 2);
  assert.equal(policy.sitemap.listsPage, false);
  const blocked = policy.robots.rules.filter((r) => r.allowed === false).map((r) => r.agent).sort();
  assert.deepEqual(blocked, ["ClaudeBot", "GPTBot", "PerplexityBot"]);
  const f = crawlFindings(policy, "https://example.com/pricing");
  assert.ok(f.some((x) => x.title.includes("AI crawler") && x.title.includes("/pricing") && x.evidence.includes("ClaudeBot")));
  assert.ok(f.some((x) => x.title === "Sitemap exists but does not list this page"));
  assert.ok(f.some((x) => x.title === "No llms.txt"));
  const none = buildCrawlPolicy("https://e.com/", { robots: null, llms: null, sitemap: null }, { robots: "HTTP 404", llms: undefined, sitemap: undefined });
  assert.equal(none.robots.status, "missing");
  assert.ok(none.robots.rules.every((r) => r.allowed === true));
  assert.equal(none.llms.status, "unavailable");
});

test("answer passage picks the best-covering, earliest, concise window and reports position", () => {
  const text = `# Pricing\n\nWelcome to our product page. [Home](/) [Docs](/docs) [Blog](/blog)\n\nOur editor is fast. It has many features for teams of all sizes.\n\n## Plans\n\nLinear pricing starts free for small teams. Paid plans add unlimited issues and SSO. Contact sales for enterprise.\n\n` + "Filler sentence here. ".repeat(80);
  const a = findAnswerPassage(text, "linear pricing plans");
  assert.ok(a);
  assert.equal(a.coverage, 100);
  assert.ok(a.text.startsWith("Linear pricing starts free"));
  assert.ok(a.words <= 25);
  assert.ok(a.position < 50);
  assert.equal(a.underHeading, "Plans");
  assert.equal(findAnswerPassage(text, "quantum entanglement"), null);
  assert.equal(coverageOf(["price", "team"], "The prices for teams").coverage, 100, "prefix stemming");
});

test("SERP helpers classify intent, exclude social/forum/video competitors and build an alternate phrasing", () => {
  const hits = [
    { position: 1, url: "https://www.reddit.com/r/x/comments/1", title: "r", snippet: "" },
    { position: 2, url: "https://docs.vendor.com/guide", title: "d", snippet: "" },
    { position: 3, url: "https://www.youtube.com/watch?v=1", title: "v", snippet: "" },
    { position: 4, url: "https://competitor.io/pricing", title: "c", snippet: "" },
    { position: 5, url: "https://competitor.io/other", title: "c2", snippet: "" },
    { position: 6, url: "https://en.wikipedia.org/wiki/X", title: "w", snippet: "" },
    { position: 7, url: "https://blog.other.com/2024/05/post", title: "b", snippet: "" },
    { position: 8, url: "https://mine.com/pricing", title: "me", snippet: "" },
  ];
  assert.equal(classifyHit(hits[0]), "forum");
  assert.equal(classifyHit(hits[1]), "docs");
  assert.equal(classifyHit(hits[2]), "video");
  assert.equal(classifyHit(hits[3]), "product");
  assert.equal(classifyHit(hits[6]), "blog");
  const c = pickCompetitors(hits, "https://mine.com/pricing", 3);
  assert.deepEqual(c.map((h) => h.url), ["https://docs.vendor.com/guide", "https://competitor.io/pricing", "https://blog.other.com/2024/05/post"]);
  assert.equal(intentMix(hits)[0].count >= 1, true);
  assert.equal(alternatePhrasing("linear pricing", "Linear – Pricing").mode, "question");
  assert.equal(alternatePhrasing("install tinyfish sdk", "x").query, "how to install tinyfish sdk");
  assert.equal(alternatePhrasing("what is tinyfish", "TinyFish Quick Start | Docs").query, "TinyFish Quick Start");
  assert.equal(alternatePhrasing("what is tinyfish", "what is tinyfish").mode, "none");
});

const base = () => ({
  id: "t", url: "https://example.com/pricing", query: "linear pricing", queryMode: "provided", checkedAt: "2026-10-09T00:00:00Z", durationMs: 1, stages: [],
  searches: [
    { kind: "target", query: "linear pricing", results: [{ position: 2, url: "https://example.com/pricing", title: "Pricing", snippet: "Linear pricing for teams" }, { position: 1, url: "https://rival.com/pricing", title: "Rival", snippet: "" }] },
    { kind: "discovery", query: "site:example.com/pricing", results: [{ position: 1, url: "https://example.com/pricing", title: "Pricing", snippet: "" }] },
  ],
  page: { url: "https://example.com/pricing", title: "Linear Pricing – Plans for every team", description: "Use Linear for free.", text: "# Pricing\n\nLinear pricing starts free for small teams and paid plans add unlimited issues. ".repeat(3) + "\n\n## Details\n\n" + "More detail about the plans and billing options for every team size. ".repeat(20) },
  browser: null, competitor: null, competitors: [], headAudit: null, crawlPolicy: null,
});

test("analyze integrates raw HTML, scores the page, writes a 3-sentence summary and categorizes findings", () => {
  const a = analyze({ ...base(), rawHtml: html });
  assert.ok(a.headAudit && a.headAudit.title.startsWith("Linear"));
  assert.ok(a.score.total > 60 && a.score.total <= 100, String(a.score.total));
  assert.equal(a.metrics.rank, 2);
  assert.ok(a.serp.discoveryHit);
  assert.ok(a.answer && a.answer.coverage === 100);
  assert.ok(a.summary.includes("scores") && a.summary.split(/(?<=\.)\s/).length <= 4);
  for (const f of a.findings) assert.ok(f.category && f.evidence && f.impact && f.fix && f.verify, f.title);
  assert.ok(a.findings.some((f) => f.category === "Structured data"));
  assert.ok(!a.findings.some((f) => f.title.startsWith("Not in the top")));
});

test("share link round-trips a report through deflate-raw + base64url and compare reports deltas", async () => {
  const a = analyze({ ...base(), rawHtml: html });
  const { data } = await encodeAudit(a);
  assert.ok(/^[A-Za-z0-9_-]+$/.test(data));
  const back = await decodeAudit(data);
  assert.equal(back.url, a.url);
  assert.equal(back.score.total, a.score.total);
  assert.equal(back.findings.length, a.findings.length);
  await assert.rejects(decodeAudit("AAAA"));
  const big = analyze({ ...base(), page: { ...base().page, text: "word ".repeat(120000) }, rawHtml: html });
  const enc = await encodeAudit(big);
  assert.ok(enc.data.length < 140000);
  const fixed = analyze({ ...base(), rawHtml: html.replace("{ not json ", '{"@type":"Product"}') });
  const d = compareAudits(a, fixed);
  assert.ok(d.resolved.some((t) => t.includes("failed to parse")));
  assert.ok(d.score.after >= d.score.before);
});
