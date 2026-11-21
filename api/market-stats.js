// GET /api/market-stats: the public market numbers (no listings). Cached at the edge for an hour.
import { json } from "./_market.js";

export default async function handler(req, res) {
  const r = await fetch(process.env.MARKET_STATS_URL);
  if (!r.ok) return json(res, 502, { error: "stats_unavailable" });
  res.setHeader("Cache-Control", "public, s-maxage=3600, stale-while-revalidate=86400");
  return json(res, 200, await r.json());
}
