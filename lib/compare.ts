import type { Audit } from "./audit-model.ts";

export type Delta = {
  previousAt: string;
  score: { before: number | null; after: number | null };
  groups: { id: string; label: string; before: number | null; after: number | null }[];
  rank: { before: number | null; after: number | null };
  words: { before: number; after: number };
  coverage: { before: number | null; after: number | null };
  resolved: string[];
  introduced: string[];
  unchanged: number;
};

const key = (f: Audit["findings"][number]) => f.title.replace(/\d+/g, "#").toLowerCase();

export function compareAudits(prev: Audit, next: Audit): Delta {
  const before = new Map(prev.findings.map((f) => [key(f), f.title]));
  const after = new Map(next.findings.map((f) => [key(f), f.title]));
  return {
    previousAt: prev.checkedAt,
    score: { before: prev.score?.total ?? null, after: next.score?.total ?? null },
    groups: (next.score?.groups || []).map((g) => ({
      id: g.id,
      label: g.label,
      before: prev.score?.groups.find((x) => x.id === g.id)?.score ?? null,
      after: g.score,
    })),
    rank: { before: prev.metrics.rank, after: next.metrics.rank },
    words: { before: prev.metrics.words, after: next.metrics.words },
    coverage: { before: prev.answer?.coverage ?? null, after: next.answer?.coverage ?? null },
    resolved: [...before].filter(([k]) => !after.has(k)).map(([, t]) => t),
    introduced: [...after].filter(([k]) => !before.has(k)).map(([, t]) => t),
    unchanged: [...after].filter(([k]) => before.has(k)).length,
  };
}

const STORE = "signalscope:last:";
export function loadPrevious(url: string): Audit | null {
  try {
    const raw = localStorage.getItem(STORE + url);
    return raw ? (JSON.parse(raw) as Audit) : null;
  } catch {
    return null;
  }
}
export function savePrevious(a: Audit) {
  try {
    const slim = { ...a, page: a.page ? { ...a.page, text: "", links: [] } : null, competitor: null, competitors: [] };
    localStorage.setItem(STORE + a.url, JSON.stringify(slim));
  } catch {}
}
