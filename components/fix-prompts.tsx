"use client";
import { useRef, useState } from "react";
import { Copy, Check, X, Download, ChevronDown, Sparkles } from "lucide-react";
import { fixPrompt } from "../lib/recommendations";
import type { Audit } from "../lib/audit-model";
export function CopyPrompt({
  text,
  label = "Copy fix prompt",
}: {
  text: string;
  label?: string;
}) {
  const [copied, setCopied] = useState(false),
    [notice, setNotice] = useState("");
  const dialog = useRef<HTMLDialogElement>(null);
  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      setNotice(
        "Clipboard access is unavailable. Select and copy the prompt below, or download it.",
      );
      dialog.current?.showModal();
    }
  }
  return (
    <>
      <button className="prompt-button" onClick={() => void copy()}>
        {copied ? <Check size={15} /> : <Copy size={15} />}{" "}
        {copied ? "Copied" : label}
      </button>
      <button
        className="text-button"
        onClick={() => {
          setNotice("");
          dialog.current?.showModal();
        }}
      >
        Preview
      </button>
      <span role="status" className="sr-only">
        {copied ? "Fix prompt copied to clipboard" : ""}
      </span>
      <dialog ref={dialog} className="prompt-dialog">
        <div className="section-heading">
          <div>
            <h2>Ready-to-use fix prompt</h2>
            <p>Review it, then paste into your coding agent or CMS workflow.</p>
          </div>
          <button
            className="icon-button"
            aria-label="Close prompt preview"
            onClick={() => dialog.current?.close()}
          >
            <X size={18} />
          </button>
        </div>
        {notice && <p role="status">{notice}</p>}
        <textarea
          aria-label="Fix prompt"
          readOnly
          value={text}
          onFocus={(e) => e.target.select()}
        />
        <div className="dialog-actions">
          <button onClick={() => void copy()}>
            <Copy size={15} />
            Copy prompt
          </button>
          <button
            className="secondary"
            onClick={() => {
              const u = URL.createObjectURL(
                new Blob([text], { type: "text/plain" }),
              );
              const a = document.createElement("a");
              a.href = u;
              a.download = "signalscope-fix-prompt.txt";
              a.click();
              setTimeout(() => URL.revokeObjectURL(u), 1000);
            }}
          >
            <Download size={15} />
            Download
          </button>
        </div>
        <small>Copying a prompt does not modify or publish your website.</small>
      </dialog>
    </>
  );
}
export function Recommendations({ report }: { report: Audit }) {
  const [category, setCategory] = useState("All");
  const ideas = report.browser?.recommendations || [];
  const filtered = ideas.filter(
    (r) =>
      category === "All" ||
      (category === "Quick wins"
        ? r.effort === "small"
        : r.category === category),
  );
  return (
    <section className="ai-board">
      <div className="section-heading">
        <div>
          <span className="eyebrow">YOUR AI OPTIMIZATION PLAN</span>
          <h2>
            <Sparkles size={20} /> Turn this audit into better content.
          </h2>
          <p className="subtle">
            Specific proposals grounded in retrieved evidence. Review before
            applying.
          </p>
        </div>
        <span>{ideas.length} recommendations</span>
      </div>
      {!report.browser ? (
        <div className="panel">
          <p>
            AI recommendations are not available in this report yet. Check the
            run status above. For a basic audit, enable Browser + AI
            recommendations and rerun. Diagnostic findings remain available
            below.
          </p>
        </div>
      ) : !ideas.length ? (
        <div className="panel">
          <p>
            No AI recommendations passed the evidence checks in this run. That
            does not mean the page is fully optimized. Review the deterministic
            findings and endpoint status.
          </p>
        </div>
      ) : (
        <>
          <div
            className="category-filters"
            aria-label="Recommendation categories"
          >
            {[
              "All",
              "Quick wins",
              "Content",
              "AI readability",
              "Search intent",
              "Metadata",
            ].map((c) => (
              <button
                key={c}
                className={category === c ? "active" : ""}
                aria-pressed={category === c}
                onClick={() => setCategory(c)}
              >
                {c}
              </button>
            ))}
          </div>
          {filtered.map((r, i) => (
            <details className="finding ai-finding" open={i === 0} key={r.id}>
              <summary>
                <span className={"priority " + r.priority}>{r.priority}</span>
                <div>
                  <h3>{r.title}</h3>
                  <span>
                    {r.category} ·{" "}
                    {r.effort === "small"
                      ? "Small change"
                      : r.effort === "medium"
                        ? "Moderate effort"
                        : "Larger change"}{" "}
                    · {r.owner} · {r.id}
                  </span>
                </div>
                <ChevronDown size={18} />
              </summary>
              <div className="finding-body">
                <div className="grounding">
                  <span
                    className={
                      "badge " +
                      (r.evidence.validation === "fetch-matched"
                        ? "good"
                        : "review")
                    }
                  >
                    {r.evidence.validation === "fetch-matched"
                      ? "Evidence quote matched Fetch"
                      : "Agent-reported evidence"}
                  </span>
                  <span>Source: {r.evidence.source}</span>
                </div>
                <blockquote>{r.evidence.quote}</blockquote>
                <p>{r.why}</p>
                <div className="fix-grid">
                  <div>
                    <h4>WHAT TO CHANGE</h4>
                    <p>{r.action}</p>
                  </div>
                  <div>
                    <h4>ACCEPTANCE CHECK</h4>
                    <p>{r.verification}</p>
                  </div>
                </div>
                {r.suggestedCopy && (
                  <div className="suggested-copy">
                    <h4>SUGGESTED DRAFT · VERIFY FACTS BEFORE PUBLISHING</h4>
                    <pre>{r.suggestedCopy}</pre>
                  </div>
                )}
                {r.assumptions.length > 0 && (
                  <div className="assumptions">
                    <h4>CONFIRM BEFORE IMPLEMENTING</h4>
                    <ul>
                      {r.assumptions.map((a, j) => (
                        <li key={j}>{a}</li>
                      ))}
                    </ul>
                  </div>
                )}
                <div className="recommendation-actions">
                  <CopyPrompt
                    text={fixPrompt(report, {
                      recommendations: [r],
                      findings: [],
                    })}
                  />
                </div>
              </div>
            </details>
          ))}
          {!filtered.length && (
            <p className="panel">No recommendations in this category.</p>
          )}
        </>
      )}
      {!!report.browser?.rejectedRecommendations && (
        <p className="validation-note">
          {report.browser.rejectedRecommendations} AI proposal(s) were withheld
          because their required fields or supporting quotes could not be
          validated.
        </p>
      )}
      {!!report.browser?.rejectedObservations && (
        <p className="muted">{report.browser.rejectedObservations} browser observations were excluded because they came from another page or lacked a source URL. They do not generate extraction-gap findings.</p>
      )}
    </section>
  );
}
