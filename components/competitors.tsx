"use client";
import { useState } from "react";
import { ExternalLink } from "lucide-react";
import type { Audit } from "../lib/audit-model";
import { INTENT_LABEL, classifyHit } from "../lib/serp";

export function IntentMix({ report }: { report: Audit }) {
  const mix = report.serp.intent;
  const total = mix.reduce((n, m) => n + m.count, 0);
  if (!total) return null;
  const own = INTENT_LABEL[classifyHit({ url: report.url, title: report.page?.title || "", snippet: "", position: 0 })];
  return (
    <section className="panel intent-mix">
      <div className="section-heading">
        <div>
          <span className="eyebrow">SERP INTENT MIX</span>
          <h2>What format ranks for “{report.query}”</h2>
        </div>
        <span>{total} results classified by domain + path</span>
      </div>
      <div className="intent-bar" aria-hidden>
        {mix.map((m) => <span key={m.kind} className={"intent " + m.kind} style={{ width: `${m.share}%` }} title={`${m.label}: ${m.count}`} />)}
      </div>
      <ul className="intent-legend">
        {mix.map((m) => <li key={m.kind}><i className={"intent " + m.kind} />{m.label} <b>{m.count}</b></li>)}
      </ul>
      <p className="muted">
        {mix[0] && mix[0].share >= 50
          ? `The engine strongly prefers ${mix[0].label.toLowerCase()} pages for this query. If your page is a different format, match that intent or target a different query.`
          : "Mixed intent: several formats rank, so a well-structured page of any type can compete."}
        {own ? ` Your page classifies as ${own.toLowerCase()}.` : ""}
      </p>
    </section>
  );
}

export function CompetitorTable({ report }: { report: Audit }) {
  const [openIdx, setOpenIdx] = useState<number | null>(null);
  const you = {
    host: new URL(report.url).hostname.replace(/^www\./, ""),
    title: report.page?.title || "(no title)",
    position: report.metrics.rank,
    words: report.metrics.words,
    headings: report.metrics.headings.length,
    hasOg: report.headAudit ? !!(report.headAudit.og.title && report.headAudit.og.description && report.headAudit.og.image) : null,
    jsonLd: report.headAudit ? report.headAudit.jsonLd.types.join(", ") || "none" : "n/a",
    description: report.headAudit?.description ?? report.page?.description ?? null,
    answerCoverage: report.answer?.coverage ?? (report.page ? 0 : null),
  };
  const cell = (v: boolean | null, yes = "Yes", no = "No") => (v === null ? <span className="muted">n/a</span> : v ? <span className="ok">{yes}</span> : <span className="bad">{no}</span>);
  const best = Math.max(you.answerCoverage ?? 0, ...report.competitors.map((c) => c.answerCoverage ?? 0));
  return (
    <section className="panel competitors">
      <div className="section-heading">
        <div>
          <span className="eyebrow">COMPETING RESULTS · LIVE FETCH</span>
          <h2>How the pages that rank compare</h2>
        </div>
        <span>{report.competitors.length} organic competitors (social, forum and video results excluded)</span>
      </div>
      {!report.competitors.length ? (
        <p className="muted">{report.competitorError || "No competing organic result on another host appeared in the samples."}</p>
      ) : (
        <div className="table-wrap">
          <table className="compare-table">
            <thead>
              <tr><th>Page</th><th>Pos.</th><th>Words</th><th>Headings</th><th>Meta desc.</th><th>Open Graph</th><th>JSON-LD</th><th>Answer coverage</th></tr>
            </thead>
            <tbody>
              <tr className="you">
                <td><b>You</b> · {you.host}<br /><small>{you.title}</small></td>
                <td>{you.position ? `#${you.position}` : "—"}</td>
                <td>{you.words.toLocaleString()}</td>
                <td>{you.headings}</td>
                <td>{cell(you.description === null ? null : you.description.length > 0)}</td>
                <td>{cell(you.hasOg)}</td>
                <td><small>{you.jsonLd}</small></td>
                <td>{you.answerCoverage === null ? "n/a" : <b className={you.answerCoverage >= best ? "ok" : ""}>{you.answerCoverage}%</b>}</td>
              </tr>
              {report.competitors.map((c, i) => (
                <tr key={c.url} className={c.words ? "" : "unread"}>
                  <td>
                    <a href={c.url} target="_blank" rel="noreferrer">{c.host} <ExternalLink size={11} /></a> <small className="kind">{INTENT_LABEL[c.kind]}</small><br />
                    <small>{c.title}</small>
                    {c.answerPassage && (
                      <button className="text-button" onClick={() => setOpenIdx(openIdx === i ? null : i)}>{openIdx === i ? "Hide passage" : "Their answer passage"}</button>
                    )}
                    {openIdx === i && c.answerPassage && <blockquote>{c.answerPassage}</blockquote>}
                  </td>
                  <td>#{c.position}</td>
                  <td>{c.words ? c.words.toLocaleString() : <span className="muted">blocked</span>}</td>
                  <td>{c.words ? c.headings : "—"}</td>
                  <td>{c.words ? cell(!!c.description) : "—"}</td>
                  <td>{c.words ? cell(c.hasOg) : "—"}</td>
                  <td><small className="muted">not read</small></td>
                  <td>{c.answerCoverage === null ? "—" : <b className={c.answerCoverage >= best && best > 0 ? "ok" : ""}>{c.answerCoverage}%</b>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="muted">Answer coverage = share of query terms in the single best passage of each page. Competitor JSON-LD is not read (they are fetched as Markdown). A position does not prove its structure caused the ranking.</p>
    </section>
  );
}
