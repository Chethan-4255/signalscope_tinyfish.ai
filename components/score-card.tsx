"use client";
import { useState } from "react";
import { ChevronDown } from "lucide-react";
import type { Score } from "../lib/score";
import { verdict } from "../lib/score";

const COLORS: Record<string, string> = {
  search: "#2455df",
  extraction: "#057b66",
  metadata: "#b7791f",
  answer: "#7c3aed",
};

export function ScoreRing({ total, grade, size = 148 }: { total: number | null; grade: string; size?: number }) {
  const r = (size - 14) / 2, c = 2 * Math.PI * r;
  const pct = total ?? 0;
  const color = total === null ? "#94a3b8" : total >= 70 ? "#057b66" : total >= 40 ? "#b7791f" : "#b8463d";
  return (
    <svg className="score-ring" width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={`AI visibility score ${total ?? "unknown"} out of 100`}>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#e5eaf2" strokeWidth="12" />
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth="12" strokeLinecap="round" strokeDasharray={`${(pct / 100) * c} ${c}`} transform={`rotate(-90 ${size / 2} ${size / 2})`} />
      <text x="50%" y="48%" textAnchor="middle" fontSize={size / 3.6} fontWeight="700" fill="#152238">{total ?? "?"}</text>
      <text x="50%" y="66%" textAnchor="middle" fontSize={size / 10} fill="#64748b">/100 · {grade}</text>
    </svg>
  );
}

export function ScoreCard({ score, summary }: { score: Score; summary: string }) {
  const [open, setOpen] = useState<string | null>(null);
  return (
    <section className="score-card panel">
      <div className="score-main">
        <ScoreRing total={score.total} grade={score.grade} />
        <div className="score-text">
          <span className="eyebrow">AI VISIBILITY SCORE · {score.confidence}% OF CHECKS MEASURABLE</span>
          <h2>{verdict(score)}</h2>
          <p className="summary">{summary}</p>
          <div className="stacked" aria-hidden>
            {score.groups.map((g) => (
              <span
                key={g.id}
                title={`${g.label}: ${g.score ?? "n/a"}/${g.max}`}
                style={{ width: `${g.max}%`, background: g.score === null ? "#cbd5e1" : `linear-gradient(90deg, ${COLORS[g.id]} ${(g.score / g.max) * 100}%, #e5eaf2 ${(g.score / g.max) * 100}%)` }}
              />
            ))}
          </div>
        </div>
      </div>
      <div className="score-groups">
        {score.groups.map((g) => (
          <div key={g.id} className={"score-group" + (open === g.id ? " open" : "")}>
            <button onClick={() => setOpen(open === g.id ? null : g.id)} aria-expanded={open === g.id}>
              <span className="dot" style={{ background: COLORS[g.id] }} />
              <b>{g.label}</b>
              <span className="bar"><i style={{ width: g.score === null ? 0 : `${(g.score / g.max) * 100}%`, background: COLORS[g.id] }} /></span>
              <strong>{g.score === null ? "n/a" : `${g.score}/${g.max}`}</strong>
              <ChevronDown size={16} />
            </button>
            {open === g.id && (
              <ul>
                {g.items.map((it) => (
                  <li key={it.id} className={it.points === null ? "unknown" : it.points >= it.max ? "full" : it.points > 0 ? "part" : "zero"}>
                    <span>{it.points === null ? "–" : `${it.points}/${it.max}`}</span>
                    <div>
                      <b>{it.label}</b>
                      <small>{it.evidence}{it.points === null ? " (excluded from score, not counted as zero)" : ""}</small>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}
