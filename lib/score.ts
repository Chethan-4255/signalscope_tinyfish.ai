/**
 * AI Visibility Score (0-100).
 * Pure: takes already-measured facts, returns a transparent breakdown.
 * Unknown facts are EXCLUDED from the denominator, never scored as zero.
 */
export type ScoreItem = {
  id: string;
  label: string;
  /** Points earned; null when the fact could not be measured. */
  points: number | null;
  max: number;
  evidence: string;
};
export type ScoreGroup = {
  id: "search" | "extraction" | "metadata" | "answer";
  label: string;
  max: number;
  /** Earned points rescaled to `max` over the known items. null when nothing was measurable. */
  score: number | null;
  /** Raw earned / raw max of known items. */
  earned: number;
  available: number;
  items: ScoreItem[];
};
export type Score = {
  total: number | null;
  /** How much of the maximum was measurable (0-100). */
  confidence: number;
  grade: "A" | "B" | "C" | "D" | "F" | "?";
  groups: ScoreGroup[];
};

export type ScoreInput = {
  search: {
    /** null = search unavailable */
    targetChecked: boolean;
    rank: number | null;
    resultCount: number;
    discoveryChecked: boolean;
    foundInDiscovery: boolean;
    snippet: string | null; // null when page not in results
    snippetHasQueryTerm: boolean | null;
    altChecked: boolean;
    altRank: number | null;
  };
  extraction: {
    fetched: boolean;
    words: number;
    headings: number;
    /** share (0-1) of extracted words that are prose rather than link/navigation lines; null if unknown */
    proseRatio: number | null;
    /** true when Fetch/Agent hit a login wall, bot block or JS shell; null when not assessable */
    blocked: boolean | null;
    /** words in raw-HTML body vs extracted words (null when html unavailable) */
    htmlWords: number | null;
  };
  metadata: {
    available: boolean; // raw head parsed
    titleLength: number | null;
    descriptionLength: number | null;
    canonicalOk: boolean | null;
    noindex: boolean | null;
    ogComplete: boolean | null;
    twitterCard: boolean | null;
    jsonLdTypes: number | null; // -1 = present but invalid
    lang: boolean | null;
    h1Count: number | null;
    skippedLevels: number | null;
  };
  answer: {
    available: boolean; // page text + query exist
    coverage: number | null; // 0-100
    position: number | null; // % into document
    words: number | null; // passage length
    titleCoverage: number | null; // query terms in title+h1
  };
};

const band = (v: number, bands: [number, number][], fallback = 0) => {
  for (const [min, pts] of bands) if (v >= min) return pts;
  return fallback;
};

export function computeScore(i: ScoreInput): Score {
  const s = i.search, e = i.extraction, m = i.metadata, a = i.answer;
  const groups: ScoreGroup[] = [
    group("search", "Search visibility", 30, [
      {
        id: "rank", label: "Exact URL ranks for the target query", max: 12,
        points: !s.targetChecked ? null : s.rank === null ? 0 : s.rank <= 3 ? 12 : s.rank <= 10 ? 8 : 4,
        evidence: !s.targetChecked ? "Search unavailable." : s.rank === null ? `Not in the ${s.resultCount} sampled results.` : `Position #${s.rank} of ${s.resultCount}.`,
      },
      {
        id: "discovery", label: "URL found via site: discovery query", max: 8,
        points: !s.discoveryChecked ? null : s.foundInDiscovery ? 8 : 0,
        evidence: !s.discoveryChecked ? "Discovery search unavailable." : s.foundInDiscovery ? "Exact URL returned for its own site: query (indexed)." : "Exact URL absent from the site: query sample.",
      },
      {
        id: "snippet", label: "SERP snippet is substantive and on-topic", max: 5,
        points: s.snippet === null ? (s.targetChecked && s.rank === null ? 0 : null) : (s.snippet.length >= 60 ? 3 : 1) + (s.snippetHasQueryTerm ? 2 : 0),
        evidence: s.snippet === null ? (s.targetChecked && s.rank === null ? "No snippet: page not in results." : "Not measurable.") : `${s.snippet.length} chars; ${s.snippetHasQueryTerm ? "contains" : "lacks"} query terms.`,
      },
      {
        id: "alt", label: "Also ranks for an alternate phrasing", max: 5,
        points: !s.altChecked ? null : s.altRank === null ? 0 : s.altRank <= 5 ? 5 : 3,
        evidence: !s.altChecked ? "Alternate phrasing not searched." : s.altRank === null ? "Not in results for the alternate phrasing." : `Position #${s.altRank} for the alternate phrasing.`,
      },
    ]),
    group("extraction", "AI extraction", 30, [
      {
        id: "words", label: "Enough text reaches the extractor", max: 10,
        points: !e.fetched ? 0 : band(e.words, [[300, 10], [120, 6], [40, 3]]),
        evidence: !e.fetched ? "Fetch returned no document." : `${e.words.toLocaleString()} words extracted.`,
      },
      {
        id: "headings", label: "Headings survive extraction", max: 6,
        points: !e.fetched ? 0 : band(e.headings, [[3, 6], [1, 3]]),
        evidence: !e.fetched ? "No document." : `${e.headings} Markdown headings in the extraction.`,
      },
      {
        id: "prose", label: "Main content outweighs navigation", max: 7,
        points: !e.fetched ? 0 : e.proseRatio === null ? null : band(e.proseRatio, [[0.7, 7], [0.5, 4], [0.3, 2]]),
        evidence: !e.fetched ? "No document." : e.proseRatio === null ? "Not measurable." : `${Math.round(e.proseRatio * 100)}% of extracted words are prose (rest are link/menu lines).`,
      },
      {
        id: "block", label: "No login wall, bot block or empty JS shell", max: 7,
        points: e.blocked === null ? (e.fetched ? 7 : 0) : e.blocked ? 0 : 7,
        evidence: e.blocked ? "Access barrier or shell page detected." : e.fetched ? (e.htmlWords !== null ? `Raw HTML body ≈${e.htmlWords.toLocaleString()} words vs ${e.words.toLocaleString()} extracted.` : "Readable without interaction.") : "Fetch failed.",
      },
    ]),
    group("metadata", "Metadata & structure", 20, [
      {
        id: "title", label: "Title 30-60 chars", max: 3,
        points: !m.available ? null : m.titleLength === null ? 0 : m.titleLength >= 30 && m.titleLength <= 60 ? 3 : 1.5,
        evidence: !m.available ? "Raw HTML unavailable." : m.titleLength === null ? "No <title>." : `${m.titleLength} characters.`,
      },
      {
        id: "description", label: "Meta description 70-160 chars", max: 3,
        points: !m.available ? null : m.descriptionLength === null ? 0 : m.descriptionLength >= 70 && m.descriptionLength <= 160 ? 3 : 1.5,
        evidence: !m.available ? "Raw HTML unavailable." : m.descriptionLength === null ? "No meta description." : `${m.descriptionLength} characters.`,
      },
      {
        id: "canonical", label: "Canonical present and self-referencing", max: 2,
        points: !m.available || m.canonicalOk === null ? null : m.canonicalOk ? 2 : 0,
        evidence: !m.available ? "Raw HTML unavailable." : m.canonicalOk === null ? "Not measurable." : m.canonicalOk ? "Self-referencing canonical." : "Missing or points elsewhere.",
      },
      {
        id: "noindex", label: "No noindex directive", max: 3,
        points: !m.available ? null : m.noindex ? 0 : 3,
        evidence: !m.available ? "Raw HTML unavailable." : m.noindex ? "noindex found in meta robots." : "Indexable.",
      },
      {
        id: "og", label: "Open Graph title/description/image", max: 2,
        points: !m.available ? null : m.ogComplete ? 2 : 0,
        evidence: !m.available ? "Raw HTML unavailable." : m.ogComplete ? "Complete." : "Incomplete or missing.",
      },
      {
        id: "twitter", label: "Twitter card", max: 1,
        points: !m.available ? null : m.twitterCard ? 1 : 0,
        evidence: !m.available ? "Raw HTML unavailable." : m.twitterCard ? "Present." : "Missing.",
      },
      {
        id: "jsonld", label: "Valid JSON-LD with a type", max: 2,
        points: !m.available ? null : m.jsonLdTypes === null || m.jsonLdTypes <= 0 ? 0 : 2,
        evidence: !m.available ? "Raw HTML unavailable." : m.jsonLdTypes === -1 ? "Present but invalid JSON." : m.jsonLdTypes ? `${m.jsonLdTypes} type(s) declared.` : "None.",
      },
      {
        id: "lang", label: "<html lang> set", max: 1,
        points: !m.available ? null : m.lang ? 1 : 0,
        evidence: !m.available ? "Raw HTML unavailable." : m.lang ? "Set." : "Missing.",
      },
      {
        id: "h1", label: "Exactly one H1", max: 2,
        points: !m.available || m.h1Count === null ? null : m.h1Count === 1 ? 2 : m.h1Count === 0 ? 0 : 1,
        evidence: !m.available ? "Raw HTML unavailable." : `${m.h1Count ?? 0} <h1> element(s).`,
      },
      {
        id: "outline", label: "No skipped heading levels", max: 1,
        points: !m.available || m.skippedLevels === null ? null : m.skippedLevels ? 0 : 1,
        evidence: !m.available ? "Raw HTML unavailable." : `${m.skippedLevels ?? 0} skip(s).`,
      },
    ]),
    group("answer", "Answer-ability", 20, [
      {
        id: "coverage", label: "A single passage covers the query", max: 10,
        points: !a.available ? null : a.coverage === null ? 0 : band(a.coverage, [[80, 10], [50, 6], [30, 3]]),
        evidence: !a.available ? "No text or query." : a.coverage === null ? "No passage found." : `Best passage covers ${a.coverage}% of query terms.`,
      },
      {
        id: "early", label: "The answer appears early", max: 5,
        points: !a.available || a.position === null ? (a.available ? 0 : null) : a.position <= 20 ? 5 : a.position <= 50 ? 3 : 1,
        evidence: !a.available ? "Not measurable." : a.position === null ? "No passage." : `${a.position}% into the document.`,
      },
      {
        id: "concise", label: "The answer is concise", max: 3,
        points: !a.available || a.words === null ? (a.available ? 0 : null) : a.words <= 60 ? 3 : a.words <= 120 ? 2 : 1,
        evidence: !a.available ? "Not measurable." : a.words === null ? "No passage." : `${a.words} words.`,
      },
      {
        id: "title", label: "Title/H1 names the query topic", max: 2,
        points: !a.available || a.titleCoverage === null ? null : a.titleCoverage >= 50 ? 2 : a.titleCoverage > 0 ? 1 : 0,
        evidence: !a.available || a.titleCoverage === null ? "Not measurable." : `${a.titleCoverage}% of query terms in title/H1.`,
      },
    ]),
  ];
  const earned = groups.reduce((n, g) => n + (g.score ?? 0), 0);
  const available = groups.reduce((n, g) => n + (g.score === null ? 0 : g.max), 0);
  const total = available ? Math.round((earned / available) * 100) : null;
  const confidence = Math.round((available / groups.reduce((n, g) => n + g.max, 0)) * 100);
  return { total, confidence, grade: grade(total), groups };
}

function group(id: ScoreGroup["id"], label: string, max: number, items: ScoreItem[]): ScoreGroup {
  const known = items.filter((x) => x.points !== null);
  const earned = known.reduce((n, x) => n + (x.points as number), 0);
  const available = known.reduce((n, x) => n + x.max, 0);
  return {
    id, label, max, items, earned, available,
    score: available ? Math.round((earned / available) * max * 10) / 10 : null,
  };
}
export function grade(total: number | null): Score["grade"] {
  if (total === null) return "?";
  return total >= 85 ? "A" : total >= 70 ? "B" : total >= 55 ? "C" : total >= 40 ? "D" : "F";
}
export function verdict(score: Score): string {
  const t = score.total;
  if (t === null) return "Not enough evidence to score this page.";
  if (t >= 85) return "AI-ready: search engines and AI tools can find, read and quote this page.";
  if (t >= 70) return "Mostly visible: a few specific gaps keep this page from being fully AI-citable.";
  if (t >= 55) return "Partially visible: AI tools can read the page but search and metadata gaps limit how often it is surfaced.";
  if (t >= 40) return "Weak: significant extraction or visibility problems mean AI answers are unlikely to cite this page.";
  return "Invisible to AI: fundamental blockers prevent this page from being found or read.";
}
