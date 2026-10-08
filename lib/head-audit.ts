import { decodeEntities, truncate } from "./text.ts";
import type { Finding } from "./audit-model.ts";

export type HeadAudit = {
  htmlBytes: number;
  title: string | null;
  description: string | null;
  robots: string | null;
  noindex: boolean;
  canonical: string | null;
  hreflang: { lang: string; href: string }[];
  og: { title?: string; description?: string; image?: string; type?: string; url?: string };
  twitter: { card?: string; title?: string; description?: string; image?: string };
  jsonLd: { blocks: number; invalid: number; types: string[] };
  lang: string | null;
  viewport: string | null;
  h1: string[];
  headings: { level: number; text: string }[];
  skippedLevels: { from: number; to: number; text: string }[];
  /** Whether the document body appears to be an app shell with little static text. */
  bodyTextWords: number;
};

function attrs(tag: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const m of tag.matchAll(
    /([a-zA-Z_:][-a-zA-Z0-9_:.]*)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))/g,
  ))
    out[m[1].toLowerCase()] = decodeEntities(m[2] ?? m[3] ?? m[4] ?? "");
  return out;
}
function stripTags(s: string) {
  return decodeEntities(s.replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
}
function collectTypes(node: unknown, out: Set<string>) {
  if (Array.isArray(node)) return node.forEach((n) => collectTypes(n, out));
  if (node && typeof node === "object") {
    const t = (node as Record<string, unknown>)["@type"];
    if (typeof t === "string") out.add(t);
    else if (Array.isArray(t)) t.forEach((x) => typeof x === "string" && out.add(x));
    const graph = (node as Record<string, unknown>)["@graph"];
    if (Array.isArray(graph)) graph.forEach((n) => collectTypes(n, out));
    const main = (node as Record<string, unknown>)["mainEntity"];
    if (main) collectTypes(main, out);
  }
}

export function parseHead(html: string): HeadAudit {
  const headMatch = /<head[^>]*>([\s\S]*?)<\/head>/i.exec(html);
  const head = headMatch ? headMatch[1] : html.slice(0, 200000);
  const metas = [...head.matchAll(/<meta\b[^>]*>/gi)].map((m) => attrs(m[0]));
  const links = [...head.matchAll(/<link\b[^>]*>/gi)].map((m) => attrs(m[0]));
  const meta = (key: string) => {
    const k = key.toLowerCase();
    const hit = metas.find(
      (a) => (a.name || a.property || a["http-equiv"] || "").toLowerCase() === k,
    );
    return hit?.content?.trim() || undefined;
  };
  const titleMatch = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(head);
  const title = titleMatch ? stripTags(titleMatch[1]) : null;
  const htmlTag = /<html\b[^>]*>/i.exec(html);
  const lang = htmlTag ? attrs(htmlTag[0]).lang || null : null;
  const robots = meta("robots") || meta("googlebot") || null;
  const canonical =
    links.find((l) => (l.rel || "").toLowerCase().split(/\s+/).includes("canonical"))?.href ||
    null;
  const hreflang = links
    .filter((l) => (l.rel || "").toLowerCase() === "alternate" && l.hreflang && l.href)
    .map((l) => ({ lang: l.hreflang, href: l.href }));
  const jsonLd = { blocks: 0, invalid: 0, types: [] as string[] };
  const typeSet = new Set<string>();
  for (const m of html.matchAll(
    /<script\b[^>]*type\s*=\s*["']?application\/ld\+json["']?[^>]*>([\s\S]*?)<\/script>/gi,
  )) {
    jsonLd.blocks++;
    try {
      collectTypes(JSON.parse(m[1].trim().replace(/^<!--|-->$/g, "")), typeSet);
    } catch {
      jsonLd.invalid++;
    }
  }
  jsonLd.types = [...typeSet];
  const body = html.replace(/<head[\s\S]*?<\/head>/i, "");
  const noScript = body
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<svg[\s\S]*?<\/svg>/gi, " ")
    .replace(/<template[\s\S]*?<\/template>/gi, " ");
  const headings = [...noScript.matchAll(/<h([1-6])\b[^>]*>([\s\S]*?)<\/h\1>/gi)]
    .map((m) => ({ level: Number(m[1]), text: truncate(stripTags(m[2]), 140) }))
    .filter((h) => h.text)
    .slice(0, 120);
  const skippedLevels: HeadAudit["skippedLevels"] = [];
  for (let i = 1; i < headings.length; i++)
    if (headings[i].level > headings[i - 1].level + 1)
      skippedLevels.push({ from: headings[i - 1].level, to: headings[i].level, text: headings[i].text });
  const bodyText = stripTags(noScript);
  return {
    htmlBytes: html.length,
    title: title || null,
    description: meta("description") || null,
    robots,
    noindex: /(?:^|[\s,])noindex(?:$|[\s,])/i.test(robots || ""),
    canonical,
    hreflang,
    og: {
      title: meta("og:title"),
      description: meta("og:description"),
      image: meta("og:image") || meta("og:image:url"),
      type: meta("og:type"),
      url: meta("og:url"),
    },
    twitter: {
      card: meta("twitter:card"),
      title: meta("twitter:title"),
      description: meta("twitter:description"),
      image: meta("twitter:image"),
    },
    jsonLd,
    lang,
    viewport: meta("viewport") || null,
    h1: headings.filter((h) => h.level === 1).map((h) => h.text),
    headings,
    skippedLevels,
    bodyTextWords: bodyText ? bodyText.split(/\s+/).length : 0,
  };
}

const same = (a: string, b: string) => {
  try {
    const x = new URL(a), y = new URL(b);
    return (
      x.hostname.replace(/^www\./, "") === y.hostname.replace(/^www\./, "") &&
      x.pathname.replace(/\/$/, "") === y.pathname.replace(/\/$/, "")
    );
  } catch {
    return false;
  }
};

/** Deterministic findings from the raw <head>. `suggested` is the best answer passage used for copy suggestions. */
export function headFindings(
  h: HeadAudit,
  ctx: { url: string; finalUrl: string; suggested: string | null; pageTitle: string | null },
): Omit<Finding, "id">[] {
  const out: Omit<Finding, "id">[] = [];
  const src = ctx.finalUrl || ctx.url;
  const seed = ctx.suggested || "";
  const titleCopy = (ctx.pageTitle || h.h1[0] || new URL(src).hostname).slice(0, 60);
  const descCopy = seed ? truncate(seed.replace(/\s+/g, " "), 155) : "";
  const verifyHead = "Re-run SignalScope: the Technical tab reads the live <head> via TinyFish Fetch (raw HTML) and will show the new value.";

  if (!h.title)
    out.push({
      priority: "high", category: "Metadata",
      title: "Missing <title>",
      evidence: `The raw HTML <head> (${h.htmlBytes.toLocaleString()} bytes) contains no <title> element.`,
      impact: "Search engines and AI fetch tools label the document by its title; without it the SERP headline is invented from body text and AI citations show a bare URL.",
      fix: `Add <title>${titleCopy}</title> inside <head>. Keep it 30-60 characters and lead with the page's subject.`,
      verify: verifyHead, source: src, confidence: "observed",
    });
  else if (h.title.length < 30 || h.title.length > 60)
    out.push({
      priority: h.title.length > 60 ? "medium" : "low", category: "Metadata",
      title: `Title is ${h.title.length} characters (${h.title.length > 60 ? "will be truncated" : "shorter than typical"})`,
      evidence: `<title>${h.title}</title>`,
      impact: h.title.length > 60
        ? "Google truncates titles around 60 characters, so the end of this title is cut off in results; AI tools quote the full string, so the two labels diverge."
        : "A short title gives search engines little to match the query against and often gets rewritten.",
      fix: h.title.length > 60
        ? `Shorten to ≤60 characters, keeping the subject first. Suggested: <title>${truncate(h.title, 58)}</title>`
        : `Extend the title with the page's main topic, e.g. <title>${titleCopy}${h.h1[0] && !h.title.includes(h.h1[0]) ? " – " + truncate(h.h1[0], 30) : ""}</title>`,
      verify: verifyHead, source: src, confidence: "observed",
    });
  if (!h.description)
    out.push({
      priority: "high", category: "Metadata",
      title: "Missing meta description",
      evidence: "No <meta name=\"description\"> in the raw <head>. The SERP snippet and the Fetch `description` field both fall back to arbitrary body text.",
      impact: "You lose control of the snippet shown in search and of the one-line summary AI tools attach when they cite the page.",
      fix: `Add <meta name="description" content="${descCopy || "One-sentence factual summary of what this page offers, 70-160 characters."}"> inside <head>.${descCopy ? " (Suggested copy is the page's best answer passage; edit before publishing.)" : ""}`,
      verify: verifyHead, source: src, confidence: "observed",
    });
  else if (h.description.length < 70 || h.description.length > 160)
    out.push({
      priority: "low", category: "Metadata",
      title: `Meta description is ${h.description.length} characters`,
      evidence: `<meta name="description" content="${truncate(h.description, 200)}">`,
      impact: h.description.length > 160
        ? "Search engines truncate descriptions around 155-160 characters, so the end is cut off."
        : "A very short description is usually replaced with auto-generated snippet text, which is less controllable.",
      fix: `Rewrite to 70-160 characters.${descCopy ? ` Suggested: content="${descCopy}"` : ""}`,
      verify: verifyHead, source: src, confidence: "observed",
    });
  if (h.noindex)
    out.push({
      priority: "high", category: "Indexing",
      title: "noindex directive in meta robots",
      evidence: `<meta name="robots" content="${h.robots}">`,
      impact: "Compliant crawlers drop this page from their index, so it cannot rank for any query. AI search tools that respect robots meta will not cite it either.",
      fix: "If the page should be public, remove `noindex` from the robots meta tag (and check the X-Robots-Tag HTTP header). Keep it only if exclusion is intentional.",
      verify: "Re-run the audit and request indexing in Search Console.", source: src, confidence: "observed",
    });
  if (h.robots && /nosnippet|max-snippet:\s*0/i.test(h.robots))
    out.push({
      priority: "medium", category: "Indexing",
      title: "Snippets are disabled by meta robots",
      evidence: `<meta name="robots" content="${h.robots}">`,
      impact: "`nosnippet` stops Google from showing any text snippet or AI Overview excerpt for this page; results show title + URL only.",
      fix: "Remove `nosnippet` / `max-snippet:0` unless legally required. Prefer `max-snippet:-1`.",
      verify: verifyHead, source: src, confidence: "observed",
    });
  if (!h.canonical)
    out.push({
      priority: "low", category: "Indexing",
      title: "No canonical link",
      evidence: "No <link rel=\"canonical\"> in <head>.",
      impact: "Query-string, trailing-slash and tracking variants of this URL can be indexed as duplicates and split ranking signals.",
      fix: `Add <link rel="canonical" href="${src}"> to <head>.`,
      verify: verifyHead, source: src, confidence: "observed",
    });
  else if (!same(h.canonical, src) && !same(h.canonical, ctx.url))
    out.push({
      priority: "medium", category: "Indexing",
      title: "Canonical points to a different URL",
      evidence: `Audited: ${src}\nCanonical: ${h.canonical}`,
      impact: "Search engines consolidate ranking signals under the canonical URL, so this page is effectively asking not to be the one that ranks.",
      fix: `If this page should rank, change the canonical to <link rel="canonical" href="${src}">. If the canonical is intentional, audit that URL instead.`,
      verify: verifyHead, source: src, confidence: "observed",
    });
  const ogMissing = (["title", "description", "image"] as const).filter((k) => !h.og[k]);
  if (ogMissing.length)
    out.push({
      priority: ogMissing.length === 3 ? "medium" : "low", category: "Metadata",
      title: ogMissing.length === 3 ? "No Open Graph tags" : `Open Graph incomplete (missing og:${ogMissing.join(", og:")})`,
      evidence: `Found: ${Object.entries(h.og).filter(([, v]) => v).map(([k, v]) => `og:${k}="${truncate(String(v), 60)}"`).join(", ") || "none"}`,
      impact: "Open Graph drives the preview card when the page is shared in chat apps, social feeds and some AI answer UIs; missing tags mean a bare link.",
      fix: ogMissing.map((k) => k === "title" ? `<meta property="og:title" content="${titleCopy}">` : k === "description" ? `<meta property="og:description" content="${descCopy || h.description || "…"}">` : `<meta property="og:image" content="https://${new URL(src).hostname}/og-image.png">  (1200×630 px)`).join("\n"),
      verify: verifyHead, source: src, confidence: "observed",
    });
  if (!h.twitter.card)
    out.push({
      priority: "low", category: "Metadata",
      title: "No Twitter/X card tag",
      evidence: "No <meta name=\"twitter:card\"> in <head>.",
      impact: "X and some link-unfurling tools fall back to a plain link instead of a rich card.",
      fix: `<meta name="twitter:card" content="summary_large_image">`,
      verify: verifyHead, source: src, confidence: "observed",
    });
  if (!h.jsonLd.blocks)
    out.push({
      priority: "medium", category: "Structured data",
      title: "No JSON-LD structured data",
      evidence: "No <script type=\"application/ld+json\"> block in the HTML.",
      impact: "Structured data tells search engines and AI systems what the page *is* (an article, a product, an FAQ) and unlocks rich results. Without it, type has to be inferred from prose.",
      fix: `Add a JSON-LD block to <head>, for example:\n<script type="application/ld+json">\n{"@context":"https://schema.org","@type":"WebPage","name":"${titleCopy}","url":"${src}"${h.description ? `,"description":"${truncate(h.description, 150)}"` : ""}}\n</script>\nUse Article, Product, FAQPage or SoftwareApplication when they fit the content.`,
      verify: "Validate at https://validator.schema.org, then re-run SignalScope.", source: src, confidence: "observed",
    });
  else if (h.jsonLd.invalid)
    out.push({
      priority: "medium", category: "Structured data",
      title: `${h.jsonLd.invalid} JSON-LD block${h.jsonLd.invalid > 1 ? "s" : ""} failed to parse`,
      evidence: `${h.jsonLd.blocks} ld+json block(s) found; ${h.jsonLd.invalid} contain invalid JSON. Parsed types: ${h.jsonLd.types.join(", ") || "none"}.`,
      impact: "Invalid JSON-LD is ignored entirely, so the structured data provides no benefit.",
      fix: "Fix the JSON syntax (trailing commas, unescaped quotes, HTML comments inside the script).",
      verify: "Validate at https://validator.schema.org.", source: src, confidence: "observed",
    });
  if (!h.lang)
    out.push({
      priority: "low", category: "Metadata",
      title: "<html> has no lang attribute",
      evidence: htmlTagEvidence(h),
      impact: "Language detection falls back to heuristics; AI tools and search engines may serve the page to the wrong-language audience.",
      fix: `Set <html lang="en"> (or the page's actual language).`,
      verify: verifyHead, source: src, confidence: "observed",
    });
  if (!h.viewport)
    out.push({
      priority: "low", category: "Metadata",
      title: "No viewport meta tag",
      evidence: "No <meta name=\"viewport\"> in <head>.",
      impact: "Mobile-first indexing treats the page as not mobile-friendly.",
      fix: `<meta name="viewport" content="width=device-width, initial-scale=1">`,
      verify: verifyHead, source: src, confidence: "observed",
    });
  if (h.headings.length && h.h1.length !== 1)
    out.push({
      priority: h.h1.length === 0 ? "medium" : "low", category: "Structure",
      title: h.h1.length === 0 ? "No <h1> on the page" : `${h.h1.length} <h1> elements`,
      evidence: h.h1.length ? h.h1.map((t) => `<h1>${t}</h1>`).join("\n") : `First heading is <h${h.headings[0].level}>${h.headings[0].text}</h${h.headings[0].level}>.`,
      impact: "The H1 is the strongest on-page statement of what the page answers; AI extractors use it as the document's topic sentence.",
      fix: h.h1.length === 0
        ? `Promote the main heading to <h1>${titleCopy}</h1>.`
        : "Keep one <h1> for the page topic and demote the others to <h2>.",
      verify: verifyHead, source: src, confidence: "observed",
    });
  if (h.skippedLevels.length)
    out.push({
      priority: "low", category: "Structure",
      title: `Heading levels skipped ${h.skippedLevels.length} time${h.skippedLevels.length > 1 ? "s" : ""}`,
      evidence: h.skippedLevels.slice(0, 3).map((s) => `h${s.from} → h${s.to}: “${s.text}”`).join("\n"),
      impact: "Skipped levels break the outline that AI tools use to chunk the page into sections, so passages get attached to the wrong topic.",
      fix: `Change the jumped headings to the next level down (e.g. <h${h.skippedLevels[0].from + 1}> instead of <h${h.skippedLevels[0].to}>).`,
      verify: verifyHead, source: src, confidence: "observed",
    });
  return out;
}
function htmlTagEvidence(h: HeadAudit) {
  return `<html${h.lang ? ` lang="${h.lang}"` : ""}> — ${h.htmlBytes.toLocaleString()} bytes of HTML inspected.`;
}
