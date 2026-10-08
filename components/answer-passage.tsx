import { Quote } from "lucide-react";
import type { Audit } from "../lib/audit-model";
import { Highlight } from "./highlight";

export function AnswerPassageCard({ report }: { report: Audit }) {
  const a = report.answer;
  const terms = report.metrics.queryTerms;
  return (
    <section className="panel answer-card">
      <div className="section-heading">
        <div>
          <span className="eyebrow">ANSWER-ABILITY</span>
          <h2>The passage an AI would quote for “{report.query}”</h2>
        </div>
        {a && <span className={"badge " + (a.coverage >= 80 ? "good" : a.coverage >= 50 ? "warn" : "review")}>{a.coverage}% coverage</span>}
      </div>
      {!report.page ? (
        <p className="muted">No extraction available, so no passage can be selected.</p>
      ) : !a ? (
        <p>No paragraph contains the query terms {terms.map((t) => `“${t}”`).join(", ")}. Add a direct one-sentence answer under the H1.</p>
      ) : (
        <>
          <blockquote className="answer-quote">
            <Quote size={18} />
            <Highlight text={a.text} terms={terms} />
          </blockquote>
          <div className="answer-meta">
            <div><span>POSITION</span><strong>{a.position}%</strong><small>word {a.wordOffset.toLocaleString()} of {a.totalWords.toLocaleString()}{a.underHeading ? ` · under “${a.underHeading}”` : ""}</small></div>
            <div><span>LENGTH</span><strong>{a.words} words</strong><small>{a.words <= 60 ? "concise enough to quote whole" : a.words <= 120 ? "borderline; will be truncated" : "too long to quote whole"}</small></div>
            <div><span>COVERS</span><strong>{a.termsCovered.length}/{a.termsCovered.length + a.termsMissing.length}</strong><small>{a.termsMissing.length ? `missing: ${a.termsMissing.join(", ")}` : "every query term present"}</small></div>
          </div>
          <div className="position-track" aria-hidden><i style={{ left: `${Math.min(98, a.position)}%` }} /></div>
          {a.coverage < 50 && <p className="muted">Below 50% coverage an answer engine is unlikely to lift this passage. Write a sentence that answers the question directly, using the missing terms.</p>}
        </>
      )}
    </section>
  );
}
