// GET /api/market: the listings, for people who signed up (header x-market-token). 50 per page, no links, no broker names.
// Query: country, sector, tmin, tmax (turnover in EUR), ret=1 (retirement/succession only), earn=1 (states an earnings figure),
//        q (words in the activity), sort=turnover|newest, page.
import { json, verifyToken, snapshot } from "./_market.js";

const PAGE = 50;

export default async function handler(req, res) {
  const email = verifyToken(req.headers["x-market-token"]);
  if (!email) return json(res, 401, { error: "signin" });

  let snap;
  try { snap = await snapshot(); } catch (e) { console.error(e.message); return json(res, 502, { error: "unavailable" }); }

  const q = req.query || {};
  const tmin = Number(q.tmin) || 0, tmax = Number(q.tmax) || 0;
  const words = String(q.q || "").toLowerCase().split(/\s+/).filter(Boolean).slice(0, 6);
  // row: key, country, region, sector, activity, turnover_eur, ebitda_eur, figures, marked, reason, first_seen
  let rows = snap.rows.filter((r) =>
    (!q.country || r[1] === q.country) &&
    (!q.sector || r[3] === q.sector) &&
    (!tmin || (r[5] != null && r[5] >= tmin)) &&
    (!tmax || (r[5] != null && r[5] < tmax)) &&
    (q.ret !== "1" || r[9] === "Retirement / succession") &&
    (q.earn !== "1" || r[6] != null) &&
    (!words.length || words.every((w) => (r[4] + " " + r[2] + " " + r[3]).toLowerCase().includes(w)))
  );
  if (q.sort === "newest") rows.sort((a, b) => (b[10] || "").localeCompare(a[10] || ""));
  else rows.sort((a, b) => (b[5] ?? -1) - (a[5] ?? -1));

  const total = rows.length, pages = Math.max(1, Math.ceil(total / PAGE));
  const page = Math.min(Math.max(1, parseInt(q.page) || 1), pages);
  const out = rows.slice((page - 1) * PAGE, page * PAGE).map((r) => ({
    key: r[0], country: r[1], region: r[2], sector: r[3], activity: r[4], figures: r[7], marked: !!r[8], reason: r[9], first_seen: r[10]
  }));
  res.setHeader("Cache-Control", "private, no-store");
  return json(res, 200, { total, page, pages, as_of: snap.stats.as_of, rows: out });
}
