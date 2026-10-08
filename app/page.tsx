"use client";
import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import {
  Radar,
  Search,
  ScanText,
  MousePointer2,
  Settings2,
  Activity,
  KeyRound,
  LoaderCircle,
  AlertTriangle,
  Check,
  X,
} from "lucide-react";
import { type Audit, type Stage } from "../lib/audit-model";
import { AuditReport } from "../components/audit-report";
import { compareAudits, loadPrevious, savePrevious, type Delta } from "../lib/compare";
const examples = [
  {
    name: "Developer docs",
    url: "https://docs.tinyfish.ai/quick-start",
    query: "tinyfish quick start",
  },
  {
    name: "Student job finder",
    url: "https://firstrole-tinyfish-ai.vercel.app/",
    query: "live job finder for students",
  },
  {
    name: "Product page",
    url: "https://linear.app/pricing",
    query: "linear pricing",
  },
];
export default function Home() {
  const [url, setUrl] = useState(""),
    [query, setQuery] = useState(""),
    [deep, setDeep] = useState(true),
    [key, setKey] = useState(""),
    [settings, setSettings] = useState(false),
    [configured, setConfigured] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [report, setReport] = useState<Audit | null>(null),
    [log, setLog] = useState<string[]>([]),
    [stages, setStages] = useState<Stage[]>([]),
    [extraction, setExtraction] = useState<{ words: number; title: string } | null>(null),
    [agentSteps, setAgentSteps] = useState<string[]>([]),
    [delta, setDelta] = useState<Delta | null>(null);
  const abort = useRef<AbortController | null>(null),
    lock = useRef(false);
  useEffect(() => {
    fetch("/api/health")
      .then((r) => r.json())
      .then((d) => setConfigured(!!(d as { configured?: boolean }).configured))
      .catch(() => {});
    return () => abort.current?.abort();
  }, []);
  async function run(overrides?: { url: string; query: string }) {
    if (lock.current) return;
    lock.current = true;
    const target = overrides?.url ?? url,
      q = overrides?.query ?? query;
    setError("");
    setBusy(true);
    setReport(null);
    setLog([]);
    setStages([]);
    setExtraction(null);
    setAgentSteps([]);
    setDelta(null);
    abort.current = new AbortController();
    try {
      const res = await fetch("/api/audit", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(key ? { "x-tinyfish-key": key } : {}),
        },
        body: JSON.stringify({ url: target, query: q, deep }),
        signal: abort.current.signal,
      });
      if (!res.ok) {
        const d = (await res.json()) as { error?: string };
        throw new Error(d.error || "Unable to start the audit.");
      }
      const reader = res.body?.getReader();
      if (!reader) throw new Error("No audit stream returned.");
      const decoder = new TextDecoder();
      let pending = "",
        complete = false;
      function event(line: string) {
        if (!line.trim()) return;
        const e = JSON.parse(line);
        if (e.type === "progress") {
          setLog((l) =>
            l.at(-1) === e.message ? l : [...l, e.message].slice(-12),
          );
          if (typeof e.agentStep === "string")
            setAgentSteps((s) => (s.at(-1) === e.agentStep ? s : [...s, e.agentStep]));
        }
        if (e.type === "extraction")
          setExtraction({ words: e.words, title: e.title });
        if (e.type === "stage") setStages((s) => [...s, e.stage]);
        if (e.type === "error") throw new Error(e.message);
        if (e.type === "partial") setReport(e.report);
        if (e.type === "result") {
          const final = e.report as Audit;
          const previous = loadPrevious(final.url);
          setDelta(previous ? compareAudits(previous, final) : null);
          savePrevious(final);
          setReport(final);
          complete = true;
        }
      }
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        pending += decoder.decode(value, { stream: true });
        const lines = pending.split("\n");
        pending = lines.pop() || "";
        lines.forEach(event);
      }
      if (pending) event(pending);
      if (!complete)
        throw new Error(
          "The connection closed before a final report. Please rerun the audit.",
        );
    } catch (e) {
      setError(
        e instanceof Error && e.name === "AbortError"
          ? "Audit stopped. A browser run already submitted to TinyFish may continue until its timeout."
          : e instanceof Error
            ? e.message
            : "Audit failed.",
      );
    } finally {
      setBusy(false);
      lock.current = false;
    }
  }
  useEffect(() => {
    const context = (
      document as unknown as {
        modelContext?: {
          registerTool: (
            tool: unknown,
            options: unknown,
          ) => Promise<void> | void;
        };
      }
    ).modelContext;
    if (!context) return;
    const lifecycle = new AbortController();
    Promise.resolve(
      context.registerTool(
        {
          name: "prepare_page_audit",
          description:
            "Fill the visible audit URL and optional target query. Does not start a paid audit. Use the Run audit button to execute.",
          inputSchema: {
            type: "object",
            properties: { url: { type: "string" }, query: { type: "string" } },
            required: ["url"],
            additionalProperties: false,
          },
          annotations: { readOnlyHint: false, untrustedContentHint: false },
          execute(input: unknown) {
            const x = input as { url?: unknown; query?: unknown };
            if (
              typeof x.url !== "string" ||
              !/^https?:\/\//.test(x.url) ||
              x.url.length > 2048 ||
              (x.query !== undefined &&
                (typeof x.query !== "string" || x.query.length > 240))
            )
              throw new Error("Provide an HTTP(S) URL and optional query.");
            if (lock.current) throw new Error("An audit is running.");
            setUrl(x.url);
            setQuery(typeof x.query === "string" ? x.query : "");
            return { prepared: true, url: x.url };
          },
        },
        { signal: lifecycle.signal },
      ),
    ).catch(() => {});
    return () => lifecycle.abort();
  }, []);
  return (
    <div className="shell">
      <aside>
        <Link className="brand" href="/">
          <Radar />
          SignalScope<span>AI</span>
        </Link>
        <div className="rail-label">WORKSPACE</div>
        <div className="rail-active">
          <Activity size={18} /> Page auditor
        </div>
        <button className="rail-button" onClick={() => setSettings((v) => !v)}>
          <KeyRound size={17} /> Connection settings
        </button>
        <div className="rail-note">
          A clear view of the gap between being online and being understood.
        </div>
        <div className="rail-bottom">
          POWERED BY
          <br />
          <strong>TinyFish</strong>
          <p>Search · Fetch · Agent</p>
        </div>
      </aside>
      <main>
        <header>
          <span>
            Workspace / <b>Page auditor</b>
          </span>
          <span className="live-label">LIVE WEB AUDIT</span>
        </header>
        <section className="intro">
          <div>
            <div className="eyebrow">
              SEARCH VISIBILITY, MEET AI READABILITY
            </div>
            <h1>See your page through AI.</h1>
            <p>
              Find what search sees, what AI can read, and what gets lost in
              between.
            </p>
          </div>
          <button
            aria-label="Connection settings"
            className="icon-button"
            onClick={() => setSettings((v) => !v)}
          >
            <Settings2 />
          </button>
        </section>
        {settings && (
          <section className="settings panel">
            <div>
              <h2>Connect TinyFish</h2>
              <p>
                {configured
                  ? "A server key is configured. You can override it for this session."
                  : "Use your TinyFish key to run live audits."}{" "}
                Search and Fetch are free. Browser verification uses Agent
                credits.
              </p>
            </div>
            <label>
              API key
              <input
                type="password"
                autoComplete="off"
                placeholder="TinyFish API key"
                value={key}
                onChange={(e) => setKey(e.target.value)}
              />
            </label>
            <small>
              Your key stays in this tab’s memory and is sent only to this app’s
              server for TinyFish requests. It is never saved in reports.
            </small>
            <a
              href="https://agent.tinyfish.ai/api-keys"
              target="_blank"
              rel="noreferrer"
            >
              Get a TinyFish key
            </a>
          </section>
        )}
        <form
          className="audit-form"
          onSubmit={(e) => {
            e.preventDefault();
            void run();
          }}
        >
          <label>
            Page URL
            <input
              required
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://yourwebsite.com/page"
              disabled={busy}
              maxLength={2048}
            />
          </label>
          <label>
            Target search query <span>optional</span>
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="What would your customers search for?"
              disabled={busy}
              maxLength={240}
            />
          </label>
          <button disabled={busy || !url.trim()}>
            {busy ? (
              <LoaderCircle className="spin" size={17} />
            ) : (
              <Radar size={17} />
            )}{" "}
            {busy ? "Auditing page" : "Run audit"}
          </button>
          <div className="form-footer">
            <label className="checkbox">
              <input
                type="checkbox"
                checked={deep}
                onChange={(e) => setDeep(e.target.checked)}
                disabled={busy}
              />{" "}
              Browser + AI recommendations <span>Agent credits</span>
            </label>
            <span>Fresh fetch · US / English search · Public pages</span>
          </div>
        </form>
        {!busy && !report && (
          <div className="examples">
            <span>TRY A LIVE PAGE</span>
            {examples.map((e) => (
              <button
                key={e.name}
                className="example"
                onClick={() => {
                  setUrl(e.url);
                  setQuery(e.query);
                }}
              >
                {e.name}
              </button>
            ))}
          </div>
        )}
        {error && (
          <div role="alert" className="error">
            <AlertTriangle size={20} />
            <div>{error}</div>
            <button
              aria-label="Dismiss error"
              className="icon-button"
              onClick={() => setError("")}
            >
              <X size={16} />
            </button>
          </div>
        )}
        {busy && (
          <section className="progress panel" aria-live="polite">
            <div className="section-heading">
              <h2>
                <LoaderCircle className="spin" size={21} /> Gathering live
                evidence
              </h2>
              <button
                className="secondary"
                onClick={() => abort.current?.abort()}
              >
                Stop audit
              </button>
            </div>
            <div className="pipeline">
              {["Search", "Fetch", ...(deep ? ["Agent"] : [])].map((e) => (
                <div
                  key={e}
                  className={
                    stages.some(
                      (s) => s.endpoint === e && s.status === "complete",
                    )
                      ? "done"
                      : ""
                  }
                >
                  <span>
                    {stages.some(
                      (s) => s.endpoint === e && s.status === "complete",
                    ) ? (
                      <Check size={16} />
                    ) : (
                      <LoaderCircle className="spin" size={16} />
                    )}
                  </span>
                  {e}
                </div>
              ))}
            </div>
            <p className="current-step">{log.at(-1) || "Starting audit…"}</p>
            {extraction && (
              <p className="extraction-live">
                Fetch extracted {extraction.words.toLocaleString()} words
                {extraction.title ? ` from “${extraction.title}”` : ""}.
              </p>
            )}
            {agentSteps.length > 0 && (
              <ol className="agent-steps">
                {agentSteps.slice(-6).map((s, i) => (
                  <li key={i}>{s}</li>
                ))}
              </ol>
            )}
            <small>
              Browser verification can take up to six minutes. An unavailable
              endpoint is reported explicitly.
            </small>
            <details>
              <summary>Activity log</summary>
              {log.map((l, i) => (
                <p key={i}>{l}</p>
              ))}
            </details>
          </section>
        )}
        {!busy && !report && (
          <>
            <div className="section-heading">
              <h2>One page. Three perspectives.</h2>
              <span>Evidence before advice</span>
            </div>
            <div className="perspectives">
              {[
                [
                  Search,
                  "01",
                  "Search visibility",
                  "Find your page in live results, see what Google shows vs what AI extracts, and compare the pages that outrank you.",
                ],
                [
                  ScanText,
                  "02",
                  "AI extraction",
                  "Read the exact text an AI fetch tool receives, the raw <head> it declares, and which AI crawlers robots.txt lets in.",
                ],
                [
                  MousePointer2,
                  "03",
                  "Browser verification",
                  "Open relevant page controls and check which sampled facts extraction leaves behind.",
                ],
              ].map(([Icon, n, t, d]) => {
                const I = Icon as typeof Search;
                return (
                  <article key={String(n)}>
                    <div className="card-top">
                      <I />
                      <span>{String(n)}</span>
                    </div>
                    <h3>{String(t)}</h3>
                    <p>{String(d)}</p>
                  </article>
                );
              })}
            </div>
            <div className="empty">
              <Radar size={42} />
              <h2>Your next fix starts with evidence.</h2>
              <p>
                Enter a public URL to build a fresh audit. Every finding
                connects a specific observation to a fix you can verify.
              </p>
              <span className="empty-meta">
                NO CANNED RESULTS. EVERY SCORE POINT SHOWS ITS EVIDENCE.
              </span>
            </div>
          </>
        )}
        {report && (
          <AuditReport
            running={busy}
            key={report.id}
            report={report}
            delta={delta}
            onRerun={() => {
              setUrl(report.url);
              setQuery(report.query);
              void run({ url: report.url, query: report.query });
            }}
          />
        )}
        <footer>
          SignalScope <span>Live evidence. Clear next steps.</span>
          <a href="https://docs.tinyfish.ai/" target="_blank" rel="noreferrer">
            TinyFish documentation
          </a>
        </footer>
      </main>
    </div>
  );
}


