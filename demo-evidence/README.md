# Live demo evidence

These files are recorded live TinyFish runs made with the final pipeline on 2026-10-09 through the app's own `/api/audit` route, never fixtures used by the application. Each JSON is the complete `Audit` object the UI renders: timestamp, URL, query, every endpoint call with its duration (`stages`), the raw search results, the Fetch extraction, the parsed `<head>`, the crawler policy table, competitor comparison, score breakdown and findings. Results will vary on rerun; search positions are a US/English sample at audit time.

| Run | Query | Score | What it demonstrates |
| --- | --- | --- | --- |
| `tinyfish-quick-start.json` | tinyfish quick start | 87/100 (A) | A healthy docs page: #1 for both phrasings, indexed, 1,330 words extracted, robots.txt allows all 14 AI crawlers, llms.txt mentions the page, sitemap lists it. Remaining fixes are specific: the SERP snippet never mentions the query, no JSON-LD, 56-char description. |
| `firstrole.json` | live job finder for students | 34/100 (F) | A client-rendered landing page that looks fine in a browser but is nearly invisible to AI: 64 words reach the extractor, best passage covers 25% of the query, not in the top 10 while 3 competitors are fetched and compared, no OG / JSON-LD / sitemap / robots. |
| `linear-pricing.json` | linear pricing | 81/100 (B) | Deep run with the Agent: 8 live calls including a 219 s browser session. 4 facts sampled, 2 verbatim-matched against Fetch, 3 AI recommendations proposed of which 2 passed quote validation and 1 was rejected. Deterministic findings: only 29% prose (pricing cards + nav), no JSON-LD, skipped heading level. The 6 Agent step purposes are recorded in `browser.steps`. |

The Linear file's search / fetch / head / crawl / browser evidence is from one live run; its `findings`, `score` and `summary` were recomputed from that stored evidence by the pure `analyze()` after a final tweak to passage selection, so the numbers match the committed code.

Regenerate with `npm run demo` (add `--deep` to include the Agent; this spends TinyFish credits). You can also export the JSON of any audit from the report's **JSON** button.
