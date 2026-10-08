"use client";
import { useState } from "react";
import { Link2, Check, Table2, Printer, TrendingUp, TrendingDown, Minus } from "lucide-react";
import type { Audit } from "../lib/audit-model";
import { encodeAudit } from "../lib/share";
import { findingsCsv } from "../lib/export";
import type { Delta } from "../lib/compare";

function download(name: string, text: string, type: string) {
  const u = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement("a");
  a.href = u;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(u), 1000);
}

export function ShareBar({ report }: { report: Audit }) {
  const [state, setState] = useState<"idle" | "busy" | "done" | "error">("idle");
  const [note, setNote] = useState("");
  async function share() {
    setState("busy");
    try {
      const { data, slimmed } = await encodeAudit(report);
      const link = `${location.origin}/r#${data}`;
      try {
        await navigator.clipboard.writeText(link);
        setNote(`Link copied (${Math.round(link.length / 1024)} KB${slimmed ? ", raw text trimmed to fit" : ""}). Nothing was uploaded: the whole report lives in the link itself.`);
      } catch {
        setNote(link);
      }
      setState("done");
      setTimeout(() => setState("idle"), 6000);
    } catch (e) {
      setState("error");
      setNote(e instanceof Error ? e.message : "Could not build the share link.");
    }
  }
  return (
    <div className="share-bar">
      <button className="secondary" onClick={() => void share()} disabled={state === "busy"}>
        {state === "done" ? <Check size={15} /> : <Link2 size={15} />} {state === "busy" ? "Encoding…" : state === "done" ? "Link copied" : "Save & share"}
      </button>
      <button className="secondary" onClick={() => download("signalscope-findings.csv", findingsCsv(report), "text/csv")}><Table2 size={15} /> CSV</button>
      <button className="secondary" onClick={() => window.print()}><Printer size={15} /> Print / PDF</button>
      {note && <small className="share-note">{note}</small>}
    </div>
  );
}

function Trend({ before, after, higherIsBetter = true, suffix = "" }: { before: number | null; after: number | null; higherIsBetter?: boolean; suffix?: string }) {
  if (before === null || after === null) return <span className="muted">{before ?? "—"}{suffix} → {after ?? "—"}{suffix}</span>;
  const d = after - before;
  const good = d === 0 ? null : higherIsBetter ? d > 0 : d < 0;
  return (
    <span className={good === null ? "" : good ? "ok" : "bad"}>
      {before}{suffix} → <b>{after}{suffix}</b> {d === 0 ? <Minus size={13} /> : good ? <TrendingUp size={13} /> : <TrendingDown size={13} />} {d > 0 ? "+" : ""}{Math.round(d * 10) / 10}
    </span>
  );
}

export function SinceLastRun({ delta }: { delta: Delta }) {
  return (
    <section className="panel since-last">
      <div className="section-heading">
        <div><span className="eyebrow">SINCE LAST RUN · {new Date(delta.previousAt).toLocaleString()}</span><h2>Before / after</h2></div>
        <span>Stored in this browser only</span>
      </div>
      <div className="delta-grid">
        <div><span>SCORE</span><Trend before={delta.score.before} after={delta.score.after} /></div>
        <div><span>SEARCH POSITION</span>{delta.rank.before === null && delta.rank.after === null ? <span className="muted">not observed → not observed</span> : <Trend before={delta.rank.before} after={delta.rank.after} higherIsBetter={false} />}</div>
        <div><span>EXTRACTED WORDS</span><Trend before={delta.words.before} after={delta.words.after} /></div>
        <div><span>ANSWER COVERAGE</span><Trend before={delta.coverage.before} after={delta.coverage.after} suffix="%" /></div>
        {delta.groups.map((g) => <div key={g.id}><span>{g.label.toUpperCase()}</span><Trend before={g.before} after={g.after} /></div>)}
      </div>
      <div className="fix-grid">
        <div>
          <h4>RESOLVED ({delta.resolved.length})</h4>
          {delta.resolved.length ? <ul>{delta.resolved.map((t) => <li key={t} className="ok">{t}</li>)}</ul> : <p className="muted">Nothing resolved yet.</p>}
        </div>
        <div>
          <h4>NEW ({delta.introduced.length}) · UNCHANGED {delta.unchanged}</h4>
          {delta.introduced.length ? <ul>{delta.introduced.map((t) => <li key={t} className="bad">{t}</li>)}</ul> : <p className="muted">No new findings.</p>}
        </div>
      </div>
    </section>
  );
}
