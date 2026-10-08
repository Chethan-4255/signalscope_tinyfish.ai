import { ShieldCheck, ShieldOff, FileCode2 } from "lucide-react";
import type { Audit } from "../lib/audit-model";

const show = (v: string | null | undefined, max = 160) => (v ? (v.length > max ? v.slice(0, max - 1) + "…" : v) : null);

export function HeadAuditPanel({ report }: { report: Audit }) {
  const h = report.headAudit;
  const row = (label: string, value: string | null | undefined, ok: boolean | null, hint?: string) => (
    <div className="receipt" key={label}>
      <span className={"badge " + (ok === null ? "neutral" : ok ? "good" : "review")}>{ok === null ? "info" : ok ? "ok" : "fix"}</span>
      <div><b>{label}</b><p>{value || <span className="muted">absent</span>}{hint && <small> — {hint}</small>}</p></div>
    </div>
  );
  return (
    <section className="panel">
      <div className="section-heading">
        <div><span className="eyebrow">RAW HTML &lt;HEAD&gt; AUDIT · TINYFISH FETCH (format: html)</span><h2><FileCode2 size={20} /> What the source declares</h2></div>
        {h && <span>{h.htmlBytes.toLocaleString()} bytes · ≈{h.bodyTextWords.toLocaleString()} body words</span>}
      </div>
      {!h ? (
        <p className="muted">{report.headError || "Raw HTML was not fetched."}</p>
      ) : (
        <>
          {row("<title>", h.title, !!h.title && h.title.length >= 30 && h.title.length <= 60, h.title ? `${h.title.length} chars (target 30-60)` : undefined)}
          {row("meta description", show(h.description, 220), !!h.description && h.description.length >= 70 && h.description.length <= 160, h.description ? `${h.description.length} chars (target 70-160)` : undefined)}
          {row("meta robots", h.robots, !h.noindex, h.robots ? undefined : "no tag = index, follow")}
          {row("canonical", h.canonical, !!h.canonical)}
          {row("hreflang", h.hreflang.length ? h.hreflang.map((x) => x.lang).join(", ") : null, null)}
          {row("og:title / og:description / og:image", [h.og.title, show(h.og.description, 80), h.og.image ? "image ✓" : null].filter(Boolean).join(" · ") || null, !!(h.og.title && h.og.description && h.og.image))}
          {row("twitter:card", h.twitter.card, !!h.twitter.card)}
          {row("JSON-LD @type", h.jsonLd.blocks ? `${h.jsonLd.types.join(", ") || "(no @type parsed)"}${h.jsonLd.invalid ? ` · ${h.jsonLd.invalid} invalid block(s)` : ""}` : null, h.jsonLd.types.length > 0 && !h.jsonLd.invalid)}
          {row("<html lang>", h.lang, !!h.lang)}
          {row("viewport", h.viewport, !!h.viewport)}
          {row("H1", h.h1.join(" | ") || null, h.h1.length === 1, `${h.h1.length} found`)}
          {h.headings.length > 0 && (
            <details className="outline">
              <summary>Heading outline ({h.headings.length} headings, {h.skippedLevels.length} level skips)</summary>
              <ol>
                {h.headings.slice(0, 60).map((x, i) => (
                  <li key={i} style={{ paddingLeft: (x.level - 1) * 16 }} className={h.skippedLevels.some((s) => s.text === x.text && s.to === x.level) ? "skip" : ""}>
                    <code>h{x.level}</code> {x.text}
                  </li>
                ))}
              </ol>
            </details>
          )}
        </>
      )}
    </section>
  );
}

export function CrawlPolicyPanel({ report }: { report: Audit }) {
  const p = report.crawlPolicy;
  const status = (s: string) => <span className={"badge " + (s === "present" || s === "index" ? "good" : s === "missing" ? "review" : "neutral")}>{s}</span>;
  return (
    <section className="panel crawl-policy">
      <div className="section-heading">
        <div><span className="eyebrow">AI-CRAWLER POLICY · TINYFISH FETCH OF robots.txt, llms.txt, sitemap.xml</span><h2>Who is allowed to read this path</h2></div>
        {p && <span>{p.origin}</span>}
      </div>
      {!p ? (
        <p className="muted">{report.crawlError || "Crawl policy was not probed."}</p>
      ) : (
        <>
          <div className="policy-files">
            <div>{status(p.robots.status)} <b>robots.txt</b><small>{p.robots.status === "present" ? `${p.robots.bytes} bytes${p.robots.sitemaps.length ? ` · declares ${p.robots.sitemaps.length} sitemap(s)` : ""}${p.robots.contentSignal ? ` · Content-Signal: ${p.robots.contentSignal}` : ""}` : p.robots.status === "missing" ? "not found → everything allowed" : "could not fetch"}</small></div>
            <div>{status(p.llms.status)} <b>llms.txt</b><small>{p.llms.status === "present" ? `${p.llms.bytes} bytes${p.llms.mentionsPage ? " · mentions this path" : ""}` : p.llms.status === "missing" ? "not published (optional)" : "could not fetch"}</small></div>
            <div>{status(p.sitemap.status)} <b>sitemap.xml</b><small>{p.sitemap.status === "present" ? `${p.sitemap.urlCount} URLs · ${p.sitemap.listsPage ? "lists this page" : "does NOT list this page"}` : p.sitemap.status === "index" ? "sitemap index (children not expanded)" : p.sitemap.status === "missing" ? "not found" : "could not fetch"}</small></div>
          </div>
          <div className="table-wrap">
            <table className="policy-table">
              <thead><tr><th>Crawler</th><th>Vendor</th><th>Used for</th><th>This path</th><th>Deciding rule</th></tr></thead>
              <tbody>
                {p.robots.rules.map((r) => (
                  <tr key={r.agent} className={r.allowed === false ? "blocked" : ""}>
                    <td><code>{r.agent}</code></td>
                    <td>{r.vendor}</td>
                    <td>{r.use}</td>
                    <td>{r.allowed === null ? <span className="muted">unknown</span> : r.allowed ? <span className="ok"><ShieldCheck size={14} /> Allowed</span> : <span className="bad"><ShieldOff size={14} /> Blocked</span>}</td>
                    <td><small>{r.rule || (r.group ? `group ${r.group}, no matching path` : "no matching group")}</small></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {p.robots.excerpt && (
            <details><summary>robots.txt excerpt</summary><pre className="extraction">{p.robots.excerpt}</pre></details>
          )}
          {p.llms.excerpt && (
            <details><summary>llms.txt excerpt</summary><pre className="extraction">{p.llms.excerpt}</pre></details>
          )}
        </>
      )}
    </section>
  );
}
