import { normalized, terms } from "./text.ts";

export type AnswerPassage = {
  /** The passage an AI assistant would most likely quote for the query. */
  text: string;
  /** Share of query terms (0-100) present in the passage. */
  coverage: number;
  /** Word offset of the passage start within the extracted text. */
  wordOffset: number;
  /** Position of the passage as a percentage into the document (0-100). */
  position: number;
  /** Total words in the extracted text. */
  totalWords: number;
  /** Words in the passage. */
  words: number;
  termsCovered: string[];
  termsMissing: string[];
  /** Whether the passage is a heading-adjacent paragraph (first paragraph under a heading). */
  underHeading: string | null;
};

/** A term matches a token when either is a prefix of the other (crude stemming: "pricing" ~ "price"). */
export function termMatches(term: string, token: string): boolean {
  if (term === token) return true;
  if (term.length < 4 || token.length < 4) return false;
  const [a, b] = term.length <= token.length ? [term, token] : [token, term];
  return b.startsWith(a) && b.length - a.length <= 3;
}

export function coverageOf(qTerms: string[], text: string) {
  const tokens = new Set(normalized(text).split(" ").filter(Boolean));
  const covered = qTerms.filter((t) => {
    if (tokens.has(t)) return true;
    for (const tok of tokens) if (termMatches(t, tok)) return true;
    return false;
  });
  return {
    covered,
    missing: qTerms.filter((t) => !covered.includes(t)),
    coverage: qTerms.length
      ? Math.round((covered.length / qTerms.length) * 100)
      : 0,
  };
}

type Block = { text: string; wordOffset: number; heading: string | null };

/** Split markdown-ish extracted text into prose blocks, skipping code, headings, and link-only navigation lines. */
export function proseBlocks(text: string): Block[] {
  const clean = text
    .replace(/```[\s\S]*?```/g, "\n")
    .replace(/~~~[\s\S]*?~~~/g, "\n");
  const blocks: Block[] = [];
  let offset = 0,
    heading: string | null = null;
  for (const raw of clean.split(/\n\s*\n/)) {
    const para = raw.trim();
    const words = para ? para.split(/\s+/).length : 0;
    if (!para) continue;
    const h = /^#{1,6}\s+(.+)$/m.exec(para);
    if (/^#{1,6}\s/.test(para) && para.split("\n").length === 1) {
      heading = h ? h[1].trim() : heading;
      offset += words;
      continue;
    }
    // Link-only / navigation lines: mostly markdown links or very short bullets.
    const stripped = para
      .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
      .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
      .replace(/[*_>`#|-]+/g, " ")
      .trim();
    const linkCount = (para.match(/\]\(/g) || []).length;
    const isNav = linkCount >= 3 && stripped.split(/\s+/).length < linkCount * 4;
    if (!isNav && stripped.split(/\s+/).length >= 6)
      blocks.push({ text: stripped.replace(/\s+/g, " "), wordOffset: offset, heading });
    offset += words;
  }
  return blocks;
}

/** Shell commands, env vars, JSON fragments and pricing-card word salads are not quotable answers. */
export function looksLikeCode(s: string): boolean {
  const tokens = s.split(/\s+/);
  let codey = 0;
  for (const t of tokens) {
    if (/^[$]|[=`;{}<>|]|^(echo|export|npm|pip|curl|npx|git|cd|sudo|set)$/.test(t)) codey += 2;
    else if (/^[A-Z0-9_]{4,}$/.test(t) || /_/.test(t)) codey += 0.5;
  }
  return codey / Math.max(1, tokens.length) > 0.12;
}
function sentenceLike(s: string): boolean {
  const verb = new RegExp("\\b(is|are|was|were|has|have|can|will|lets|helps|includes|starts|costs|offers|provides|means)\\b", "i");
  const words = s.trim().split(/\s+/).length;
  return /[.!?]["”)]?$/.test(s.trim()) || (words >= 8 && verb.test(s));
}
function sentences(t: string): string[] {
  return t
    .split(/(?<=[.!?])\s+(?=[A-Z0-9"“(])/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * Find the passage with the highest query-term coverage, preferring earlier, shorter windows.
 * Windows are 1-3 consecutive sentences inside a prose block.
 */
export function findAnswerPassage(
  text: string,
  query: string,
): AnswerPassage | null {
  const qTerms = terms(query);
  const totalWords = normalized(text).split(" ").filter(Boolean).length;
  if (!qTerms.length || !totalWords) return null;
  let best: AnswerPassage | null = null,
    bestKey = -Infinity;
  const consider = (candidate: string, wordOffset: number, heading: string | null) => {
    const words = candidate.split(/\s+/).length;
    if (words < 5) return;
    const c = coverageOf(qTerms, candidate);
    if (c.coverage === 0 || looksLikeCode(candidate)) return;
    const position = Math.round((wordOffset / Math.max(1, totalWords)) * 100);
    // score: coverage first (a real sentence beats a fragment at equal coverage), then earlier, then shorter
    const key = c.coverage * 10000 + (sentenceLike(candidate) ? 2500 : 0) - position * 10 - Math.min(words, 200) / 20;
    if (key > bestKey) {
      bestKey = key;
      best = {
        text: candidate.length > 700 ? candidate.slice(0, 700) + "…" : candidate,
        coverage: c.coverage,
        wordOffset,
        position,
        totalWords,
        words,
        termsCovered: c.covered,
        termsMissing: c.missing,
        underHeading: heading,
      };
    }
  };
  for (const block of proseBlocks(text)) {
    // Drop shell/code sentences before windowing so a 2-3 sentence window cannot smuggle one in.
    const ss = sentences(block.text).filter((x) => !looksLikeCode(x));
    if (!ss.length) continue;
    let cursor = block.wordOffset;
    const offsets = ss.map((s) => {
      const o = cursor;
      cursor += s.split(/\s+/).length;
      return o;
    });
    for (let i = 0; i < ss.length; i++)
      for (let n = 1; n <= 3 && i + n <= ss.length; n++)
        consider(ss.slice(i, i + n).join(" "), offsets[i], block.heading);
    if (ss.length > 3) consider(block.text, block.wordOffset, block.heading);
  }
  return best;
}
