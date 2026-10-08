import type { Audit } from "./audit-model.ts";

const cell = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""').replace(/\r?\n/g, " ")}"`;

export function findingsCsv(a: Audit): string {
  const rows = [
    ["id", "priority", "category", "title", "evidence", "impact", "fix", "verify", "source", "confidence"],
    ...a.findings.map((f) => [f.id, f.priority, f.category, f.title, f.evidence, f.impact, f.fix, f.verify, f.source, f.confidence]),
    ...(a.browser?.recommendations || []).map((r) => [r.id, r.priority, r.category, r.title, r.evidence.quote, r.why, r.action + (r.suggestedCopy ? " | Suggested copy: " + r.suggestedCopy : ""), r.verification, r.evidence.url, r.evidence.validation]),
  ];
  return "﻿" + rows.map((r) => r.map(cell).join(",")).join("\r\n");
}
