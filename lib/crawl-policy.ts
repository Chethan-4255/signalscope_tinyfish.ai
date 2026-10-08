import type { Finding } from "./audit-model.ts";

export const AI_CRAWLERS = [
  { agent: "GPTBot", vendor: "OpenAI", use: "ChatGPT training + browsing index" },
  { agent: "OAI-SearchBot", vendor: "OpenAI", use: "ChatGPT search results" },
  { agent: "ChatGPT-User", vendor: "OpenAI", use: "ChatGPT live page visits" },
  { agent: "ClaudeBot", vendor: "Anthropic", use: "Claude crawling" },
  { agent: "Claude-Web", vendor: "Anthropic", use: "Claude web fetch" },
  { agent: "anthropic-ai", vendor: "Anthropic", use: "Anthropic crawler (legacy token)" },
  { agent: "PerplexityBot", vendor: "Perplexity", use: "Perplexity search index" },
  { agent: "Google-Extended", vendor: "Google", use: "Gemini training (not Search ranking)" },
  { agent: "Googlebot", vendor: "Google", use: "Google Search + AI Overviews" },
  { agent: "Bingbot", vendor: "Microsoft", use: "Bing + Copilot" },
  { agent: "Applebot-Extended", vendor: "Apple", use: "Apple Intelligence" },
  { agent: "Amazonbot", vendor: "Amazon", use: "Alexa answers" },
  { agent: "CCBot", vendor: "Common Crawl", use: "Open datasets used by many models" },
  { agent: "Bytespider", vendor: "ByteDance", use: "TikTok/Doubao" },
] as const;

export type CrawlerRule = {
  agent: string;
  vendor: string;
  use: string;
  /** true = allowed for this path, false = disallowed, null = robots.txt unavailable */
  allowed: boolean | null;
  /** Which user-agent group decided (exact token or "*"), and the matching directive. */
  group: string | null;
  rule: string | null;
};
export type CrawlPolicy = {
  origin: string;
  robots: {
    status: "present" | "missing" | "unavailable";
    bytes: number;
    sitemaps: string[];
    rules: CrawlerRule[];
    blockedAll: boolean;
    excerpt: string;
    /** Cloudflare Content-Signal directive if present (ai-train / search / ai-input). */
    contentSignal: string | null;
  };
  llms: { status: "present" | "missing" | "unavailable"; bytes: number; excerpt: string; mentionsPage: boolean };
  sitemap: {
    status: "present" | "missing" | "unavailable" | "index";
    urlCount: number;
    listsPage: boolean | null;
    location: string;
  };
};

type Group = { agents: string[]; rules: { allow: boolean; path: string }[] };

/** Parse robots.txt (RFC 9309 semantics: groups, longest-match, allow wins ties, * and $ wildcards). */
export function parseRobots(text: string): { groups: Group[]; sitemaps: string[] } {
  const groups: Group[] = [];
  const sitemaps: string[] = [];
  let current: Group | null = null,
    lastWasAgent = false;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/\s*#.*$/, "").replace(/\\([*_$#])/g, "$1").trim();
    if (!line) continue;
    const m = /^([A-Za-z-]+)\s*:\s*(.*)$/.exec(line);
    if (!m) continue;
    const key = m[1].toLowerCase(),
      value = m[2].trim();
    if (key === "user-agent") {
      if (!current || !lastWasAgent) {
        current = { agents: [], rules: [] };
        groups.push(current);
      }
      current.agents.push(value.toLowerCase());
      lastWasAgent = true;
    } else if (key === "allow" || key === "disallow") {
      if (current) current.rules.push({ allow: key === "allow", path: value });
      lastWasAgent = false;
    } else if (key === "sitemap") {
      sitemaps.push(value);
    } else lastWasAgent = false;
  }
  return { groups, sitemaps };
}
function pathMatches(pattern: string, path: string) {
  if (!pattern) return false;
  const re = new RegExp(
    "^" +
      pattern
        .split("*")
        .map((p) => p.replace(/[.+?^${}()|[\]\\]/g, "\\$&"))
        .join(".*")
        .replace(/\\\$$/, "$"),
  );
  return re.test(path);
}
export function evaluateRobots(
  parsed: ReturnType<typeof parseRobots>,
  agent: string,
  path: string,
): { allowed: boolean; group: string | null; rule: string | null } {
  const a = agent.toLowerCase();
  const exact = parsed.groups.filter((g) => g.agents.some((x) => x === a || a.startsWith(x + "/") || (x !== "*" && a.includes(x))));
  const chosen = exact.length ? exact : parsed.groups.filter((g) => g.agents.includes("*"));
  if (!chosen.length) return { allowed: true, group: null, rule: null };
  const groupName = exact.length ? agent : "*";
  let best: { allow: boolean; path: string } | null = null;
  for (const g of chosen)
    for (const r of g.rules) {
      if (!r.path) {
        if (!r.allow && !best) best = { allow: true, path: "(empty Disallow)" };
        continue;
      }
      if (!pathMatches(r.path, path)) continue;
      if (!best || r.path.length > best.path.length || (r.path.length === best.path.length && r.allow && !best.allow))
        best = r;
    }
  if (!best) return { allowed: true, group: groupName, rule: null };
  return { allowed: best.allow, group: groupName, rule: `${best.allow ? "Allow" : "Disallow"}: ${best.path}` };
}

type FetchedDoc = { url: string; final_url?: string; title?: string | null; text: string } | null;
const looks404 = (d: NonNullable<FetchedDoc>) =>
  /\b(404|not found|page not found|doesn.t exist)\b/i.test(d.title || "") ||
  (d.text.length < 400 && /\b(404|not found)\b/i.test(d.text));

export function buildCrawlPolicy(
  pageUrl: string,
  docs: { robots: FetchedDoc; llms: FetchedDoc; sitemap: FetchedDoc },
  errors: Record<"robots" | "llms" | "sitemap", string | undefined>,
): CrawlPolicy {
  const u = new URL(pageUrl);
  const path = u.pathname + u.search;
  const robotsText = docs.robots && !looks404(docs.robots) ? docs.robots.text : "";
  const robotsLooksLikeRobots = /user-agent\s*:/i.test(robotsText);
  const parsed = parseRobots(robotsText);
  const robotsStatus: CrawlPolicy["robots"]["status"] = docs.robots
    ? robotsLooksLikeRobots || /disallow|allow|sitemap/i.test(robotsText) ? "present" : "missing"
    : /404/.test(errors.robots || "") ? "missing" : "unavailable";
  const rules: CrawlerRule[] = AI_CRAWLERS.map((c) => {
    if (robotsStatus === "unavailable") return { ...c, allowed: null, group: null, rule: null };
    if (robotsStatus === "missing") return { ...c, allowed: true, group: null, rule: "no robots.txt → everything allowed" };
    const r = evaluateRobots(parsed, c.agent, path);
    return { ...c, ...r };
  });
  const llmsText = docs.llms && !looks404(docs.llms) ? docs.llms.text : "";
  const llmsPresent = !!llmsText && !/<html|<!doctype/i.test(llmsText.slice(0, 200));
  const sitemapText = docs.sitemap && !looks404(docs.sitemap) ? docs.sitemap.text : "";
  const locs = [...sitemapText.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/gi)].map((m) => m[1]);
  const plainUrls = [...new Set(locs.length ? locs : [...sitemapText.matchAll(/https?:\/\/[^\s"'<>)\]]+/g)].map((m) => m[0]))];
  const isIndex = /<sitemapindex/i.test(sitemapText) || (plainUrls.length > 0 && plainUrls.every((u) => /\.xml(\?|$)/i.test(u)));
  const norm = (x: string) => x.replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, "").split("#")[0];
  const targets = [pageUrl, docs.robots?.final_url || ""].filter(Boolean).map(norm);
  const listsPage = plainUrls.some((l) => targets.includes(norm(l)));
  return {
    origin: u.origin,
    robots: {
      status: robotsStatus,
      bytes: robotsText.length,
      sitemaps: parsed.sitemaps,
      rules,
      blockedAll: robotsStatus === "present" && rules.every((r) => r.allowed === false),
      excerpt: robotsText.slice(0, 1500),
      contentSignal: /content-signal\s*:\s*([^\n]+)/i.exec(robotsText)?.[1].trim() || null,
    },
    llms: {
      status: llmsPresent ? "present" : docs.llms || /404/.test(errors.llms || "") ? "missing" : "unavailable",
      bytes: llmsText.length,
      excerpt: llmsPresent ? llmsText.slice(0, 800) : "",
      mentionsPage: llmsPresent && llmsText.includes(u.pathname),
    },
    sitemap: {
      status: isIndex ? "index" : plainUrls.length ? "present" : docs.sitemap || /404/.test(errors.sitemap || "") ? "missing" : "unavailable",
      urlCount: plainUrls.length,
      listsPage: isIndex ? null : plainUrls.length ? listsPage : null,
      location: `${u.origin}/sitemap.xml`,
    },
  };
}

export function crawlFindings(p: CrawlPolicy, pageUrl: string): Omit<Finding, "id">[] {
  const out: Omit<Finding, "id">[] = [];
  const path = new URL(pageUrl).pathname;
  const blocked = p.robots.rules.filter((r) => r.allowed === false);
  const aiBlocked = blocked.filter((r) => !["Googlebot", "Bingbot"].includes(r.agent));
  const searchBlocked = blocked.filter((r) => ["Googlebot", "Bingbot"].includes(r.agent));
  if (searchBlocked.length)
    out.push({
      priority: "high", category: "Crawl policy",
      title: `${searchBlocked.map((r) => r.agent).join(" and ")} blocked from ${path} by robots.txt`,
      evidence: searchBlocked.map((r) => `${r.agent}: ${r.rule} (group: ${r.group})`).join("\n"),
      impact: "Blocked search crawlers cannot read the page, so it cannot rank for the target query at all; AI Overviews and Copilot answers draw from the same index.",
      fix: `Edit ${p.origin}/robots.txt and remove or narrow the matching Disallow for this path, e.g.\nUser-agent: *\nAllow: ${path}`,
      verify: "Re-run SignalScope (Crawl policy panel) and test in Search Console's robots.txt report.", source: `${p.origin}/robots.txt`, confidence: "observed",
    });
  if (aiBlocked.length)
    out.push({
      priority: aiBlocked.length >= 4 ? "high" : "medium", category: "Crawl policy",
      title: `${aiBlocked.length} AI crawler${aiBlocked.length > 1 ? "s" : ""} disallowed for ${path} (${aiBlocked.slice(0, 4).map((r) => r.agent).join(", ")}${aiBlocked.length > 4 ? "…" : ""})`,
      evidence: aiBlocked.map((r) => `${r.agent} (${r.vendor}, ${r.use}): ${r.rule}`).join("\n"),
      impact: "These assistants will not fetch or cite this page. If the block is intentional (e.g. opting out of training), keep it, but note that OAI-SearchBot / ClaudeBot / PerplexityBot are the agents that produce citations, not just training data.",
      fix: `To be citable, add explicit allow groups to ${p.origin}/robots.txt, e.g.\n${aiBlocked.slice(0, 3).map((r) => `User-agent: ${r.agent}\nAllow: /`).join("\n\n")}\nKeep Google-Extended / CCBot disallowed if you only want to opt out of training.`,
      verify: "Re-run SignalScope; every row in the Crawl policy table should read Allowed.", source: `${p.origin}/robots.txt`, confidence: "observed",
    });
  if (p.robots.status === "missing")
    out.push({
      priority: "low", category: "Crawl policy",
      title: "No robots.txt",
      evidence: `${p.origin}/robots.txt returned no robots directives.`,
      impact: "Everything is crawlable (good for visibility) but you have no place to declare your sitemap or AI-crawler preferences.",
      fix: `Publish ${p.origin}/robots.txt with:\nUser-agent: *\nAllow: /\nSitemap: ${p.origin}/sitemap.xml`,
      verify: "Re-run SignalScope.", source: `${p.origin}/robots.txt`, confidence: "observed",
    });
  if (p.sitemap.status === "missing")
    out.push({
      priority: "medium", category: "Crawl policy",
      title: "No sitemap.xml",
      evidence: `${p.sitemap.location} was not found${p.robots.sitemaps.length ? `; robots.txt points to ${p.robots.sitemaps.join(", ")} instead` : " and robots.txt lists no Sitemap"}.`,
      impact: "Without a sitemap, discovery of this page depends entirely on internal links; new or deep pages are indexed later or not at all.",
      fix: `Generate a sitemap listing ${pageUrl} (Next.js: app/sitemap.ts; WordPress: Yoast/RankMath) and reference it from robots.txt with Sitemap: ${p.sitemap.location}`,
      verify: "Re-run SignalScope: the sitemap row should show the page as listed.", source: p.sitemap.location, confidence: "observed",
    });
  else if (p.sitemap.status === "present" && p.sitemap.listsPage === false)
    out.push({
      priority: "medium", category: "Crawl policy",
      title: "Sitemap exists but does not list this page",
      evidence: `${p.sitemap.location} lists ${p.sitemap.urlCount} URLs; ${pageUrl} is not one of them.`,
      impact: "Search engines deprioritize URLs that are missing from an otherwise complete sitemap, and the page's updates are discovered later.",
      fix: `Add <url><loc>${pageUrl}</loc></url> to the sitemap (or fix the generator's include rules).`,
      verify: "Re-run SignalScope.", source: p.sitemap.location, confidence: "observed",
    });
  if (p.llms.status === "missing")
    out.push({
      priority: "low", category: "Crawl policy",
      title: "No llms.txt",
      evidence: `${p.origin}/llms.txt was not found.`,
      impact: "Optional, but a growing number of AI tools read /llms.txt to find the site's canonical, most-important pages in plain Markdown. It is a cheap way to steer which URLs assistants read first.",
      fix: `Publish ${p.origin}/llms.txt:\n# ${new URL(pageUrl).hostname}\n> One-line description of the site.\n\n## Key pages\n- [Page title](${pageUrl}): what this page answers`,
      verify: "Re-run SignalScope; the llms.txt row turns Present.", source: `${p.origin}/llms.txt`, confidence: "observed",
    });
  return out;
}
