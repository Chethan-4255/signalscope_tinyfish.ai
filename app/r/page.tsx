"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { Radar, LoaderCircle, AlertTriangle } from "lucide-react";
import { decodeAudit } from "../../lib/share";
import type { Audit } from "../../lib/audit-model";
import { AuditReport } from "../../components/audit-report";

export default function SharedReport() {
  const [report, setReport] = useState<Audit | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    const data = location.hash.slice(1);
    (data ? decodeAudit(data) : Promise.reject(new Error("This link has no report data after the #.")))
      .then((a) => setReport({ ...a, shared: true }))
      .catch((e) => setError(e instanceof Error ? e.message : "Could not decode this report."));
  }, []);
  return (
    <div className="shell">
      <aside>
        <Link className="brand" href="/"><Radar />SignalScope<span>AI</span></Link>
        <div className="rail-label">SHARED REPORT</div>
        <div className="rail-note">This report was decoded from the link itself. Nothing is stored on a server.</div>
        <Link className="rail-button" href="/">Run your own audit</Link>
        <div className="rail-bottom">POWERED BY<br /><strong>TinyFish</strong><p>Search · Fetch · Agent</p></div>
      </aside>
      <main>
        <header>
          <span>Workspace / <b>Shared report</b></span>
          <span className="live-label">READ-ONLY</span>
        </header>
        {!report && !error && (
          <section className="progress panel"><h2><LoaderCircle className="spin" size={21} /> Decoding report…</h2></section>
        )}
        {error && (
          <div role="alert" className="error"><AlertTriangle size={20} /><div>{error}</div></div>
        )}
        {report && <AuditReport report={report} readOnly />}
        <footer>SignalScope <span>Live evidence. Clear next steps.</span><Link href="/">Home</Link></footer>
      </main>
    </div>
  );
}
