import { normalized, terms, markdownHeadings, wordCount, truncate } from "./text.ts";
import { findAnswerPassage, coverageOf, proseBlocks, type AnswerPassage } from "./answerability.ts";
import { parseHead, headFindings, type HeadAudit } from "./head-audit.ts";
import { crawlFindings, type CrawlPolicy } from "./crawl-policy.ts";
import { classifyHit, intentMix, hostOf, type IntentKind } from "./serp.ts";
import { computeScore, verdict, type Score } from "./score.ts";

export { normalized, terms, markdownHeadings };
export type { AnswerPassage, HeadAudit, CrawlPolicy, Score };

export type Hit = {
  position: number;
  title: string;
  url: string;
  snippet: string;
  site_name?: string;
};
export type Page = {
  url: string;
  final_url?: string;
  title?: string | null;
  description?: string | null;
  language?: string | null;
  text: string;
  author?: string | null;
  published_date?: string | null;
  links?: string[];
  latency_ms?: number;
  page_metadata?: {
    canonical?: string;
    robots?: string;
    og?: Record<string, unknown>;
    twitter?: Record<string, unknown>;
    other?: Record<string, unknown>;
  };
};
export type Observation = {
  source_url?: string;
  label: string;
  quote: string;
  interaction: string;
  importance: string;
};
export type Recommendation = {
  id: string;
  title: string;
  category: "Content" | "AI readability" | "Search intent" | "Metadata";
  priority: "high" | "medium" | "low";
  effort: "small" | "medium" | "large";
  owner: "editor" | "developer";
  evidence: {
    source: "page" | "competitor" | "browser";
    quote: string;
    url: string;
    validation: "fetch-matched" | "agent-reported";
  };
  why: string;
  action: string;
  suggestedCopy: string;
  verification: string;
  assumptions: string[];
};
export type BrowserEvidence = {
  status: "readable" | "blocked" | "login_required" | "unavailable";
  final_url: string;
  title: string;
  observations: Observation[];
  barriers: string[];
  interactions: string[];
  recommendations?: Recommendation[];
  strategy?: string;
  rejectedRecommendations?: number;
  rejectedObservations?: number;
  /** Agent PROGRESS purposes, in order. */
  steps?: string[];
};
export type Stage = {
  endpoint: "Search" | "Fetch" | "Agent";
  purpose: string;
  status: "complete" | "failed";
  durationMs: number;
  error?: string;
  calls: number;
};
export type FindingCategory =
  | "Extraction"
  | "Search visibility"
  | "Answer-ability"
  | "Metadata"
  | "Indexing"
  | "Structured data"
  | "Structure"
  | "Crawl policy"
  | "Browser";
export type Finding = {
  id: string;
  priority: "high" | "medium" | "low";
  category: FindingCategory;
  title: string;
  evidence: string;
  impact: string;
  fix: string;
  verify: string;
  source: string;
  confidence: "observed" | "investigate";
};
export type SearchEvidence = {
  query: string;
  kind: "target" | "discovery" | "alternate";
  results: Hit[];
  error?: string;
};
export type Competitor = {
  url: string;
  host: string;
  title: string;
  description: string | null;
  position: number;
  kind: IntentKind;
  words: number;
  headings: number;
  hasOg: boolean | null;
  answerCoverage: number | null;
  answerPassage: string | null;
  text?: string;
};
export type Audit = {
  id: string;
  status?: "partial" | "complete";
  shared?: boolean;
  url: string;
  query: string;
  queryMode: "provided" | "derived";
  checkedAt: string;
  durationMs: number;
  stages: Stage[];
  searches: SearchEvidence[];
  page: Page | null;
  fetchError?: string;
  headAudit: HeadAudit | null;
  headError?: string;
  crawlPolicy: CrawlPolicy | null;
  crawlError?: string;
  browser: BrowserEvidence | null;
  competitor: Page | null;
  competitors: Competitor[];
  competitorError?: string;
  /* computed */
  findings: Finding[];
  answer: AnswerPassage | null;
  score: Score;
  summary: string;
  serp: {
    intent: ReturnType<typeof intentMix>;
    alternate: { query: string; rank: number | null } | null;
    targetHit: Hit | null;
    discoveryHit: Hit | null;
  };
  metrics: {
    words: number;
    headings: string[];
    proseRatio: number | null;
    rank: number | null;
    sampled: number;
    matched: number;
    coverage: number | null;
    queryTerms: string[];
    missingTerms: string[];
    blocked: boolean;
  };
  comparisons: (Observation & { matched: boolean; overlap: number })[];
  limitations: string[];
};

export function publicUrl(input: string): string {
  const u = new URL(input.includes("://") ? input : `https://${input}`);
  const h = u.hostname.toLowerCase().replace(/\.$/, "");
  if (
    !["https:", "http:"].includes(u.protocol) ||
    u.username ||
    u.password ||
    (u.port && !["80", "443"].includes(u.port)) ||
    !h.includes(".") ||
    h.includes(":") ||
    /^(localhost|.*\.(localhost|local|internal|test|invalid))$/.test(h) ||
    /^(0|10|127|169\.254|172\.(1[6-9]|2\d|3[01])|192\.168|192\.0|100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])|198\.(1[89])|22[4-9]|23\d|24\d|25[0-5])\./.test(
      h,
    )
  )
    throw new Error(
      "Enter a public HTTP or HTTPS URL without credentials or a custom port.",
    );
  u.hash = "";
  return u.href;
}
export function identity(input: string): string {
  try {
    const u = new URL(input);
    return (
      u.hostname.toLowerCase().replace(/^www\./, "") +
      u.pathname.replace(/\/$/, "") +
      [...u.searchParams]
        .filter(([k]) => !/^utm_|^(gclid|fbclid)$/.test(k))
        .sort()
        .map(([k, v]) => `${k}=${v}`)
        .join("&")
    );
  } catch {
    return input;
  }
}

const BLOCK_RE =
  /(enable javascript|javascript is required|access denied|verify you are human|just a moment|checking your browser|attention required|sign in to continue|log in to (view|continue)|please log in|403 forbidden|captcha)/i;
export function looksBlocked(page: Page | null, fetchError?: string): boolean {
  if (!page) return /\b(403|401|429|bot|blocked|forbidden|captcha)\b/i.test(fetchError || "");
  const head = page.text.slice(0, 800);
  return wordCount(page.text) < 150 && BLOCK_RE.test(head + " " + (page.title || ""));
}
export function proseRatio(text: string): number | null {
  const total = wordCount(text);
  if (!total) return null;
  const prose = proseBlocks(text).reduce((n, b) => n + b.text.split(/\s+/).length, 0);
  return Math.min(1, prose / total);
}
export function buildCompetitor(hit: Hit, page: Page | null, query: string): Competitor {
  const text = page?.text || "";
  const passage = page ? findAnswerPassage(text, query) : null;
  return {
    url: hit.url,
    host: hostOf(hit.url),
    title: page?.title || hit.title,
    description: page?.description || null,
    position: hit.position,
    kind: classifyHit(hit),
    words: wordCount(text),
    headings: markdownHeadings(text).length,
    hasOg: page ? !!(page.page_metadata?.og && Object.keys(page.page_metadata.og).length) : null,
    answerCoverage: passage?.coverage ?? (page ? 0 : null),
    answerPassage: passage ? truncate(passage.text, 300) : null,
    text: page ? text.slice(0, 20000) : undefined,
  };
}

export type AnalyzeInput = Omit<
  Audit,
  "findings" | "metrics" | "comparisons" | "limitations" | "answer" | "score" | "summary" | "serp"
> & { rawHtml?: string | null };

export function analyze(input: AnalyzeInput): Audit {
  const { rawHtml, ...raw } = input;
  const a: Omit<AnalyzeInput, "rawHtml"> = {
    ...raw,
    headAudit: raw.headAudit ?? null,
    crawlPolicy: raw.crawlPolicy ?? null,
    competitors: raw.competitors ?? [],
    competitor: raw.competitor ?? null,
  };
  const page = a.page,
    text = page?.text || "",
    norm = normalized([page?.title, page?.description, text].filter(Boolean).join("\n")),
    tokens = new Set(norm.split(" "));
  const qTerms = terms(a.query),
    missing = qTerms.filter((t) => !tokens.has(t));
  const headings = markdownHeadings(text);
  const target = a.searches.find((s) => s.kind === "target"),
    discovery = a.searches.find((s) => s.kind === "discovery"),
    alternate = a.searches.find((s) => s.kind === "alternate");
  const identities = [a.url, page?.final_url].filter(Boolean).map((u) => identity(u!));
  const findHit = (s?: SearchEvidence) => s?.results.find((h) => identities.includes(identity(h.url))) || null;
  const hit = findHit(target), discoveryHit = findHit(discovery), altHit = findHit(alternate);
  const headAudit = a.headAudit ?? (rawHtml ? parseHead(rawHtml) : null);
  const answer = page ? findAnswerPassage(text, a.query) : null;
  const blocked = looksBlocked(page, a.fetchError) || (!!a.browser && a.browser.status !== "readable");
  const ratio = page ? proseRatio(text) : null;
  const titleCov = page || headAudit
    ? coverageOf(qTerms, [page?.title, headAudit?.title, ...(headAudit?.h1 || [])].filter(Boolean).join(" ")).coverage
    : null;

  const comparisons = (a.browser?.status === "readable" ? a.browser.observations : [])
    .filter((o) => o.quote.trim().length >= 12)
    .map((o) => {
      const ns = normalized(o.quote), ts = ns.split(" ");
      const overlap = ts.filter((t) => tokens.has(t)).length / Math.max(1, ts.length);
      return { ...o, matched: norm.includes(ns), overlap: Math.round(overlap * 100) };
    });

  const score = computeScore({
    search: {
      targetChecked: !!target && !target.error,
      rank: hit?.position ?? null,
      resultCount: target?.results.length || 0,
      discoveryChecked: !!discovery && !discovery.error,
      foundInDiscovery: !!discoveryHit,
      snippet: hit ? hit.snippet || "" : null,
      snippetHasQueryTerm: hit ? coverageOf(qTerms, (hit.snippet || "") + " " + (hit.title || "")).coverage > 0 : null,
      altChecked: !!alternate && !alternate.error && alternate.results.length > 0,
      altRank: altHit?.position ?? null,
    },
    extraction: {
      fetched: !!page,
      words: wordCount(text),
      headings: headings.length,
      proseRatio: ratio,
      blocked: page || a.browser ? blocked : null,
      htmlWords: headAudit?.bodyTextWords ?? null,
    },
    metadata: {
      available: !!headAudit,
      titleLength: headAudit?.title ? headAudit.title.length : null,
      descriptionLength: headAudit?.description ? headAudit.description.length : null,
      canonicalOk: headAudit ? !!headAudit.canonical && [a.url, page?.final_url || a.url].some((u) => identity(u) === identity(headAudit.canonical!)) : null,
      noindex: headAudit?.noindex ?? null,
      ogComplete: headAudit ? !!(headAudit.og.title && headAudit.og.description && headAudit.og.image) : null,
      twitterCard: headAudit ? !!headAudit.twitter.card : null,
      jsonLdTypes: headAudit ? (headAudit.jsonLd.blocks && !headAudit.jsonLd.types.length && headAudit.jsonLd.invalid ? -1 : headAudit.jsonLd.types.length) : null,
      lang: headAudit ? !!headAudit.lang : null,
      h1Count: headAudit ? (headAudit.headings.length ? headAudit.h1.length : null) : null,
      skippedLevels: headAudit ? headAudit.skippedLevels.length : null,
    },
    answer: {
      available: !!page && qTerms.length > 0,
      coverage: answer?.coverage ?? null,
      position: answer?.position ?? null,
      words: answer?.words ?? null,
      titleCoverage: titleCov,
    },
  });

  /* ---------- findings ---------- */
  const findings: Finding[] = [];
  const add = (f: Omit<Finding, "id">) =>
    findings.push({ ...f, id: `F${String(findings.length + 1).padStart(2, "0")}` });
  const src = page?.final_url || a.url;
  const topCompetitor = a.competitors[0];

  if (!page)
    add({
      priority: "high", category: "Extraction",
      title: "AI extraction returned nothing for this page",
      evidence: a.fetchError || "Fetch returned no matching document.",
      impact: "An AI tool using a fetch pipeline cannot read this page, so it cannot quote or cite it. Search crawlers that render similarly will index little or nothing.",
      fix: `Open ${a.url} in a signed-out browser and check the reported failure: ${blocked ? "it looks like a bot block or access wall — allow legitimate crawlers (see Crawl policy) or serve the essential content without a session." : "fix redirects, server errors or client-only rendering so the main content is in the initial HTML response."}`,
      verify: "Re-run SignalScope. Fetch must return the page with its main content.",
      source: a.url, confidence: "observed",
    });
  if (page && blocked)
    add({
      priority: "high", category: "Extraction",
      title: "Extracted text looks like a block page or empty shell",
      evidence: `Only ${wordCount(text)} words reached the extractor. Start of text: “${truncate(text.replace(/\s+/g, " ").trim(), 160)}”`,
      impact: "AI tools and crawlers see the interstitial, not your content, so the page cannot be cited for any query.",
      fix: "Allow server-side rendering or static HTML for the main content; whitelist well-behaved crawlers in your bot protection (Cloudflare → Security → Bots → allow verified bots); never require JavaScript or a session to read public pages.",
      verify: "Re-run SignalScope; extracted words should match the visible article length.",
      source: src, confidence: "observed",
    });
  else if (page && wordCount(text) < 80)
    add({
      priority: "medium", category: "Extraction",
      title: `Only ${wordCount(text)} words reached the extractor`,
      evidence: `Fetch returned ${wordCount(text)} words from ${src}${headAudit ? `; the raw HTML body contains ≈${headAudit.bodyTextWords} words of text` : ""}.`,
      impact: "There is almost nothing for a retrieval system to quote. AI answers will cite a page that says more.",
      fix: headAudit && headAudit.bodyTextWords < 80
        ? "The content is not in the HTML at all (client-rendered). Render the main content on the server or pre-render it so it appears in the initial HTML."
        : "Add a direct, factual paragraph under the H1 that states what this page is and answers the target query; keep key facts in visible text, not images or tabs.",
      verify: "Re-run; extracted words should exceed 300 for a content page.",
      source: src, confidence: "observed",
    });
  if (page && ratio !== null && ratio < 0.4 && wordCount(text) > 150)
    add({
      priority: "medium", category: "Extraction",
      title: `Navigation outweighs content: only ${Math.round(ratio * 100)}% of extracted words are prose`,
      evidence: `${wordCount(text)} extracted words, of which ≈${Math.round(ratio * wordCount(text))} are in paragraphs; the rest are link lists, menus and footer lines.`,
      impact: "Retrieval systems chunk the page; when most chunks are menus, the few content chunks rank lower and the page is less likely to be quoted.",
      fix: "Wrap the article in <main>/<article>, move repeated menus into <nav>/<footer>, and trim mega-menus and link farms from the page body.",
      verify: "Re-run; prose share should rise above 60%.",
      source: src, confidence: "observed",
    });
  if (page && !headings.length && wordCount(text) > 200)
    add({
      priority: "medium", category: "Structure",
      title: "No headings survive extraction",
      evidence: `${wordCount(text)} words extracted with zero Markdown headings${headAudit ? ` (raw HTML has ${headAudit.headings.length} h1-h6 elements)` : ""}.`,
      impact: "AI tools use headings to split the page into topical sections; without them the page is one undifferentiated blob and specific answers are harder to locate.",
      fix: headAudit && headAudit.headings.length ? "Headings exist in HTML but are lost in extraction — check they are real <h1>-<h6> elements, not styled <div>/<span>." : "Add <h2> section headings that name the question each section answers.",
      verify: "Re-run; the Extraction tab lists the detected headings.",
      source: src, confidence: "observed",
    });

  /* answer-ability */
  if (page && qTerms.length && (!answer || answer.coverage < 50))
    add({
      // A navigational/brand query that the title and H1 already name is a smaller gap than a question nobody answers.
      priority: (titleCov ?? 0) >= 67 ? "medium" : "high", category: "Answer-ability",
      title: (titleCov ?? 0) >= 67
        ? `Title/H1 match “${a.query}” but no body passage restates it (best covers ${answer?.coverage ?? 0}%)`
        : answer ? `No single passage answers “${a.query}” (best covers ${answer.coverage}% of its terms)` : `No passage addresses “${a.query}”`,
      evidence: answer
        ? `Best passage (${answer.position}% into the page): “${truncate(answer.text, 220)}” — covers ${answer.termsCovered.join(", ") || "none"}; missing ${answer.termsMissing.join(", ")}.`
        : `Query terms ${qTerms.map((t) => `“${t}”`).join(", ")} do not co-occur in any paragraph.`,
      impact: "AI search answers are built from passages that match the question. When no passage covers the query, the engine quotes a competitor instead" + (topCompetitor?.answerCoverage ? ` — ${topCompetitor.host} already has a passage covering ${topCompetitor.answerCoverage}%.` : "."),
      fix: `Add a one-paragraph direct answer under the H1 that uses the terms ${answer?.termsMissing.length ? answer.termsMissing.map((t) => `“${t}”`).join(", ") : qTerms.map((t) => `“${t}”`).join(", ")} naturally, e.g. “${suggestAnswerSentence(a.query, page.title || headAudit?.h1[0] || "")}”`,
      verify: "Re-run; the answer passage card should show ≥80% coverage within the first 20% of the page.",
      source: src, confidence: "observed",
    });
  else if (answer && answer.position > 50)
    add({
      priority: "medium", category: "Answer-ability",
      title: `The answer is buried ${answer.position}% of the way into the page`,
      evidence: `Best passage (word ${answer.wordOffset} of ${answer.totalWords}${answer.underHeading ? `, under “${answer.underHeading}”` : ""}): “${truncate(answer.text, 200)}”`,
      impact: "Extractors and snippet generators weight the opening of a document; a late answer is less likely to become the snippet or the quoted passage.",
      fix: "Move or duplicate a one-sentence version of this passage directly below the H1 (a TL;DR line).",
      verify: "Re-run; the passage position should fall under 20%.",
      source: src, confidence: "observed",
    });
  else if (answer && answer.words > 120)
    add({
      priority: "low", category: "Answer-ability",
      title: `The answer passage is ${answer.words} words long`,
      evidence: `“${truncate(answer.text, 200)}”`,
      impact: "Long passages get truncated when quoted; a tight 1-2 sentence answer is what gets lifted into AI answers and featured snippets.",
      fix: "Add a 25-40 word summary sentence before this paragraph that states the answer plainly.",
      verify: "Re-run; passage words should drop under 60.",
      source: src, confidence: "observed",
    });

  /* search visibility */
  if (target && !target.error && !hit) {
    const mix = intentMix(target.results);
    add({
      priority: "high", category: "Search visibility",
      title: `Not in the top ${target.results.length} for “${a.query}”`,
      evidence: `${target.results.length} results sampled (US/English); neither ${a.url} nor its redirect target appeared.${discoveryHit ? " The URL IS indexed (found via site: query), so this is a relevance gap, not an indexing gap." : discovery && !discovery.error ? " It also did not appear for its own site: query, so indexing itself is in doubt." : ""} Ranking formats: ${mix.slice(0, 3).map((m) => `${m.count} ${m.label.toLowerCase()}`).join(", ")}.`,
      impact: "AI search tools (ChatGPT search, Perplexity, AI Overviews) pick sources from the same top results; a page outside them is effectively invisible for this question.",
      fix: [
        answer && answer.coverage < 80 ? `Make the page answer the query directly (see the Answer-ability finding).` : null,
        missing.length ? `The words ${missing.map((t) => `“${t}”`).join(", ")} never appear on the page — use them in the title, H1 or opening paragraph where accurate.` : null,
        topCompetitor ? `Study the top competing result (${topCompetitor.host}, ${topCompetitor.words.toLocaleString()} words, ${topCompetitor.headings} headings${topCompetitor.answerCoverage !== null ? `, ${topCompetitor.answerCoverage}% answer coverage` : ""}) in the Search tab and cover what it covers.` : null,
        !discoveryHit && discovery && !discovery.error ? "Confirm the page is indexed in Search Console and listed in the sitemap." : null,
      ].filter(Boolean).join(" "),
      verify: "Re-run the same query after publishing; the Search tab shows the position directly.",
      source: a.url, confidence: "observed",
    });
  }
  if (hit && hit.snippet && page) {
    const snipCov = coverageOf(qTerms, hit.snippet).coverage;
    const visible = normalized([page.title, page.description, text].filter(Boolean).join("\n"));
    const snippetHead = normalized(hit.snippet).split(" ").slice(0, 8).join(" ");
    const inText = snippetHead.length < 12 || visible.includes(snippetHead);
    if (snipCov === 0 || !inText)
      add({
        priority: "medium", category: "Search visibility",
        title: !inText ? "The SERP snippet is not text an AI tool can see" : "The SERP snippet does not mention the query",
        evidence: `Snippet shown at #${hit.position}: “${truncate(hit.snippet, 200)}”${!inText ? " — this text is absent from the extracted page." : ` — covers ${snipCov}% of the query terms.`}`,
        impact: !inText
          ? "Google shows text that the extractor never sees (likely from an image, a script-rendered block or an old version); AI tools cannot verify or quote it."
          : "A snippet that ignores the query lowers click-through and signals weak relevance for this intent.",
        fix: !inText
          ? "Put the snippet's wording into the visible, server-rendered page text and the meta description."
          : `Rewrite the meta description to answer the query in one sentence, e.g. “${answer ? truncate(answer.text, 150) : suggestAnswerSentence(a.query, page.title || "")}”.`,
        verify: "Re-run after re-indexing; the side-by-side card should show matching text.",
        source: a.url, confidence: "observed",
      });
  }
  if (hit && discoveryHit === null && discovery && !discovery.error && discovery.results.length === 0)
    add({
      priority: "low", category: "Indexing",
      title: "site: discovery query returned nothing",
      evidence: `“${discovery.query}” returned 0 results even though the page ranks #${hit.position} for the target query.`,
      impact: "Usually a search-provider quirk for site: operators; low confidence.",
      fix: "No action; verify indexing in Search Console if other signals also fail.",
      verify: "Re-run later.", source: a.url, confidence: "investigate",
    });

  /* raw-head and crawl-policy findings */
  if (headAudit)
    headFindings(headAudit, { url: a.url, finalUrl: src, suggested: answer?.text || page?.description || null, pageTitle: page?.title || headAudit.title }).forEach(add);
  else if (page && page.page_metadata?.robots && /(?:^|[\s,])noindex(?:$|[\s,])/i.test(page.page_metadata.robots))
    add({
      priority: "high", category: "Indexing",
      title: "noindex directive in metadata",
      evidence: `Fetch returned robots metadata: ${page.page_metadata.robots}`,
      impact: "Compliant crawlers drop this page from their index, so it cannot rank for any query.",
      fix: "Remove `noindex` from the meta robots tag if the page should be public.",
      verify: "Re-run the audit.", source: a.url, confidence: "observed",
    });
  if (a.crawlPolicy) crawlFindings(a.crawlPolicy, a.url).forEach(add);

  /* browser evidence */
  for (const c of comparisons.filter((c) => !c.matched && c.overlap < 85).slice(0, 6))
    add({
      priority: "low", category: "Browser",
      title: `Verify browser-only observation: ${c.label}`,
      evidence: `Agent observed “${c.quote}” after ${c.interaction || "opening the page"}. Exact normalized quote was absent from Fetch; ${c.overlap}% of its words occur somewhere in the extraction.`,
      impact: "This is an unverified comparison, not a confirmed content defect. The browser agent may have paraphrased or inferred this fact; page timing and extraction formatting can also explain the mismatch.",
      fix: `Inspect “${c.label}” on the page. If the fact only appears after ${c.interaction || "interaction"}, also expose its essential text in the main document or a crawlable linked detail page. Confirm the quote before making changes.`,
      verify: "Rerun both Fetch and Agent; look for this specific fact in the extracted content. A verbatim mismatch is a review signal, not proof of missing meaning.",
      source: c.source_url || a.url, confidence: "investigate",
    });
  if (a.browser && a.browser.status !== "readable")
    add({
      priority: "medium", category: "Browser",
      title: `Browser agent hit an access barrier (${a.browser.status.replace("_", " ")})`,
      evidence: [a.browser.status, ...a.browser.barriers].join(": "),
      impact: "A real browser could not read the page either, so interactive AI agents (ChatGPT browsing, Operator-style tools) will fail here too.",
      fix: "Test public access in a fresh signed-out session and remove the barrier for public content while keeping intentional access controls.",
      verify: "Re-run with browser verification enabled; status should be readable.",
      source: a.url, confidence: "observed",
    });

  const order = { high: 0, medium: 1, low: 2 };
  findings.sort((x, y) => order[x.priority] - order[y.priority] || (x.confidence === "observed" ? 0 : 1) - (y.confidence === "observed" ? 0 : 1));
  findings.forEach((f, i) => (f.id = `F${String(i + 1).padStart(2, "0")}`));

  const matched = comparisons.filter((c) => c.matched).length;
  const metrics: Audit["metrics"] = {
    words: wordCount(text),
    headings,
    proseRatio: ratio,
    rank: hit?.position ?? null,
    sampled: comparisons.length,
    matched,
    coverage: page && comparisons.length ? Math.round((matched / comparisons.length) * 100) : null,
    queryTerms: qTerms,
    missingTerms: missing,
    blocked,
  };
  const audit: Audit = {
    ...a,
    headAudit,
    findings,
    comparisons,
    answer,
    score,
    serp: {
      intent: target ? intentMix(target.results) : [],
      alternate: alternate ? { query: alternate.query, rank: altHit?.position ?? null } : null,
      targetHit: hit,
      discoveryHit,
    },
    metrics,
    summary: "",
    limitations: [
      ...(a.browser?.rejectedObservations ? [`${a.browser.rejectedObservations} browser observations were excluded because their source URL was missing or outside the audited page.`] : []),
      "Search positions come from one TinyFish Search sample (US, English) at audit time; they are directional, not a universal rank. robots.txt rules are evaluated for the exact path only; HTTP headers (X-Robots-Tag), Search Console data and backlinks are not inspected. Browser observations are agent-reported.",
      ...(a.queryMode === "derived" ? ["The target query was derived from the page title/URL; supply a real customer query for a meaningful visibility audit."] : []),
    ],
  };
  audit.summary = executiveSummary(audit);
  return audit;
}

function suggestAnswerSentence(query: string, title: string) {
  const q = query.replace(/\?$/, "").trim();
  const subject = title ? title.split(/\s[|–—-]\s/)[0].trim() : q;
  return `${subject} ${/^(how|what|why|when|where|which|who)\b/i.test(q) ? "— " + q.toLowerCase().replace(/^(how to|how do i|what is|what are)\s*/i, "") + ": " : "is "}[one factual sentence that answers “${q}” using those words]`;
}

export function executiveSummary(a: Audit): string {
  const s = a.score;
  const host = hostOf(a.url) + (new URL(a.url).pathname === "/" ? "" : new URL(a.url).pathname);
  const known = s.groups.filter((g) => g.score !== null);
  const strongest = [...known].sort((x, y) => y.score! / y.max - x.score! / x.max)[0];
  const weakest = [...known].sort((x, y) => x.score! / x.max - y.score! / y.max)[0];
  const first = s.total === null
    ? `${host} could not be scored for “${a.query}” because the live checks did not return enough evidence.`
    : `${host} scores ${s.total}/100 (${s.grade}) for “${a.query}” — ${verdict(s).split(":")[1]?.trim() || verdict(s)}`;
  const second = strongest && weakest && strongest.id !== weakest.id
    ? ` Strongest area: ${strongest.label.toLowerCase()} (${strongest.score}/${strongest.max}); weakest: ${weakest.label.toLowerCase()} (${weakest.score}/${weakest.max}).`
    : "";
  const top = a.findings.filter((f) => f.priority !== "low").slice(0, 3);
  const third = top.length
    ? ` Fix first: ${top.map((f) => f.title.replace(/\.$/, "")).join("; ")}.`
    : a.findings.length
      ? ` Only low-priority polish remains (${a.findings.length} items).`
      : " No deterministic issues were found in the completed checks.";
  return first + second + third;
}

export function reportMarkdown(a: Audit) {
  const g = a.score.groups.map((g) => `- ${g.label}: ${g.score === null ? "not measurable" : `${g.score}/${g.max}`}`).join("\n");
  return `# SignalScope audit\n\nURL: ${a.url}\nQuery: ${a.query} (${a.queryMode})\nChecked: ${a.checkedAt}\n\n## Summary\n\n${a.summary}\n\n## AI Visibility Score: ${a.score.total ?? "n/a"}/100 (${a.score.grade}, ${a.score.confidence}% of checks measurable)\n\n${g}\n\n## Results\n\n- Extracted words: ${a.metrics.words}\n- Position in search sample: ${a.metrics.rank ?? "Not observed"}\n- Answer passage coverage: ${a.answer ? a.answer.coverage + "% at " + a.answer.position + "% into the page" : "none"}\n- Browser quote coverage: ${a.metrics.coverage === null ? "Unknown" : a.metrics.coverage + "%"} (${a.metrics.matched}/${a.metrics.sampled})\n\n${a.findings.map((f) => `## ${f.id}: ${f.title}\n\nPriority: ${f.priority} | ${f.category} | ${f.confidence}\n\nEvidence: ${f.evidence}\n\nWhy it matters: ${f.impact}\n\nFix: ${f.fix}\n\nVerify: ${f.verify}\n\nSource: ${f.source}`).join("\n\n")}\n\n## Endpoint execution\n\n${a.stages.map((s) => `- ${s.endpoint}: ${s.status}; ${s.purpose}${s.error ? "; " + s.error : ""}`).join("\n")}\n\n## Limits\n\n${a.limitations.map((l) => "- " + l).join("\n")}\n\n## Extracted text\n\n${a.page?.text || "Unavailable"}`;
}
