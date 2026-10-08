import { runAudit } from "../../../lib/tinyfish-audit";
import { publicUrl } from "../../../lib/audit-model";

// Vercel: allow long-running streams (Agent runs can take several minutes).
export const maxDuration = 300;
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin)
    return Response.json(
      { error: "Cross-origin requests are not accepted." },
      { status: 403 },
    );
  let input;
  try {
    const body = await request.text();
    if (body.length > 5000) throw new Error("Request too large.");
    input = JSON.parse(body);
    if (typeof input.url !== "string" || input.url.length > 2048)
      throw new Error("Enter a page URL.");
    input.url = publicUrl(input.url);
    if (
      input.query !== undefined &&
      (typeof input.query !== "string" || input.query.length > 240)
    )
      throw new Error("Search query must be at most 240 characters.");
    if (input.deep !== undefined && typeof input.deep !== "boolean")
      throw new Error("Invalid audit mode.");
  } catch (e) {
    return Response.json(
      { error: e instanceof Error ? e.message : "Invalid request." },
      { status: 400 },
    );
  }
  const supplied =
    request.headers.get("x-tinyfish-key") ||
    request.headers.get("x-tinyfish-api-key");
  const key = supplied || process.env.TINYFISH_API_KEY;
  if (!key)
    return Response.json(
      {
        error:
          "Add your TinyFish API key in Connection settings to run a live audit.",
      },
      { status: 428 },
    );
  const lifecycle = new AbortController();
  const signal = AbortSignal.any([request.signal, lifecycle.signal]);
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      let open = true;
      const send = (data: Record<string, unknown>) => {
        if (open)
          try {
            controller.enqueue(encoder.encode(JSON.stringify(data) + "\n"));
          } catch {
            open = false;
          }
      };
      try {
        const report = await runAudit(input, key, send, signal);
        send({ type: "result", report });
      } catch {
        send({
          type: "error",
          message: request.signal.aborted
            ? "Audit cancelled."
            : "The audit could not finish. Please retry; no report was fabricated.",
        });
      } finally {
        if (open) controller.close();
      }
    },
    cancel() {
      lifecycle.abort();
    },
  });
  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
