import type { Audit } from "./audit-model.ts";

/** Stateless sharing: the whole report travels in the URL fragment (never sent to a server). */
const MAX_BYTES = 100 * 1024;

function toBase64Url(bytes: Uint8Array) {
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000)
    bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function fromBase64Url(s: string) {
  const b = atob(s.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (s.length % 4)) % 4));
  return Uint8Array.from(b, (c) => c.charCodeAt(0));
}
async function pipe(bytes: Uint8Array, stream: CompressionStream | DecompressionStream) {
  const out = new Blob([bytes as BlobPart]).stream().pipeThrough(stream);
  return new Uint8Array(await new Response(out).arrayBuffer());
}

/** Drop bulky raw text so the link stays shareable; the report keeps every finding and metric. */
export function slimAudit(a: Audit): Audit {
  const slimPage = (p: Audit["page"]) => (p ? { ...p, text: p.text.slice(0, 1200) + (p.text.length > 1200 ? "\n…[trimmed for sharing]" : ""), links: [] } : p);
  return {
    ...a,
    page: slimPage(a.page),
    competitor: slimPage(a.competitor),
    competitors: a.competitors?.map((c) => ({ ...c, text: undefined })),
    headAudit: a.headAudit ? { ...a.headAudit, headings: a.headAudit.headings.slice(0, 25) } : a.headAudit,
    crawlPolicy: a.crawlPolicy ? { ...a.crawlPolicy, robots: { ...a.crawlPolicy.robots, excerpt: a.crawlPolicy.robots.excerpt.slice(0, 300) }, llms: { ...a.crawlPolicy.llms, excerpt: "" } } : a.crawlPolicy,
    shared: true,
  };
}

export async function encodeAudit(a: Audit): Promise<{ data: string; slimmed: boolean }> {
  const enc = new TextEncoder();
  let slimmed = false;
  let bytes = await pipe(enc.encode(JSON.stringify(a)), new CompressionStream("deflate-raw"));
  if (bytes.length > MAX_BYTES) {
    slimmed = true;
    bytes = await pipe(enc.encode(JSON.stringify(slimAudit(a))), new CompressionStream("deflate-raw"));
  }
  return { data: toBase64Url(bytes), slimmed };
}
export async function decodeAudit(data: string): Promise<Audit> {
  const bytes = await pipe(fromBase64Url(data), new DecompressionStream("deflate-raw"));
  const parsed = JSON.parse(new TextDecoder().decode(bytes));
  if (!parsed || typeof parsed !== "object" || typeof parsed.url !== "string" || !Array.isArray(parsed.findings))
    throw new Error("This link does not contain a valid SignalScope report.");
  return parsed as Audit;
}
