import { type Audit } from "./audit-model.ts";
export type AuditCheck = {
  name: string;
  group: string;
  status: "observed" | "review" | "unknown";
  detail: string;
};
export function evidenceChecks(a: Audit): AuditCheck[] {
  const target = a.searches.find((s) => s.kind === "target"),
    discovery = a.searches.find((s) => s.kind === "discovery"),
    alternate = a.searches.find((s) => s.kind === "alternate");
  const h = a.headAudit;
  const headField = (name: string, value: string | null | undefined, okWhen?: (v: string) => boolean, hint?: string): AuditCheck => ({
    name,
    group: "Metadata (raw HTML)",
    status: !h ? "unknown" : value && (!okWhen || okWhen(value)) ? "observed" : "review",
    detail: !h ? a.headError || "Raw HTML unavailable." : value ? `${value.length > 120 ? value.slice(0, 117) + "…" : value}${okWhen && !okWhen(value) && hint ? ` — ${hint}` : ""}` : "Absent from <head>.",
  });
  const blocked = a.crawlPolicy?.robots.rules.filter((r) => r.allowed === false) || [];
  return [
    {
      name: "Public text extraction",
      group: "Readability",
      status: a.page ? (a.metrics.blocked ? "review" : "observed") : "unknown",
      detail: a.page ? `${a.metrics.words.toLocaleString()} words extracted${a.metrics.blocked ? "; looks like a block page or shell" : ""}.` : a.fetchError || "No document returned.",
    },
    {
      name: "Headings in extraction",
      group: "Readability",
      status: !a.page ? "unknown" : a.metrics.headings.length ? "observed" : "review",
      detail: a.page ? `${a.metrics.headings.length} Markdown headings detected outside code blocks.` : "No extraction available.",
    },
    {
      name: "Prose vs navigation",
      group: "Readability",
      status: a.metrics.proseRatio === null ? "unknown" : a.metrics.proseRatio >= 0.5 ? "observed" : "review",
      detail: a.metrics.proseRatio === null ? "Not measurable." : `${Math.round(a.metrics.proseRatio * 100)}% of extracted words are in paragraphs.`,
    },
    {
      name: "Answer passage for the query",
      group: "Readability",
      status: !a.page ? "unknown" : a.answer && a.answer.coverage >= 50 ? "observed" : "review",
      detail: a.answer ? `Best passage covers ${a.answer.coverage}% of query terms, ${a.answer.position}% into the page.` : "No passage covers the query terms.",
    },
    headField("Title", h?.title, (v) => v.length >= 30 && v.length <= 60, "outside 30-60 chars"),
    headField("Meta description", h?.description, (v) => v.length >= 70 && v.length <= 160, "outside 70-160 chars"),
    headField("Canonical", h?.canonical),
    {
      name: "Indexable (no noindex)",
      group: "Metadata (raw HTML)",
      status: !h ? "unknown" : h.noindex ? "review" : "observed",
      detail: !h ? "Raw HTML unavailable." : h.robots ? `robots: ${h.robots}` : "No robots meta tag (indexable by default).",
    },
    {
      name: "Open Graph + Twitter card",
      group: "Metadata (raw HTML)",
      status: !h ? "unknown" : h.og.title && h.og.description && h.og.image && h.twitter.card ? "observed" : "review",
      detail: !h ? "Raw HTML unavailable." : `og: ${["title", "description", "image"].filter((k) => h.og[k as keyof typeof h.og]).join(", ") || "none"}; twitter:card ${h.twitter.card || "absent"}.`,
    },
    {
      name: "JSON-LD structured data",
      group: "Metadata (raw HTML)",
      status: !h ? "unknown" : h.jsonLd.types.length ? "observed" : "review",
      detail: !h ? "Raw HTML unavailable." : h.jsonLd.blocks ? `${h.jsonLd.blocks} block(s); types: ${h.jsonLd.types.join(", ") || "none parsed"}${h.jsonLd.invalid ? `; ${h.jsonLd.invalid} invalid` : ""}.` : "No ld+json blocks.",
    },
    {
      name: "Heading outline",
      group: "Metadata (raw HTML)",
      status: !h ? "unknown" : h.h1.length === 1 && !h.skippedLevels.length ? "observed" : "review",
      detail: !h ? "Raw HTML unavailable." : `${h.h1.length} h1, ${h.headings.length} headings, ${h.skippedLevels.length} level skips.`,
    },
    {
      name: "Target-query visibility",
      group: "Search",
      status: !target || target.error ? "unknown" : a.metrics.rank ? "observed" : "review",
      detail: !target || target.error ? target?.error || "Query not checked." : a.metrics.rank ? `Exact page at #${a.metrics.rank} of ${target.results.length}.` : `Exact page absent from ${target.results.length} sampled results.`,
    },
    {
      name: "Alternate phrasing visibility",
      group: "Search",
      status: !alternate || alternate.error ? "unknown" : a.serp.alternate?.rank ? "observed" : "review",
      detail: !alternate ? "Not searched." : alternate.error ? alternate.error : a.serp.alternate?.rank ? `#${a.serp.alternate.rank} for “${alternate.query}”.` : `Absent for “${alternate.query}”.`,
    },
    {
      name: "URL-specific discovery (site:)",
      group: "Search",
      status: !discovery || discovery.error ? "unknown" : a.serp.discoveryHit ? "observed" : "review",
      detail: !discovery || discovery.error ? discovery?.error || "Discovery not checked." : a.serp.discoveryHit ? "The exact URL appeared for its own site: query." : "No exact URL match in the site: query sample.",
    },
    {
      name: "Competing pages extracted",
      group: "Search",
      status: a.competitors.some((c) => c.words > 0) ? "observed" : "unknown",
      detail: a.competitors.length ? `${a.competitors.filter((c) => c.words > 0).length}/${a.competitors.length} competing results read: ${a.competitors.map((c) => c.host).join(", ")}.` : a.competitorError || "No competing organic result on another host.",
    },
    {
      name: "AI crawlers allowed (robots.txt)",
      group: "Crawl policy",
      status: !a.crawlPolicy || a.crawlPolicy.robots.status === "unavailable" ? "unknown" : blocked.length ? "review" : "observed",
      detail: !a.crawlPolicy ? a.crawlError || "Not probed." : a.crawlPolicy.robots.status === "unavailable" ? "robots.txt could not be fetched." : blocked.length ? `Disallowed: ${blocked.map((r) => r.agent).join(", ")}.` : `All ${a.crawlPolicy.robots.rules.length} checked agents allowed for this path${a.crawlPolicy.robots.status === "missing" ? " (no robots.txt)" : ""}.`,
    },
    {
      name: "Sitemap lists this page",
      group: "Crawl policy",
      status: !a.crawlPolicy || a.crawlPolicy.sitemap.status === "unavailable" ? "unknown" : a.crawlPolicy.sitemap.listsPage ? "observed" : a.crawlPolicy.sitemap.status === "index" ? "unknown" : "review",
      detail: !a.crawlPolicy ? "Not probed." : `${a.crawlPolicy.sitemap.status}${a.crawlPolicy.sitemap.urlCount ? `, ${a.crawlPolicy.sitemap.urlCount} URLs` : ""}${a.crawlPolicy.sitemap.listsPage ? ", includes this page" : a.crawlPolicy.sitemap.status === "present" ? ", page not listed" : ""}.`,
    },
    {
      name: "llms.txt",
      group: "Crawl policy",
      status: !a.crawlPolicy || a.crawlPolicy.llms.status === "unavailable" ? "unknown" : a.crawlPolicy.llms.status === "present" ? "observed" : "review",
      detail: !a.crawlPolicy ? "Not probed." : a.crawlPolicy.llms.status === "present" ? `Present (${a.crawlPolicy.llms.bytes} bytes)${a.crawlPolicy.llms.mentionsPage ? ", mentions this path" : ""}.` : "Not published (optional).",
    },
    {
      name: "Browser access",
      group: "Browser",
      status: !a.browser ? "unknown" : a.browser.status === "readable" ? "observed" : "review",
      detail: a.browser ? `Agent reports ${a.browser.status}. ${a.browser.barriers.join(" ")}` : "Browser verification not run.",
    },
    {
      name: "Browser fact samples",
      group: "Browser",
      status: a.metrics.sampled ? "observed" : "unknown",
      detail: `${a.metrics.sampled} sampled facts; ${a.metrics.matched} verbatim matches in the extraction.`,
    },
    {
      name: "AI recommendation provenance",
      group: "Browser",
      status: a.browser?.recommendations?.length ? "observed" : "unknown",
      detail: a.browser?.recommendations?.length ? `${a.browser.recommendations.length} proposals have a source-matched excerpt or a labelled browser observation.` : "No AI proposals with validated provenance.",
    },
  ];
}
