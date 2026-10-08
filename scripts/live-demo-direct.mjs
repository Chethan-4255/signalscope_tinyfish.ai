// Collects fresh live evidence into demo-evidence/ by running the real pipeline.
// Usage: node --env-file=.env.local scripts/live-demo-direct.mjs [name] [--deep]
// This spends TinyFish credits (Agent only when --deep is passed).
import { runAudit } from "../lib/tinyfish-audit.ts";
import { mkdir, writeFile } from "node:fs/promises";

const pages = [
  ["tinyfish-quick-start", "https://docs.tinyfish.ai/quick-start", "tinyfish quick start"],
  ["firstrole", "https://firstrole-tinyfish-ai.vercel.app/", "live job finder for students"],
  ["linear-pricing", "https://linear.app/pricing", "linear pricing"],
];
if (!process.env.TINYFISH_API_KEY) throw new Error("Set TINYFISH_API_KEY first.");
const deep = process.argv.includes("--deep");
const only = process.argv.slice(2).find((a) => !a.startsWith("--"));
await mkdir("demo-evidence", { recursive: true });
for (const [name, url, query] of pages.filter((p) => !only || p[0] === only)) {
  console.log(`LIVE ${name}: ${url} (deep=${deep})`);
  const report = await runAudit(
    { url, query, deep },
    process.env.TINYFISH_API_KEY,
    (e) => {
      if (e.type === "stage") console.log(JSON.stringify(e.stage));
    },
    AbortSignal.timeout(420000),
  );
  await writeFile(`demo-evidence/${name}.json`, JSON.stringify(report, null, 2));
  console.log(
    JSON.stringify({
      name,
      score: report.score.total,
      grade: report.score.grade,
      rank: report.metrics.rank,
      words: report.metrics.words,
      answerCoverage: report.answer?.coverage ?? null,
      findings: report.findings.map((f) => f.title),
      recommendations: report.browser?.recommendations?.map((r) => r.title),
    }),
  );
}
