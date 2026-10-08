import { Search, ScanText } from "lucide-react";
import type { Audit } from "../lib/audit-model";
import { coverageOf } from "../lib/answerability";
import { Highlight } from "./highlight";

export function SideBySide({ report }: { report: Audit }) {
  const hit = report.serp.targetHit || report.serp.discoveryHit;
  const terms = report.metrics.queryTerms;
  const page = report.page;
  const extracted = page ? page.text.replace(/\s+/g, " ").trim().slice(0, 320) : "";
  const serpCov = hit ? coverageOf(terms, hit.title + " " + hit.snippet) : null;
  const aiCov = page ? coverageOf(terms, [page.title, page.description, extracted].filter(Boolean).join(" ")) : null;
  const onlyInSerp = serpCov && aiCov ? serpCov.covered.filter((t) => !aiCov.covered.includes(t)) : [];
  const onlyInAi = serpCov && aiCov ? aiCov.covered.filter((t) => !serpCov.covered.includes(t)) : [];
  const titleDiffers = hit && page?.title && hit.title.trim() !== page.title.trim();
  return (
    <section className="panel side-by-side">
      <div className="section-heading">
        <div>
          <span className="eyebrow">WHAT SEARCH SHOWS VS WHAT AI EXTRACTS</span>
          <h2>Two views of the same URL</h2>
        </div>
        <span>Query terms highlighted</span>
      </div>
      <div className="sbs-grid">
        <article>
          <h4><Search size={15} /> SEARCH RESULT {hit ? `· #${hit.position} ${report.serp.targetHit ? "for the target query" : "for the site: query"}` : ""}</h4>
          {hit ? (
            <>
              <div className="serp-title"><Highlight text={hit.title} terms={terms} /></div>
              <div className="source-url">{hit.url}</div>
              <p><Highlight text={hit.snippet || "(no snippet returned)"} terms={terms} /></p>
              <small>{serpCov?.coverage ?? 0}% of query terms in title + snippet</small>
            </>
          ) : (
            <p className="muted">This URL did not appear in either search sample, so there is no SERP title or snippet to compare. The AI view below is what an assistant would read if it found the page another way.</p>
          )}
        </article>
        <article>
          <h4><ScanText size={15} /> AI FETCH EXTRACTION</h4>
          {page ? (
            <>
              <div className="serp-title"><Highlight text={page.title || "(no title)"} terms={terms} /></div>
              <div className="source-url">{page.final_url || page.url}</div>
              <p className="desc"><Highlight text={page.description || "(no description returned)"} terms={terms} /></p>
              <p className="extract"><Highlight text={extracted} terms={terms} />{page.text.length > 320 ? "…" : ""}</p>
              <small>{aiCov?.coverage ?? 0}% of query terms in title + description + opening text</small>
            </>
          ) : (
            <p className="muted">{report.fetchError || "Fetch returned nothing."}</p>
          )}
        </article>
      </div>
      {(onlyInSerp.length > 0 || onlyInAi.length > 0 || titleDiffers) && (
        <div className="sbs-notes">
          {titleDiffers && <p>Search shows the title <b>“{hit!.title}”</b> while the page itself declares <b>“{page!.title}”</b> — Google is rewriting your title.</p>}
          {onlyInSerp.length > 0 && <p>Your snippet mentions <b>{onlyInSerp.join(", ")}</b> but the extracted opening text never does — the search engine is finding relevance that AI tools cannot see.</p>}
          {onlyInAi.length > 0 && <p>The extracted text mentions <b>{onlyInAi.join(", ")}</b> but your search snippet does not — put these terms in the meta description so the SERP reflects them.</p>}
        </div>
      )}
    </section>
  );
}
