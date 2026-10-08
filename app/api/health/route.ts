export async function GET() {
  return Response.json(
    { configured: !!process.env.TINYFISH_API_KEY },
    { headers: { "Cache-Control": "no-store" } },
  );
}
