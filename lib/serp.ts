import type { Hit } from "./audit-model.ts";

export type IntentKind = "docs" | "blog" | "product" | "video" | "forum" | "social" | "news" | "reference" | "other";
export const INTENT_LABEL: Record<IntentKind, string> = {
  docs: "Documentation",
  blog: "Blog / guide",
  product: "Product / landing",
  video: "Video",
  forum: "Forum / Q&A",
  social: "Social",
  news: "News",
  reference: "Reference (wiki)",
  other: "Other",
};

const SOCIAL = /(^|\.)(reddit\.com|quora\.com|youtube\.com|youtu\.be|linkedin\.com|facebook\.com|x\.com|twitter\.com|pinterest\.\w+|instagram\.com|tiktok\.com|threads\.net|medium\.com|stackoverflow\.com|stackexchange\.com|news\.ycombinator\.com|producthunt\.com)$/i;
const WIKI = /(^|\.)(wikipedia\.org|wikimedia\.org|britannica\.com)$/i;

export function hostOf(url: string) {
  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return "";
  }
}

export function classifyHit(h: Hit): IntentKind {
  const host = hostOf(h.url);
  let path = "";
  try {
    path = new URL(h.url).pathname.toLowerCase();
  } catch {}
  if (/(^|\.)(youtube\.com|youtu\.be|vimeo\.com|tiktok\.com)$/.test(host) || /\/(video|watch|videos)\b/.test(path)) return "video";
  if (/(^|\.)(reddit\.com|quora\.com|stackoverflow\.com|stackexchange\.com|news\.ycombinator\.com)$/.test(host) || /\/(forum|forums|community|questions|discussion|thread|t)\//.test(path)) return "forum";
  if (SOCIAL.test(host)) return "social";
  if (WIKI.test(host)) return "reference";
  if (/^(docs|developer|developers|dev|learn|help|support|api)\./.test(host) || /\/(docs|documentation|reference|api|guide|guides|manual|help|support|kb|knowledge)\b/.test(path)) return "docs";
  if (/\/(blog|news|articles|article|post|posts|insights|resources|learn|stories|magazine|\d{4}\/\d{2})\b/.test(path) || /(^|\.)(medium\.com|substack\.com|dev\.to|hashnode\.\w+)$/.test(host)) return "blog";
  if (/(^|\.)(nytimes|bbc|cnn|theverge|techcrunch|reuters|bloomberg|forbes|wired|guardian)\./.test(host)) return "news";
  if (/\/(pricing|plans|product|products|features|solutions|compare|vs|alternatives|buy|shop|store)\b/.test(path) || path === "/" || path === "") return "product";
  return "other";
}

export function intentMix(hits: Hit[]) {
  const counts = new Map<IntentKind, number>();
  for (const h of hits) counts.set(classifyHit(h), (counts.get(classifyHit(h)) || 0) + 1);
  return [...counts.entries()]
    .map(([kind, count]) => ({ kind, label: INTENT_LABEL[kind], count, share: Math.round((count / Math.max(1, hits.length)) * 100) }))
    .sort((a, b) => b.count - a.count);
}

/** Top other-host organic pages worth comparing against (no social/forum/video), deduplicated by host. */
export function pickCompetitors(hits: Hit[], pageUrl: string, max = 3, includeWikipedia = false) {
  const own = hostOf(pageUrl);
  const seen = new Set<string>();
  const out: Hit[] = [];
  for (const h of hits) {
    const host = hostOf(h.url);
    if (!host || host === own || own.endsWith("." + host) || host.endsWith("." + own)) continue;
    if (seen.has(host)) continue;
    const kind = classifyHit(h);
    if (["video", "forum", "social"].includes(kind)) continue;
    if (!includeWikipedia && kind === "reference") continue;
    if (!/^https?:/.test(h.url) || /\.(pdf|xml|zip)$/i.test(h.url)) continue;
    seen.add(host);
    out.push(h);
    if (out.length >= max) break;
  }
  return out;
}

/** Second phrasing to probe: a question form when the query is not one, otherwise the page title. */
export function alternatePhrasing(query: string, title: string | null | undefined): { query: string; mode: "question" | "title" | "none" } {
  const q = query.trim();
  const isQuestion = /^(what|how|why|when|where|who|which|is|are|can|does|do|should)\b/i.test(q) || q.endsWith("?");
  if (!isQuestion && q) {
    const words = q.split(/\s+/);
    const looksLikeHowTo = /\b(install|setup|set up|configure|build|create|make|use|fix|deploy|migrate|integrate|start|get started|find|write)\b/i.test(q);
    const qq = looksLikeHowTo ? `how to ${q.replace(/^how to\s+/i, "")}` : words.length <= 3 ? `what is ${q}` : `what is the best ${q}`;
    return { query: qq, mode: "question" };
  }
  const t = (title || "").replace(/\s*[|–—-]\s*[^|–—-]*$/, "").trim();
  if (t && t.toLowerCase() !== q.toLowerCase()) return { query: t.slice(0, 120), mode: "title" };
  return { query: "", mode: "none" };
}
