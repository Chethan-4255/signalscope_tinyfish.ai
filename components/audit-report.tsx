"use client";
import { useState } from "react";
import { Download, ExternalLink, FileText, RefreshCw, ChevronDown, Activity } from "lucide-react";
import { CopyPrompt, Recommendations } from "./fix-prompts";
import { ScoreCard } from "./score-card";
import { SideBySide } from "./side-by-side";
import { AnswerPassageCard } from "./answer-passage";
import { CompetitorTable, IntentMix } from "./competitors";
import { HeadAuditPanel, CrawlPolicyPanel } from "./technical";
import { ShareBar, SinceLastRun } from "./share-bar";
import { fixPrompt, aiMarkdown } from "../lib/recommendations";
import { evidenceChecks } from "../lib/checks";
import { reportMarkdown, type Audit } from "../lib/audit-model";
import type { Delta } from "../lib/compare";

function download(name: string, text: string, type: string) {
  const u = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement("a");
  a.href = u;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(u), 1000);
}
function SafeLink({ href, children }: { href: string; children: React.ReactNode }) {
  let safe = false;
  try {
    safe = ["http:", "https:"].includes(new URL(href).protocol);
  } catch {}
  return safe ? (
    <a href={href} target="_blank" rel="noreferrer">{children}<ExternalLink size={12} /></a>
  ) : (
    <span>{children}</span>
  );
}

export function AuditReport({
  report,
  onRerun,
  running = false,
  delta = null,
  readOnly = false,
}: {
  report: Audit;
  onRerun?: () => void;
  running?: boolean;
  delta?: Delta | null;
  readOnly?: boolean;
}) {
  const [tab, setTab] = useState("overview"),
    [filter, setFilter] = useState("all");
  const completed = report.stages.filter((s) => s.status === "complete").map((s) => s.endpoint);
  const calls = report.stages.reduce((n, s) => n + s.calls, 0);
  const visible = report.findings.filter((f) => filter === "all" || f.priority === filter);
  return (
    <section className="report">
      {report.status === "partial" && (
        <div className="note">
          <Activity size={18} />
          <div>
            <b>{running ? "Early results — audit still running." : "Partial report — audit did not finish."}</b>
            <p>{running ? "Search, extraction and technical evidence is in. Competitor comparison, browser verification and AI recommendations will appear when ready." : "Completed checks are preserved. Rerun to finish unavailable checks."}</p>
          </div>
        </div>
      )}
      {report.shared && (
        <div className="note">
          <Activity size={18} />
          <div><b>Shared report.</b><p>Decoded from the link in your browser. Nothing was uploaded; re-run the audit for fresh evidence.</p></div>
        </div>
      )}
      <div className="report-heading">
        <div>
          <span className="eyebrow">{new Set(completed).size} TINYFISH ENDPOINTS · {calls} LIVE CALLS</span>
          <h2>{report.page?.title || report.headAudit?.title || new URL(report.url).hostname}</h2>
          <SafeLink href={report.url}>{report.url}</SafeLink>
          <small>{new Date(report.checkedAt).toLocaleString()} · {(report.durationMs / 1000).toFixed(1)}s · Query “{report.query}” ({report.queryMode})</small>
        </div>
        <div className="actions">
          <div>
            <CopyPrompt text={fixPrompt(report)} label={report.status === "partial" ? "Copy available fix plan" : "Copy complete fix plan"} />
          </div>
          <button className="secondary" onClick={() => download("signalscope-report.md", reportMarkdown(report) + "\n\n# AI recommendations\n\n" + aiMarkdown(report), "text/markdown")}>
            <Download size={15} /> Report
          </button>
          <button className="secondary" onClick={() => download("signalscope-evidence.json", JSON.stringify(report, null, 2), "application/json")}>
            <FileText size={15} /> JSON
          </button>
          {onRerun && !readOnly && (
            <button className="icon-button" aria-label="Rerun this audit" onClick={onRerun} disabled={running}><RefreshCw size={17} /></button>
          )}
        </div>
      </div>
      <ScoreCard score={report.score} summary={report.summary} />
      <ShareBar report={report} />
      {delta && <SinceLastRun delta={delta} />}
      <div className="metrics">
        <article>
          <span>SEARCH POSITION</span>
          <strong>{report.searches.find((s) => s.kind === "target")?.error ? "Unavailable" : report.metrics.rank ? "#" + report.metrics.rank : "Not in top " + (report.searches.find((s) => s.kind === "target")?.results.length || 0)}</strong>
          <small>{report.serp.alternate ? `alt phrasing: ${report.serp.alternate.rank ? "#" + report.serp.alternate.rank : "absent"}` : "target query, US/EN sample"}</small>
        </article>
        <article>
          <span>EXTRACTED CONTENT</span>
          <strong>{report.page ? report.metrics.words.toLocaleString() : "Unavailable"}</strong>
          <small>{report.page ? `words · ${report.metrics.headings.length} headings · ${report.metrics.proseRatio === null ? "?" : Math.round(report.metrics.proseRatio * 100) + "%"} prose` : "Fetch did not return a document"}</small>
        </article>
        <article>
          <span>ANSWER COVERAGE</span>
          <strong>{report.answer ? report.answer.coverage + "%" : report.page ? "0%" : "Unknown"}</strong>
          <small>{report.answer ? `best passage at ${report.answer.position}% into page` : "no passage covers the query"}</small>
        </article>
        <article>
          <span>AI CRAWLERS</span>
          <strong>{report.crawlPolicy && report.crawlPolicy.robots.status !== "unavailable" ? `${report.crawlPolicy.robots.rules.filter((r) => r.allowed).length}/${report.crawlPolicy.robots.rules.length}` : "Unknown"}</strong>
          <small>{report.crawlPolicy?.robots.status === "missing" ? "allowed (no robots.txt)" : "allowed for this path"}</small>
        </article>
      </div>
      {report.stages.some((s) => s.status === "failed") && (
        <div className="error">
          <div>
            <b>Partial evidence</b> — {report.stages.filter((s) => s.status === "failed").map((s) => `${s.endpoint}: ${s.error}`).join(" · ")}. Completed checks are preserved.
          </div>
        </div>
      )}
      <nav className="tabs" aria-label="Report sections">
        {[
          ["overview", `Action plan (${report.findings.length})`],
          ["search", "Search visibility"],
          ["evidence", "AI extraction"],
          ["technical", "Technical"],
          ["checks", "Evidence checklist"],
          ["method", "Run details"],
        ].map(([id, label]) => (
          <button key={id} aria-current={tab === id ? "page" : undefined} className={tab === id ? "selected" : ""} onClick={() => setTab(id)}>{label}</button>
        ))}
      </nav>

      {tab === "overview" && (
        <>
          <div className="section-heading">
            <div>
              <h2>Findings</h2>
              <p className="subtle">Each one carries its evidence, why it matters, the exact fix, and how to verify.</p>
            </div>
            <select aria-label="Filter findings" value={filter} onChange={(e) => setFilter(e.target.value)}>
              <option value="all">All priorities</option>
              <option value="high">High priority</option>
              <option value="medium">Medium priority</option>
              <option value="low">Low priority</option>
            </select>
          </div>
          {visible.map((f, i) => (
            <details className="finding" key={f.id} open={i === 0}>
              <summary>
                <span className={"priority " + f.priority}>{f.priority}</span>
                <div>
                  <h3>{f.title}</h3>
                  <span>{f.category} · {f.confidence === "observed" ? "Direct observation" : "Needs investigation"} · {f.id}</span>
                </div>
                <ChevronDown size={18} />
              </summary>
              <div className="finding-body">
                <blockquote>{f.evidence}</blockquote>
                <p>{f.impact}</p>
                <div className="fix-grid">
                  <div><h4>RECOMMENDED FIX</h4><pre className="fix-text">{f.fix}</pre></div>
                  <div><h4>HOW TO VERIFY</h4><p>{f.verify}</p></div>
                </div>
                <div className="recommendation-actions">
                  <CopyPrompt text={fixPrompt(report, { recommendations: [], findings: [f] })} />
                  <SafeLink href={f.source}>Inspect source</SafeLink>
                </div>
              </div>
            </details>
          ))}
          {!visible.length && (
            <div className="panel">
              <h3>No findings in this view</h3>
              <p>The completed checks found no matching issue. Review endpoint failures and audit limits in Run details.</p>
            </div>
          )}
          <Recommendations report={report} />
        </>
      )}

      {tab === "search" && (
        <>
          <SideBySide report={report} />
          <IntentMix report={report} />
          <CompetitorTable report={report} />
          {[...report.searches].sort((x, y) => ["target", "alternate", "discovery"].indexOf(x.kind) - ["target", "alternate", "discovery"].indexOf(y.kind)).map((s) => (
            <div className="panel search-panel" key={s.kind}>
              <div className="section-heading">
                <div>
                  <span className="eyebrow">{s.kind === "target" ? "TARGET QUERY" : s.kind === "alternate" ? "ALTERNATE PHRASING" : "URL DISCOVERY CHECK"}</span>
                  <h2>“{s.query}”</h2>
                </div>
                <span>{s.results.length} results</span>
              </div>
              {s.error ? (
                <p className="error">{s.error}</p>
              ) : (
                s.results.map((h) => {
                  const mine = report.serp.targetHit?.url === h.url || report.serp.discoveryHit?.url === h.url || h.url === report.url || h.url === report.page?.final_url;
                  return (
                    <article className={"search-result" + (mine ? " mine" : "")} key={h.url}>
                      <span className="rank">{h.position}</span>
                      <div>
                        <SafeLink href={h.url}>{h.title}</SafeLink>
                        <div className="source-url">{h.url}{mine ? " · this page" : ""}</div>
                        <p>{h.snippet}</p>
                      </div>
                    </article>
                  );
                })
              )}
            </div>
          ))}
        </>
      )}

      {tab === "evidence" && (
        <>
          <AnswerPassageCard report={report} />
          <div className="panel">
            <div className="section-heading">
              <h2>Extracted document</h2>
              <span>{report.metrics.headings.length} Markdown headings · {report.metrics.words.toLocaleString()} words</span>
            </div>
            <dl className="metadata">
              <dt>Title</dt><dd>{report.page?.title || "Not returned"}</dd>
              <dt>Description</dt><dd>{report.page?.description || "Not returned"}</dd>
              <dt>Language</dt><dd>{report.page?.language || "Not returned"}</dd>
              <dt>Final URL</dt><dd>{report.page?.final_url || report.url}</dd>
              <dt>Headings</dt><dd>{report.metrics.headings.slice(0, 12).join(" · ") || "none"}</dd>
            </dl>
            <details>
              <summary>Read the exact extracted text</summary>
              <pre className="extraction">{report.page?.text || report.fetchError || "No extraction available"}</pre>
            </details>
          </div>
          <div className="section-heading">
            <h2>What a browser sees. What Fetch retains.</h2>
            <span>Normalized exact quote matching</span>
          </div>
          {!report.browser && <div className="note">Browser comparison was not run (deep mode off) or is unavailable.</div>}
          {report.comparisons.map((c, i) => (
            <article className="comparison panel" key={i}>
              <div className="comparison-heading">
                <h3>{c.label}</h3>
                <span className={"badge " + (c.matched ? "good" : "review")}>{c.matched ? "Found in Fetch" : c.overlap >= 85 ? "Wording differs" : "Review possible gap"}</span>
              </div>
              <div className="fix-grid">
                <div><h4>BROWSER OBSERVATION</h4><blockquote>{c.quote}</blockquote><small>After: {c.interaction}</small></div>
                <div><h4>EXTRACTION CHECK</h4><p>{c.matched ? "This exact normalized quote occurs in the extracted text." : `Not found verbatim. ${c.overlap}% of its words occur somewhere in the extraction.`}</p><small>{c.importance}</small></div>
              </div>
            </article>
          ))}
        </>
      )}

      {tab === "technical" && (
        <>
          <HeadAuditPanel report={report} />
          <CrawlPolicyPanel report={report} />
        </>
      )}

      {tab === "checks" && (
        <div className="panel">
          <h2>Checks backed by this run</h2>
          <p>Observed means a signal was returned and passed; review means it was returned and needs a fix; unknown checks are excluded from the score, never counted as failures.</p>
          {evidenceChecks(report).map((c) => (
            <div className="receipt" key={c.name}>
              <span className={"badge " + (c.status === "observed" ? "good" : c.status === "review" ? "review" : "neutral")}>{c.status}</span>
              <div><b>{c.name}</b><p>{c.detail}</p></div>
              <small>{c.group}</small>
            </div>
          ))}
        </div>
      )}

      {tab === "method" && (
        <>
          <div className="panel">
            <h2>Endpoint receipts</h2>
            <p>Every TinyFish call made for this report, with what it was for. Failed calls do not count as evidence.</p>
            {report.stages.map((s, i) => (
              <div className="receipt" key={i}>
                <span className={"badge " + (s.status === "complete" ? "good" : "review")}>{s.endpoint}</span>
                <div><b>{s.purpose}</b><p>{s.error || "Completed"}</p></div>
                <small>{(s.durationMs / 1000).toFixed(1)}s</small>
              </div>
            ))}
          </div>
          <div className="panel">
            <h2>Method</h2>
            <p>
              <b>Search</b> runs the target query, an alternate phrasing and a <code>site:</code> discovery query (US/English). <b>Fetch</b> reads the page twice — as Markdown (what an AI tool extracts) and as raw HTML (what the source declares) — plus <code>robots.txt</code>, <code>llms.txt</code>, <code>sitemap.xml</code> and the top competing results, all with <code>ttl: 0</code>. <b>Agent</b> opens the page in a real browser, samples visible facts and proposes recommendations that are only kept when their evidence quote matches the extracted text.
            </p>
            <p>The score excludes anything that could not be measured instead of counting it as zero; the measurable share is shown next to the score.</p>
            <h3>Limits</h3>
            <ul>{report.limitations.map((l) => <li key={l}>{l}</li>)}</ul>
          </div>
          {report.browser && (
            <div className="panel">
              <h2>Browser activity</h2>
              {!!report.browser.steps?.length && (
                <>
                  <h4>AGENT STEPS</h4>
                  <ol className="agent-steps">{report.browser.steps.map((v, i) => <li key={i}>{v}</li>)}</ol>
                </>
              )}
              <h4>INTERACTIONS</h4>
              <ul>{report.browser.interactions.map((v, i) => <li key={i}>{v}</li>)}</ul>
              {report.browser.barriers.map((b, i) => <p key={i}>{b}</p>)}
              {report.browser.strategy && <p className="muted">{report.browser.strategy}</p>}
            </div>
          )}
        </>
      )}
    </section>
  );
}
