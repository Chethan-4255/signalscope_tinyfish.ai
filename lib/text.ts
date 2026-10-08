/** Shared text helpers (pure, dependency-free). */
export function normalized(t: string) {
  return t
    .normalize("NFKC")
    .toLowerCase()
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}
const STOP = new Set([
  "the", "and", "for", "with", "how", "what", "that", "this", "your", "from",
  "are", "can", "does", "best", "you", "about", "into", "its", "their", "than",
  "then", "there", "which", "when", "where", "who", "why", "will", "would",
  "should", "could", "has", "have", "had", "was", "were", "been", "being",
  "not", "but", "they", "them", "our", "out", "any", "all", "get", "use",
  "using", "versus", "per",
]);
export function terms(t: string) {
  return [
    ...new Set(
      normalized(t)
        .split(" ")
        .filter((x) => x.length > 2 && !STOP.has(x)),
    ),
  ].slice(0, 16);
}
export function wordCount(t: string) {
  const n = normalized(t);
  return n ? n.split(" ").length : 0;
}
export function markdownHeadings(t: string) {
  return [
    ...t
      .replace(/```[\s\S]*?```/g, "")
      .replace(/~~~[\s\S]*?~~~/g, "")
      .matchAll(/^#{1,6}\s+(.+)$/gm),
  ]
    .map((m) => m[1])
    .slice(0, 60);
}
export function decodeEntities(s: string) {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)));
}
export function truncate(s: string, n: number) {
  return s.length > n ? s.slice(0, n - 1).trimEnd() + "…" : s;
}
